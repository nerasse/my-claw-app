import { connection } from './connection';
import { encodeDraftSet } from './protocol';
import type { PendingAttachment } from './upload';

/**
 * What is typed but not sent yet, per conversation.
 *
 * It cannot live in the chat screen alone. On a phone the screen is unmounted whenever a page
 * covers it (Settings, Files, Archives), so a long message being written disappeared on the way
 * to check one thing. And the screen is not remounted between conversations, so a draft written
 * in one followed the reader into the next and could be sent there.
 *
 * The text is also the server's, so it follows the owner from the phone to the browser and back,
 * and survives a restart of either end -- the server's docs/draft-sync.md. Attachments do not:
 * they are local URIs and upload state, which mean nothing on another device.
 */
interface Draft {
  text: string;
  attachments: PendingAttachment[];
}

/** Same ceiling as the server. Past it the draft stays here rather than syncing truncated. */
const SYNC_TEXT_LIMIT = 64 * 1024;

/** One frame per pause in the typing, never one per keystroke. */
const SYNC_DELAY_MS = 500;

type Listener = (threadId: string) => void;

const drafts = new Map<string, Draft>();
const listeners = new Set<Listener>();
/** What the server was last told, per thread: re-sending it would be a frame carrying no news. */
const synced = new Map<string, string>();
const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function draftTextOf(threadId: string): string {
  return drafts.get(threadId)?.text ?? '';
}

export function draftAttachmentsOf(threadId: string): PendingAttachment[] {
  return drafts.get(threadId)?.attachments ?? [];
}

export function saveDraft(threadId: string, text: string, attachments: PendingAttachment[]): void {
  if (!threadId) return;
  if (!text.trim() && attachments.length === 0) {
    drafts.delete(threadId);
  } else {
    drafts.set(threadId, { text, attachments });
  }
  queueDraftSync(threadId, text);
}

/**
 * The composer changed. Debounced, and silent when the text is what the server already holds, so
 * typing a long message costs a handful of frames and a reconnect costs none.
 */
export function queueDraftSync(threadId: string, text: string): void {
  if (!threadId) return;
  if (text.length > SYNC_TEXT_LIMIT) return;
  if ((synced.get(threadId) ?? '') === text) {
    pending.delete(threadId);
    return;
  }
  pending.set(threadId, text);
  if (timer) return;
  timer = setTimeout(flushDraftSync, SYNC_DELAY_MS);
}

function flushDraftSync(): void {
  timer = undefined;
  for (const [threadId, text] of pending) {
    synced.set(threadId, text);
    connection.send(encodeDraftSet(threadId, text)).catch(() => {});
  }
  pending.clear();
}

/**
 * The message was sent, or the draft otherwise consumed.
 *
 * Cancelling the pending frame is the point: the server drops the draft when it accepts the
 * message, so a debounced `draft.set` from just before the send would land after it and put the
 * text back on every other device.
 */
export function clearDraft(threadId: string): void {
  drafts.delete(threadId);
  pending.delete(threadId);
  synced.set(threadId, '');
}

/**
 * A draft that arrived from the server. Recorded as synced so this device does not echo it back,
 * and announced to whoever is showing that conversation. Whether it reaches the composer is the
 * screen's call: it is the only one that knows if the owner is typing in it right now.
 */
export function applyRemoteDraft(threadId: string, text: string): void {
  if (!threadId) return;
  synced.set(threadId, text);
  pending.delete(threadId);
  const existing = drafts.get(threadId);
  if (!text) drafts.delete(threadId);
  else drafts.set(threadId, { text, attachments: existing?.attachments ?? [] });
  for (const listener of listeners) listener(threadId);
}

export function onRemoteDraft(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Module state outlives a render tree, so a test would inherit the previous one's draft. */
export function clearAllDrafts(): void {
  drafts.clear();
  synced.clear();
  pending.clear();
  if (timer) clearTimeout(timer);
  timer = undefined;
}
