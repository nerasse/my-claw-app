/// <reference lib="dom" />
/**
 * The editor page: CodeMirror 6 inside the Android WebView, and the RPC back to the host.
 *
 * It is bundled to a single self-contained HTML file (`assets/codeditor/index.html`, built by
 * `scripts/build-codeditor.js`) and loaded over `file:///android_asset/`, so the page needs no
 * network, no asset registry and no second XHR: everything CodeMirror needs is inlined.
 *
 * Two Android fixes are load-bearing, and they are the reason this page is ours rather than a
 * packaged one -- both are the fixes the `@actualwave/react-native-codeditor` README documents
 * from the field (it is a 14-downloads-a-week package we evaluated and dropped):
 *
 * 1. **No `drawSelection()`.** CodeMirror's custom selection layer hides the native caret, and
 *    Android's IME tracks that native caret to know where to insert. Without it, characters land
 *    after the cursor while typing fast. Omitting it keeps the browser caret visible.
 * 2. **`EditorView.EDIT_CONTEXT = false` before the view is constructed.** Chrome 126+
 *    activates the EditContext API, and in Chrome 147 its `textupdate` events can outrun
 *    CodeMirror's own `updateText`/`updateSelection`, again placing characters after the cursor.
 *    Disabling it falls back to the contenteditable + MutationObserver path, which is stable at
 *    any typing speed when `drawSelection()` is omitted.
 *
 * The host owns the keyboard: the WebView container lifts itself by what the keyboard covers
 * (see `CodeEditor.native.tsx`), the page only keeps the caret visible when the selection moves
 * or its viewport shrinks, which is what `keepCursorVisible` is for.
 */
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from '@codemirror/view';
import { DEFAULT_EDITOR_FONT_SIZE } from './protocol';
import type {
  EditorConfigPatch,
  EditorEvent,
  EditorInit,
  EditorRequest,
} from './protocol';
import { languageExtension } from './languages';

/**
 * How long typing settles before the full document crosses the bridge. Every keystroke would
 * mean a JSON string of the whole file; the host's `onChange` is a dirty flag, not a keystroke
 * feed, so a short window costs nothing and a large file a lot.
 */
const CHANGE_DEBOUNCE_MS = 150;

/** oneDark's canvas and the stock white, so the flash before first paint matches what follows. */
const DARK_BACKGROUND = '#282c34';
const LIGHT_BACKGROUND = '#ffffff';

type ClawEditor = {
  init(config: EditorInit): void;
  request(request: EditorRequest): void;
};

declare global {
  interface Window {
    __clawEditor?: ClawEditor;
    ReactNativeWebView?: { postMessage(data: string): void };
  }
}

let config: EditorInit = {
  value: '',
  language: null,
  readOnly: false,
  dark: false,
  fontSize: DEFAULT_EDITOR_FONT_SIZE,
};
let view: EditorView | null = null;
let changeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Marks the transactions this page writes itself, so they are not reported as typing: the host
 * would otherwise see its own replacement as a user edit and the page's dirty flag would be set
 * by the act of opening a file. Same convention as `ExternalChange` in @uiw/react-codemirror.
 */
const External = Annotation.define<boolean>();

// Compartments: what `configure` swaps on a live editor without rebuilding its state. `history`
// is one too, because emptying an undo stack means taking the extension out and putting a fresh
// one back in (see `setDocument`).
const historyCompartment = new Compartment();
const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const themeCompartment = new Compartment();
const fontSizeCompartment = new Compartment();

function post(event: EditorEvent): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(event));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Both halves of read-only: the facet refuses commands and transactions, `editable` takes the
 * caret and the soft keyboard away so the user is not invited to type into a wall.
 */
function readOnlyExtensions(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function fontSizeExtension(size: number): Extension {
  return EditorView.theme({ '&': { fontSize: `${size}px` } });
}

function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    historyCompartment.of(history()),
    indentOnInput(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    // No drawSelection(): see the header. The native caret is what the IME reads.
    languageCompartment.of(languageExtension(config.language)),
    readOnlyCompartment.of(readOnlyExtensions(config.readOnly)),
    themeCompartment.of(config.dark ? oneDark : []),
    fontSizeCompartment.of(fontSizeExtension(config.fontSize)),
    EditorView.updateListener.of(onUpdate),
  ];
}

function onUpdate(update: ViewUpdate): void {
  // Ours, not the user's writing: see `External`.
  if (
    update.docChanged &&
    !update.transactions.some(tr => tr.annotation(External))
  ) {
    scheduleChange();
  }
  if (update.docChanged || update.selectionSet) {
    post({
      type: 'cursor',
      line: update.state.doc.lineAt(update.state.selection.main.head).number,
    });
    keepCursorVisible();
  }
}

/**
 * The caret must never sit under the keyboard: the host lifts the container (so the viewport
 * itself shrinks) and this puts the caret back in view a frame later. Not inside the update
 * listener -- CodeMirror refuses a dispatch while an update is in progress.
 */
function keepCursorVisible(): void {
  window.requestAnimationFrame(() => {
    if (view === null) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main.head, {
        y: 'nearest',
        yMargin: 24,
      }),
    });
  });
}

