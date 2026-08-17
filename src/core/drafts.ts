import type { PendingAttachment } from './upload';

/**
 * What is typed but not sent yet, per conversation.
 *
 * It cannot live in the chat screen alone. On a phone the screen is unmounted whenever a page
 * covers it (Settings, Files, Archives), so a long message being written disappeared on the way
 * to check one thing. And the screen is not remounted between conversations, so a draft written
 * in one followed the reader into the next and could be sent there.
 *
 * Memory only, on purpose: a draft is a thought in progress, not a document, and the process
 * dying is a good enough reason for it to be gone.
 */
interface Draft {
  text: string;
  attachments: PendingAttachment[];
}

const drafts = new Map<string, Draft>();

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
    return;
  }
  drafts.set(threadId, { text, attachments });
}

export function clearDraft(threadId: string): void {
  drafts.delete(threadId);
}

/** Module state outlives a render tree, so a test would inherit the previous one's draft. */
export function clearAllDrafts(): void {
  drafts.clear();
}
