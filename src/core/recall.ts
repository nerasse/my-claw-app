import type { ChatItem } from './chat';
import { isOwnerMessage } from './runRows';
import { spokenWords } from './textSelection';

/**
 * Walking back through what was sent, the way a terminal walks its history.
 *
 * The field holds one line of the past at a time; Up asks for the one before it and Down for the
 * one after. What comes back is the message's own words. A voice note keeps its prose beside the
 * file, so its transcript takes that place -- plainly, without the `audio: "…"` marker the
 * clipboard writes. That marker says what a recording is in a document; in the field it is one
 * keystroke from being sent as a message, and the turn then hands the model an envelope instead
 * of the owner's words (measured 2026-11-21, 4d5775e7 seq 55377: Up on a voice note, Enter, and
 * the log holds a turn whose whole text is `audio: "…"`).
 */
export function recallLines(items: ChatItem[]): string[] {
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind !== 'text' || !isOwnerMessage(item)) continue;
    const line = [item.text.trim(), ...spokenWords(item)].filter(part => part !== '').join('\n\n');
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