function scheduleChange(): void {
  if (changeTimer !== null) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    changeTimer = null;
    if (view !== null)
      post({ type: 'change', value: view.state.doc.toString() });
  }, CHANGE_DEBOUNCE_MS);
}

/**
 * Replace the whole document.
 *
 * `keepHistory: false` empties the undo stack, and CodeMirror 6 has no effect for that (the old
 * `clearHistory` was removed in @codemirror/commands 6.7): the history field is taken out of the
 * configuration and a fresh one is put back in the same transaction, which re-initializes it
 * empty. `Transaction.addToHistory.of(false)` would only keep *this* change out of the stack,
 * and a stack that survives a file switch replays the previous file's edits into the newly
 * opened one on the first undo -- how an editor silently writes file A's content into file B.
 */
function setDocument(value: string, keepHistory: boolean): void {
  if (view === null) {
    config = { ...config, value };
    return;
  }
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: { anchor: 0 },
    effects: keepHistory
      ? []
      : [
          historyCompartment.reconfigure([]),
          historyCompartment.reconfigure([history()]),
        ],
    annotations: keepHistory
      ? [External.of(true)]
      : [External.of(true), Transaction.addToHistory.of(false)],
  });
}

function configure(patch: EditorConfigPatch): void {
  const previous = config;
  config = {
    value: config.value,
    language: patch.language === undefined ? previous.language : patch.language,
    readOnly: patch.readOnly === undefined ? previous.readOnly : patch.readOnly,
    dark: patch.dark === undefined ? previous.dark : patch.dark,
    fontSize: patch.fontSize === undefined ? previous.fontSize : patch.fontSize,
  };
  if (view === null) return;
  if (config.language !== previous.language) {
    view.dispatch({
      effects: languageCompartment.reconfigure(
        languageExtension(config.language),
      ),
    });
  }
  if (config.readOnly !== previous.readOnly) {
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(
        readOnlyExtensions(config.readOnly),
      ),
    });
  }
  if (config.dark !== previous.dark) {
    view.dispatch({
      effects: themeCompartment.reconfigure(config.dark ? oneDark : []),
    });
    paintBackground();
  }
  if (config.fontSize !== previous.fontSize) {
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(
        fontSizeExtension(config.fontSize),
      ),
    });
  }
}

function paintBackground(): void {
  const background = config.dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  document.documentElement.style.backgroundColor = background;
  document.body.style.backgroundColor = background;
}

function respond(id: number, result: unknown): void {
  post({ type: 'response', id, result });
}

/**
 * One request, one response carrying the same id. Anything that throws answers with the error
 * rather than leaving the host's promise to time out silently.
 *
 * An unknown method falls through with no answer on purpose: a page and a host that disagree
 * about the protocol is a deployment bug, and the host's timeout names the method it was waiting
 * on. Ignoring it loudly beats crashing the editor for a user who just wanted to save.
 */
function handleRequest(request: EditorRequest): void {
  try {
    switch (request.method) {
      case 'getValue':
        respond(
          request.id,
          view !== null ? view.state.doc.toString() : config.value,
        );
        return;
      case 'setValue':
        setDocument(request.value, request.keepHistory);
        respond(request.id, null);
        return;
      case 'configure':
        configure(request.patch);
        respond(request.id, null);
        return;
      case 'focus':
        view?.focus();
        respond(request.id, null);
        return;
      case 'scrollToCursor':
        if (view !== null) {
          view.dispatch({
            effects: EditorView.scrollIntoView(view.state.selection.main.head, {
              y: 'center',
            }),
          });
        }
        respond(request.id, null);
        return;
      case 'undo':
        respond(request.id, view !== null ? undo(view) : false);
        return;
      case 'redo':
        respond(request.id, view !== null ? redo(view) : false);
        return;
    }
  } catch (error) {
    post({ type: 'response', id: request.id, error: messageOf(error) });
  }
}

function init(initial: EditorInit): void {
  config = { ...initial };
  // Before the view exists, or the EditContext path is already active (see the header). The
  // static is read by the view's DOM observer as `view.constructor.EDIT_CONTEXT`; the shipped
  // typings do not declare it, so the cast is the only way in.
  (EditorView as unknown as { EDIT_CONTEXT: boolean }).EDIT_CONTEXT = false;
  view = new EditorView({
    state: EditorState.create({
      doc: config.value,
      extensions: buildExtensions(),
    }),
    parent: document.body,
  });
  paintBackground();
  post({ type: 'initialized' });
}

try {
  window.__clawEditor = { init, request: handleRequest };
  // Chrome reports uncaught errors here instead of through postMessage; the host turns them into
  // `onError`, which is the only channel a user can be told through.
  window.addEventListener('error', event =>
    post({ type: 'error', message: event.message || 'script error' }),
  );
  window.addEventListener('unhandledrejection', event =>
    post({ type: 'error', message: messageOf(event.reason) }),
  );
  // The host lifts the container when the keyboard appears, which shows up here as a resize.
  window.addEventListener('resize', () => keepCursorVisible());
  post({ type: 'ready' });
} catch (error) {
  post({ type: 'error', message: `codeditor bootstrap: ${messageOf(error)}` });
}
