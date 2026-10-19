import { connection } from './connection';
import { encodeDraftFileAdd, encodeDraftFileRemove, encodeDraftSet, type PendingFileFrame } from './protocol';
import type { PendingAttachment } from './upload';
import { sessionStore } from './sessions';

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
let scope = '';

export function draftScope(): string { return scope; }
export function setDraftScope(origin: string): void {
  if (scope === origin) return;
  scope = origin;
  clearAllDrafts();
}

export function draftTextOf(threadId: string): string {
  return drafts.get(threadId)?.text ?? '';
}

export function draftAttachmentsOf(threadId: string): PendingAttachment[] {
  return drafts.get(threadId)?.attachments ?? [];
}

export function saveDraft(threadId: string, text: string, attachments: PendingAttachment[], expectedScope = scope): void {
  if (expectedScope !== scope) return;
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
  // The drawer's one bit follows the composer itself, not the last listing: the server only knows
  // about a draft after the debounced frame, and the badge used to wait for a reconnect. A thread
  // with no row is a no-op, so a sub-agent's composer costs nothing here. A staged file counts:
  // three photos and no word is an unsent message too.
  sessionStore.setHasDraft(threadId, text !== '' || (drafts.get(threadId)?.attachments.length ?? 0) > 0);
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
  sessionStore.setHasDraft(threadId, false);
}

/**
 * The draft is abandoned without being sent: a slash command opened a page, or `/new` left the
 * thread. `clearDraft` cannot say so -- the server drops a draft when it accepts a message, and a
 * frame racing that clear would put the text back -- but nothing accepts a command.
 */
export function discardDraft(threadId: string): void {
  if (!threadId) return;
  clearDraft(threadId);
  connection.send(encodeDraftSet(threadId, '')).catch(() => {});
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
  sessionStore.setHasDraft(threadId, text !== '');
  for (const listener of listeners) listener(threadId);
}

/**
 * A draft carried by the frame that replaces a thread: a fresh open, or a reset.
 *
 * The page is authoritative over what the server holds, which is exactly why it must not win
 * over text typed here and not yet acknowledged: reopening a conversation would hand back
 * yesterday's sentence over the one being written. The local map is filled only when it is empty
 * or still holds what the server last knew -- a page never regresses this device.
 */
export function applyServerDraft(threadId: string, text: string): void {
  if (!threadId || !text) return;
  // A change of ours has not left yet: the page was built before it, whatever it says is older.
  // Without this, emptying the composer and reopening it within the debounce handed the deleted
  // text back -- the map still held it, and the copy on the page matched what the server knew.
  if (pending.has(threadId)) return;
  const local = drafts.get(threadId)?.text ?? '';
  if (local && local !== (synced.get(threadId) ?? '')) return;
  applyRemoteDraft(threadId, text);
}

/** A chip built from the server's own copy: no local uri, and the server's thumb draws it. */
function chipOf(file: PendingFileFrame): PendingAttachment {
  return {
    id: file.id,
    mediaId: file.id,
    uri: '',
    filename: file.filename,
    type: file.type,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    ...(file.audioAsVoice ? { audioAsVoice: true } : {}),
    ...(file.durationMs === undefined ? {} : { durationMs: file.durationMs }),
  };
}

/**
 * The files of a composer, as the server holds them.
 *
 * `merge` is for a page: it adds what this device did not know, and never removes -- a chip
 * uploaded here may simply have left before the page was built. `replace` is for the server's own
 * broadcast of the list, which is authoritative in both directions, and keeps only the chips whose
 * upload has not finished (no id yet, so the server has never heard of them).
 */
export function applyServerFiles(threadId: string, files: PendingFileFrame[], mode: 'merge' | 'replace'): void {
  if (!threadId) return;
  if (mode === 'merge' && pending.has(threadId)) return;
  const current = drafts.get(threadId)?.attachments ?? [];
  const known = new Set(current.map((chip) => chip.mediaId).filter((id): id is string => Boolean(id)));
  const next = mode === 'merge'
    ? [...current, ...files.filter((file) => !known.has(file.id)).map(chipOf)]
    : [
        ...files.map((file) => current.find((chip) => chip.mediaId === file.id) ?? chipOf(file)),
        ...current.filter((chip) => !chip.mediaId),
      ];
  const text = drafts.get(threadId)?.text ?? '';
  if (!text && next.length === 0) drafts.delete(threadId);
  else drafts.set(threadId, { text, attachments: next });
  sessionStore.setHasDraft(threadId, text !== '' || next.length > 0);
  for (const listener of listeners) listener(threadId);
}

/** Stages an uploaded file on the server, so the chip follows the owner to another device. */
export function announceDraftFile(threadId: string, mediaId: string, voice?: { audioAsVoice?: boolean; durationMs?: number }): void {
  connection.send(encodeDraftFileAdd(threadId, mediaId, voice)).catch(() => {});
}

/** The chip left this composer: the server forgets it, the bytes are removed separately. */
export function forgetDraftFile(threadId: string, mediaId: string): void {
  connection.send(encodeDraftFileRemove(threadId, mediaId)).catch(() => {});
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
