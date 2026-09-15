/**
 * The Android host: a WebView running the bundled CodeMirror page (`assets/codeditor/index.html`,
 * built by `scripts/build-codeditor.js`), the RPC on top of `injectJavaScript`/`postMessage`, and
 * the keyboard discipline this app writes down in `docs/keyboard-avoidance.md`.
 *
 * iOS is not a target of this app (the release pipeline ships an APK and a web bundle), so the
 * asset URI is the Android one and nothing here branches on the platform.
 *
 * The anti-loop rule lives here too -- the `documentValue` ref and the `value` effect; read the
 * header of `CodeEditor.tsx` before changing either. The short version: this host remembers the
 * last value it reported through `onChange`, and a `value` prop that matches it is that same
 * value coming back and must not touch the document. A prop that does *not* match is an external
 * replacement -- another file opened -- and is applied with `keepHistory: false` so an undo in
 * the new file cannot replay the old file's edits over it.
 *
 * The keyboard: the editor does not handle it, and that is deliberate. This page lives inside the
 * shell's `KeyboardAvoidingView`, which already shrinks every page it holds by what the keyboard
 * covers (AGENTS.md: only the sheets, which sit outside it, pad themselves). Padding here as well
 * made the editor a second owner of the same inset, measured against a frame that view had not
 * moved yet, and the WebView was resized by the sum -- after which it drew nothing until something
 * else forced a repaint. The shrink now reaches the page as a plain resize, which is where
 * `page.ts` keeps the caret in view.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../theme';
import { shouldReplaceDocument } from './codeeditor/document';
import { DEFAULT_EDITOR_FONT_SIZE } from './codeeditor/protocol';
import { parseEditorEvent } from './codeeditor/protocol';
import type { CodeEditorHandle, CodeEditorProps } from './CodeEditor';
import type {
  EditorConfigPatch,
  EditorInit,
  EditorRequestPayload,
} from './codeeditor/protocol';

/** Where the Gradle `copyCodeditorAssets` task puts the page (android/app/build.gradle). */
const EDITOR_URI = 'file:///android_asset/codeditor/index.html';

/** The page's canvas, so the wait before first paint is not a white flash in a dark room. */
const LIGHT_BACKGROUND = '#ffffff';
const DARK_BACKGROUND = '#282c34';

/** A request the page never answers is a bug, not a wait: `getValue` on a dead WebView must fail. */
const REQUEST_TIMEOUT_MS = 8000;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * The shipped typings declare `class WebView<P = undefined> extends Component<WebViewProps & P>`,
 * and `WebViewProps & undefined` collapses to `never`: without an explicit type argument JSX
 * rejects every prop. `object` intersects to nothing, which is what the default was meant to be.
 */
