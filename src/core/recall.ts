import type { ChatItem } from './chat';
import { isOwnerMessage } from './runRows';
import { messageSelectionBody } from './textSelection';

/**
 * Walking back through what was sent, the way a terminal walks its history.
 *
 * The field holds one line of the past at a time; Up asks for the one before it and Down for the
 * one after. What is recalled is the message as text: a voice note comes back as the line it
 * stands for (`audio: "…"`), because the recording itself cannot be typed into a field again.
 */
export function recallLines(items: ChatItem[]): string[] {
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind !== 'text' || !isOwnerMessage(item)) continue;
    const body = messageSelectionBody({
      text: item.text,
      attachments: item.attachments,
      transcripts: item.transcripts,
    });
    const line = body.trim();
    if (line !== '') lines.push(line);
  }
  return lines;
}

/**
 * Where Up lands, or null when there is nothing further back.
 *
 * The draft decides where the walk stands rather than a stored cursor: it is the recalled line
 * itself while untouched, and anything else once the owner has typed into it. That means a thread
 * refreshed, a send that landed or a draft from another device cannot leave the cursor pointing at
 * a line that is no longer what the field holds.
 */
export function olderLine(lines: string[], draft: string): string | null {
  if (lines.length === 0) return null;
  const at = lines.lastIndexOf(draft.trim());
  const index = at === -1 ? lines.length - 1 : at - 1;
  return index >= 0 ? lines[index]! : null;
}

/**
 * Where Down lands. A draft that is not a recalled line is the owner's own writing: Down belongs
 * to the caret there, so nothing is answered and nothing is cleared.
 */
export function newerLine(lines: string[], draft: string): string | null | undefined {
  const at = lines.lastIndexOf(draft.trim());
  if (at === -1) return undefined;
  return at + 1 < lines.length ? lines[at + 1]! : null;
}

/** Whether the field holds a recalled line, untouched: Up then means "one older" again. */
export function recallsDraft(line: string | null, draft: string): boolean {
  return line !== null && line.trim() !== '' && line === draft;
}
