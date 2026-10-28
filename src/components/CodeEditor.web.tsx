/**
 * The web host: `@uiw/react-codemirror` (4.25.11) over CodeMirror 6.
 *
 * Same contract as the Android host (`CodeEditor.native.tsx`), same rule -- read the header of
 * `CodeEditor.tsx` for the anti-loop rule and the `keepHistory` semantics, both of which are
 * implemented here too, not delegated to the wrapper:
 *
 * - `@uiw/react-codemirror` keeps its own `value` prop sync (it compares the prop against the
 *   live document). That is the same idea, but it always preserves history and it lets the
 *   wrapper decide when a replacement happens. So the wrapper is given the value *at mount* and
 *   never a moving one: this host owns every write after that, through `writeDocument`.
 * - `history` is a compartment of ours rather than part of their `basicSetup`, because emptying
 *   an undo stack in CodeMirror 6 means taking the history field out of the configuration and
 *   putting a fresh one back (there has been no clear-history effect since
 *   `@codemirror/commands` 6.7). Their simple value sync would keep the stack, and an undo in a
 *   freshly opened file would then replay the previous file's edits into it.
 *
 * The two Android fixes in `codeeditor/page.ts` (`drawSelection` off, `EditContext` off) are
 * deliberately NOT applied here: they exist for the Android IME reading the native caret, and on
 * desktop Chrome the drawn selection is what a user expects.
 */
import { history, historyKeymap, redo, undo } from '@codemirror/commands';
import { Compartment, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror, { ExternalChange } from '@uiw/react-codemirror';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { shouldReplaceDocument } from './codeeditor/document';
import { DEFAULT_EDITOR_FONT_SIZE } from './codeeditor/protocol';
import { languageExtension } from './codeeditor/languages';
import type { CodeEditorHandle, CodeEditorProps } from './CodeEditor';

/** Their `basicSetup` minus the two pieces this host composes itself. */
const BASIC_SETUP = { history: false, historyKeymap: false };

export function CodeEditor({
  value,
  language = null,
  readOnly = false,
  dark,
  fontSize,
  onReady,
  onChange,
  onCursor,
  onError,
}: CodeEditorProps): React.JSX.Element {
  const theme = useTheme();
  const isDark = dark ?? theme.dark;
  const size = fontSize ?? DEFAULT_EDITOR_FONT_SIZE;

  const historyCompartment = useMemo(() => new Compartment(), []);
  const viewRef = useRef<EditorView | null>(null);
  const [mounted, setMounted] = useState(false);
  const [editorLanguage, setEditorLanguage] = useState<string | null>(language);
  const [editorFontSize, setEditorFontSize] = useState<number>(size);
  /** What the document holds, as far as this host knows. Step 1 and 2 of the rule. */
  const documentValue = useRef<string | null>(null);
  /** The value at mount: the only value the wrapper is ever given (see the header). */
  const initialValue = useRef(value);
  const callbacks = useRef({ onReady, onChange, onCursor, onError });
  callbacks.current = { onReady, onChange, onCursor, onError };

  useEffect(() => {
    setEditorLanguage(language);
  }, [language]);
  useEffect(() => {
    setEditorFontSize(size);
  }, [size]);

  /**
   * Write the whole document. `keepHistory: false` swaps the history field as described in the
   * header; both writes carry `ExternalChange` so the wrapper does not report them as typing --
   * the page would otherwise mark a file dirty by the act of opening it.
   */
  const writeDocument = useCallback(
    (view: EditorView, next: string, keepHistory: boolean): void => {
      documentValue.current = next;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: 0 },
        effects: keepHistory
          ? []
          : [
              historyCompartment.reconfigure([]),
              historyCompartment.reconfigure([history()]),
            ],
        annotations: keepHistory
          ? [ExternalChange.of(true)]
          : [ExternalChange.of(true), Transaction.addToHistory.of(false)],
      });
    },
    [historyCompartment],
  );

  const handle = useMemo<CodeEditorHandle>(
    () => ({
      async getValue() {
        const view = viewRef.current;
        return view === null
          ? (documentValue.current ?? '')
          : view.state.doc.toString();
      },
      async setValue(next, options) {
        const view = viewRef.current;
        if (view === null) {
          documentValue.current = next;
          return;
        }
        writeDocument(view, next, options?.keepHistory ?? false);
      },
      async focus() {
        viewRef.current?.focus();
      },
      async scrollToCursor() {
        const view = viewRef.current;
        if (view === null) return;
        view.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, {
            y: 'center',
          }),
        });
      },
      async undo() {
        const view = viewRef.current;
        if (view !== null) undo(view);
      },
      async redo() {
        const view = viewRef.current;
        if (view !== null) redo(view);
      },
      async setLanguage(next) {
        setEditorLanguage(next);
      },
      async setFontSize(next) {
        setEditorFontSize(next);
      },
    }),
    [writeDocument],
  );

  useEffect(() => {
    if (mounted) callbacks.current.onReady?.(handle);
  }, [mounted, handle]);

  // Step 2 of the rule: a prop that is not our own echo replaces the document, history included.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    if (!shouldReplaceDocument(value, documentValue.current)) return;
    try {
      writeDocument(view, value, false);
    } catch (error) {
      callbacks.current.onError?.(error);
    }
  }, [mounted, value, writeDocument]);

  const extensions = useMemo<Extension[]>(
    () => [
      historyCompartment.of(history()),
      keymap.of(historyKeymap),
      languageExtension(editorLanguage),
      // The reader fills the box it was given and scrolls inside it. Without the explicit
      // height the CodeMirror root keeps its natural height, so a long file grew a
      // 6000px-tall element inside an 800px pane: the text then ran off the bottom of the
      // window and dragged the whole page with it (owner, 2026-10-28).
      EditorView.theme({
        '&': { fontSize: `${editorFontSize}px`, height: '100%', minHeight: '0' },
        '.cm-scroller': { overflow: 'auto' },
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged || update.selectionSet) {
          // 1-based, the line shape the header shows.
          callbacks.current.onCursor?.(
            update.state.doc.lineAt(update.state.selection.main.head).number,
          );
        }
      }),
    ],
    [historyCompartment, editorLanguage, editorFontSize],
  );

  const onCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
    documentValue.current = initialValue.current;
    setMounted(true);
  }, []);

  return (
    <View style={styles.container}>
      <CodeMirror
        value={initialValue.current}
        theme={isDark ? 'dark' : 'light'}
        basicSetup={BASIC_SETUP}
        readOnly={readOnly}
        editable={!readOnly}
        extensions={extensions}
        style={styles.editor}
        onChange={next => {
          documentValue.current = next;
          callbacks.current.onChange?.(next);
        }}
        onCreateEditor={onCreateEditor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  // A plain DOM node inside the wrapper: fill whatever the page gave us.
  editor: { flex: 1, height: '100%', minHeight: 0 },
});

export default CodeEditor;
