/**
 * One code editor, two platform hosts, and the rule that keeps them from fighting the page.
 *
 * The document lives in a host we do not render -- a WebView running CodeMirror 6 on Android
 * (`CodeEditor.native.tsx`), a CodeMirror instance on web (`CodeEditor.web.tsx`) -- and the user
 * types straight into it. A `value` prop that always replaced the document would therefore
 * rewrite what is under the caret: the page echoes every `onChange` back into `value`, React
 * re-renders, and the replacement lands a keystroke behind the user, moving the cursor. That loop
 * is the reason this component exists as one thing with two hosts instead of two components, and
 * the rule that prevents it is the reason this file is mostly prose.
 *
 * The rule, and both hosts implement it (the predicate is `shouldReplaceDocument`, in
 * `codeeditor/document.ts`):
 *
 * 1. The host records the last value it raised through `onChange`. That is what the document
 *    holds *because the user typed it*.
 * 2. When the `value` prop changes, the host compares it with that record. Equal means the prop
 *    is our own echo coming back, and the document is left strictly alone. Different means an
 *    external replacement -- another file opened, a patch applied -- and the document is replaced.
 * 3. A replacement resets the undo history (`setValue(value, { keepHistory: false })` on the
 *    handle is the same operation, and the default). A document the user did not type is a new
 *    document: an undo in the file just opened must never replay the previous file's edits into
 *    it, which is what CodeMirror's history would do if the replacement rode the existing stack.
 *    `keepHistory: true` is the opt-in for replacing the text *of the same document* (a reload
 *    from disk, say), where keeping the stack is the point.
 *
 * The props are frozen by the file-navigation page being built against them. What a host owes
 * that page: `onReady` fires once with a handle whose methods are all asynchronous (the Android
 * one crosses a bridge, so nothing is available synchronously); `onChange` carries the full
 * document, never a delta, and never a write the host made itself; `onCursor` carries a 1-based
 * line; every failure lands in `onError` rather than in an unhandled rejection.
 *
 * Android keyboard: the WebView container lifts itself by what the keyboard actually covers,
 * measured at `keyboardDidShow` -- the doctrine is in `docs/keyboard-avoidance.md` and the
 * measurement is shared with `src/core/revealField.ts`. `adjustResize` is inert in this app
 * (edge to edge), so nothing else would move the editor out of the keyboard's way.
 *
 * Where the executable pieces live (they cannot live here, see below):
 *
 * - `codeeditor/document.ts` -- the rule above as a function, and the file-name to language id
 *   mapping the page passes as `language`.
 * - `codeeditor/protocol.ts` -- the message shapes between a host and the WebView page.
 * - `codeeditor/languages.ts` -- the language ids both hosts can actually highlight.
 *
 * They are not re-exported from this file on purpose: Metro resolves `./CodeEditor` *from inside
 * `CodeEditor.native.tsx`* back to `CodeEditor.native.tsx` itself, so this file is never the
 * module a host loads. A runtime re-export here would typecheck and then be undefined at runtime.
 */

/** What a host hands to the page once its editor exists. */
export type CodeEditorHandle = {
  getValue(): Promise<string>;
  /** Remplace le document. keepHistory=false remet l'undo à zéro (ouverture d'un autre fichier). */
  setValue(value: string, options?: { keepHistory?: boolean }): Promise<void>;
  focus(): Promise<void>;
  scrollToCursor(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setLanguage(language: string | null): Promise<void>;
  setFontSize(size: number): Promise<void>;
};

export type CodeEditorProps = {
  /** Contenu. Un changement de cette prop qui ne vient pas de la frappe remplace le document. */
  value: string;
  language?: string | null;
  readOnly?: boolean;
  dark?: boolean;
  fontSize?: number;
  onReady?: (handle: CodeEditorHandle) => void;
  onChange?: (value: string) => void;
  /** Ligne du curseur, 1-based, pour l'afficher dans l'en-tête. */
  onCursor?: (line: number) => void;
  onError?: (error: unknown) => void;
};

/**
 * The module to import: `import { CodeEditor } from './components/CodeEditor'`.
 *
 * Metro never loads this file -- the platform siblings (`CodeEditor.native.tsx` for Android,
 * `CodeEditor.web.tsx` for react-native-web) win the resolution -- but tsc and Jest do, and the
 * re-export is what lets a page typecheck against the real component. Both hosts are annotated
 * with the props above, which is what keeps them interchangeable.
 */
export { default as CodeEditor } from './CodeEditor.native';
export { default } from './CodeEditor.native';
