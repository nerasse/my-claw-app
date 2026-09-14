/**
 * The wire between the editor page and its React Native host.
 *
 * The page is a bundled asset (`assets/codeditor/index.html`), so there is no module boundary to
 * lean on: every message is a string that crossed `postMessage`/`injectJavaScript` and arrives
 * untrusted even when we wrote both sides. `parseEditorEvent` is therefore a whitelist in the
 * same sense as `parseServerFrame` (see AGENTS.md, "Known traps"): a message it does not
 * recognise is answered `null` and never reaches the host's handler. A frame missing a field its
 * handler walks into is how a render crash becomes a boot loop.
 *
 * The shapes here are the contract. `page.ts` posts `EditorEvent`s and answers `EditorRequest`s;
 * `CodeEditor.native.tsx` is the only other reader.
 */

/** Body text, at the scale the app reads code at. The page may override it per file. */
export const DEFAULT_EDITOR_FONT_SIZE = 14;

/** What the page needs before it can build the editor. Sent once, after the page says it is up. */
export interface EditorInit {
  value: string;
  language: string | null;
  readOnly: boolean;
  dark: boolean;
  fontSize: number;
}

/**
 * Everything that can change on a live editor.
 *
 * `language` is nullable on purpose: null means "plain text", which is what a file whose
 * extension maps to nothing gets.
 */
export interface EditorConfigPatch {
  language?: string | null;
  readOnly?: boolean;
  dark?: boolean;
  fontSize?: number;
}

/**
 * A request body. The page answers with an `EditorEvent` of type `response` carrying the same
 * `id`; `EditorView` methods that cannot fail answer `null`.
 */
export type EditorRequestPayload =
  | { method: 'getValue' }
  | { method: 'setValue'; value: string; keepHistory: boolean }
  | { method: 'configure'; patch: EditorConfigPatch }
  | { method: 'focus' }
  | { method: 'scrollToCursor' }
  | { method: 'undo' }
  | { method: 'redo' };

export type EditorRequest = EditorRequestPayload & { id: number };

export type EditorResponse =
  | { type: 'response'; id: number; result: unknown }
  | { type: 'response'; id: number; error: string };

/** What the page tells the host, unasked. */
export type EditorEvent =
  | { type: 'ready' }
  | { type: 'initialized' }
  | { type: 'change'; value: string }
  | { type: 'cursor'; line: number }
  | { type: 'error'; message: string }
  | EditorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The page's raw string, or null for anything this host is not allowed to act on.
 *
 * Every branch re-checks the field it reads rather than trusting the shape: the strings here are
 * produced by code we ship, but a host that crashed on a malformed one would take the whole app
 * with it (see AGENTS.md on the diagnostic frame path).
 */
export function parseEditorEvent(raw: string): EditorEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;
  switch (parsed.type) {
    case 'ready':
    case 'initialized':
      return { type: parsed.type };
    case 'change':
      return typeof parsed.value === 'string'
        ? { type: 'change', value: parsed.value }
        : null;
    case 'cursor':
      return typeof parsed.line === 'number' && Number.isFinite(parsed.line)
        ? { type: 'cursor', line: parsed.line }
        : null;
    case 'error':
      return typeof parsed.message === 'string'
        ? { type: 'error', message: parsed.message }
        : null;
    case 'response': {
      if (typeof parsed.id !== 'number') return null;
      if (typeof parsed.error === 'string') {
        return { type: 'response', id: parsed.id, error: parsed.error };
      }
      return { type: 'response', id: parsed.id, result: parsed.result };
    }
    default:
      return null;
  }
}