type EditorWebViewInstance = WebView<object>;

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
  // The page did not say: follow the app, which is what a file opened from a themed screen wants.
  const isDark = dark ?? theme.dark;
  const size = fontSize ?? DEFAULT_EDITOR_FONT_SIZE;

  const webView = useRef<EditorWebViewInstance | null>(null);
  const [initialized, setInitialized] = useState(false);

  /**
   * What the document holds, as far as this host knows: the last value it raised through
   * `onChange` or wrote itself. Step 1 and 2 of the anti-loop rule are this ref.
   */
  const documentValue = useRef<string | null>(null);
  /** The last language/readOnly/dark/fontSize the page was told, so a prop change sends a diff. */
  const pushedConfig = useRef<EditorConfigPatch>({});
  /** The page has built its editor. Read by imperative code; the state below drives re-renders. */
  const initializedRef = useRef(false);
  const nextRequestId = useRef(0);
  const pending = useRef(new Map<number, Pending>());
  const readyOnce = useRef(false);

  // Latest props and callbacks for the RPC handlers, which outlive a render (the WebView keeps
  // calling one `onMessage` for the life of the page).
  const props = useRef({
    value,
    language,
    readOnly,
    dark: isDark,
    fontSize: size,
  });
  props.current = { value, language, readOnly, dark: isDark, fontSize: size };
  const callbacks = useRef({ onReady, onChange, onCursor, onError });
  callbacks.current = { onReady, onChange, onCursor, onError };

  const fail = useCallback((error: unknown) => {
    callbacks.current.onError?.(error);
  }, []);

  const inject = useCallback((code: string) => {
    // Trailing `true;` so the injected script evaluates to a value on iOS; Android ignores it.
    webView.current?.injectJavaScript(`${code}; true;`);
  }, []);

  const request = useCallback(
    <T,>(payload: EditorRequestPayload): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        if (!initializedRef.current) {
          reject(
            new Error(
              `codeditor: ${payload.method} asked before the editor was ready`,
            ),
          );
          return;
        }
        const id = ++nextRequestId.current;
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(
            new Error(
              `codeditor: no answer to ${payload.method} within ${REQUEST_TIMEOUT_MS} ms`,
            ),
          );
        }, REQUEST_TIMEOUT_MS);
        pending.current.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
        });
        inject(
          `window.__clawEditor && window.__clawEditor.request(${JSON.stringify({
            ...payload,
            id,
          })})`,
        );
      });
    },
    [inject],
  );

  /**
   * Write the whole document, and move the record first: the page's `change` event (and any prop
   * echo of the new value) must recognise this write as ours rather than as an external edit.
   * A write that times out leaves the record ahead of the document until the next `change` event
   * corrects it -- optimistic on purpose, because the alternative is a page whose save button
   * writes back a document the editor never showed.
   */
  const writeDocument = useCallback(
    (next: string, keepHistory: boolean): Promise<void> => {
      documentValue.current = next;
      return request<void>({ method: 'setValue', value: next, keepHistory });
    },
    [request],
  );

  /** Send the fields that changed since the page was last told, and remember them. */
  const pushConfig = useCallback(
    (patch: EditorConfigPatch): Promise<void> => {
      if (!initializedRef.current) return Promise.resolve();
      const changed: EditorConfigPatch = {};
      if (
        patch.language !== undefined &&
        patch.language !== pushedConfig.current.language
      ) {
        changed.language = patch.language;
      }
      if (
        patch.readOnly !== undefined &&
        patch.readOnly !== pushedConfig.current.readOnly
      ) {
        changed.readOnly = patch.readOnly;
      }
      if (
        patch.dark !== undefined &&
        patch.dark !== pushedConfig.current.dark
      ) {
        changed.dark = patch.dark;
      }
      if (
        patch.fontSize !== undefined &&
        patch.fontSize !== pushedConfig.current.fontSize
      ) {
        changed.fontSize = patch.fontSize;
      }
      if (Object.keys(changed).length === 0) return Promise.resolve();
      pushedConfig.current = { ...pushedConfig.current, ...changed };
      return request<void>({ method: 'configure', patch: changed });
    },
    [request],
  );

  const handle = useMemo<CodeEditorHandle>(
    () => ({
      getValue: () => request<string>({ method: 'getValue' }),
      setValue: (next, options) =>
        writeDocument(next, options?.keepHistory ?? false),
      focus: () => request<void>({ method: 'focus' }),
      scrollToCursor: () => request<void>({ method: 'scrollToCursor' }),
      undo: () => request<void>({ method: 'undo' }),
      redo: () => request<void>({ method: 'redo' }),
      setLanguage: next => pushConfig({ language: next }),
      setFontSize: next => pushConfig({ fontSize: next }),
    }),
    [request, writeDocument, pushConfig],
  );
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      // A whitelist: anything this host does not recognise is dropped, not walked into.
      const message = parseEditorEvent(event.nativeEvent.data);
      if (message === null) return;
      switch (message.type) {
        case 'ready': {
          const initial: EditorInit = {
            value: props.current.value,
            language: props.current.language,
            readOnly: props.current.readOnly,
            dark: props.current.dark,
            fontSize: props.current.fontSize,
          };
          documentValue.current = initial.value;
          pushedConfig.current = {
            language: initial.language,
            readOnly: initial.readOnly,
            dark: initial.dark,
            fontSize: initial.fontSize,
          };
          inject(
            `window.__clawEditor && window.__clawEditor.init(${JSON.stringify(initial)})`,
          );
          return;
        }
        case 'initialized':
          initializedRef.current = true;
          setInitialized(true);
          if (!readyOnce.current) {
            readyOnce.current = true;
            callbacks.current.onReady?.(handleRef.current);
          }
          return;
        case 'change':
          documentValue.current = message.value;
          callbacks.current.onChange?.(message.value);
          return;
        case 'cursor':
          callbacks.current.onCursor?.(message.line);
          return;
        case 'error':
          fail(new Error(`codeditor: ${message.message}`));
          return;
        case 'response': {
          const entry = pending.current.get(message.id);
          if (entry === undefined) return;
          pending.current.delete(message.id);
          clearTimeout(entry.timer);
          if ('error' in message)
            entry.reject(new Error(`codeditor: ${message.error}`));
          else entry.resolve(message.result);
          return;
        }
      }
    },
    [fail, inject],
  );

  // Step 2 of the rule. `initialized` is a dependency so a prop that moved while the WebView was
  // still loading is applied the moment the editor exists.
  useEffect(() => {
    if (!initialized) return;
    if (!shouldReplaceDocument(value, documentValue.current)) return;
    writeDocument(value, false).catch(fail);
  }, [initialized, value, writeDocument, fail]);

  // `initialized` is a dependency for the same reason as above: a prop that moved while the
  // WebView was loading is re-checked the moment the editor exists (the init payload carried the
  // values read at `ready`, which may be a render behind).
  useEffect(() => {
    pushConfig({ language }).catch(fail);
  }, [initialized, language, pushConfig, fail]);
  useEffect(() => {
    pushConfig({ readOnly }).catch(fail);
  }, [initialized, readOnly, pushConfig, fail]);
  useEffect(() => {
    pushConfig({ dark: isDark }).catch(fail);
  }, [initialized, isDark, pushConfig, fail]);
  useEffect(() => {
    pushConfig({ fontSize: size }).catch(fail);
  }, [initialized, size, pushConfig, fail]);

  // A request in flight when the page is closed has nobody left to answer it: settle it and drop
  // its timer, or an 8 s handle outlives the component it belonged to.
  useEffect(() => {
    const inFlight = pending.current;
    return () => {
      for (const [id, entry] of inFlight) {
        clearTimeout(entry.timer);
        entry.reject(new Error('codeditor: the editor was unmounted'));
        inFlight.delete(id);
      }
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? DARK_BACKGROUND : LIGHT_BACKGROUND }]}>
      <WebView<object>
        ref={webView}
        source={{ uri: EDITOR_URI }}
        style={styles.webView}
        originWhitelist={['file://*', 'about:*']}
        // The page is ours and local: read access for the main asset, but no file-to-file or
        // universal access, which a page that never fetches anything does not need.
        allowFileAccess
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptEnabled
        overScrollMode="never"
        onMessage={handleMessage}
        onError={event =>
          fail(
            new Error(
              `codeditor: webview failed to load ${event.nativeEvent.description ?? ''}`.trim(),
            ),
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No `overflow: hidden`: the only child is the WebView and it fills the box, so there was never
  // anything to clip -- and clipping an embedded AndroidView is one of the documented ways to end
  // up with a surface that stops being drawn.
  container: { flex: 1 },
  webView: { flex: 1, backgroundColor: 'transparent' },
});

export default CodeEditor;
