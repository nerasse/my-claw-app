import { createContext, useContext } from 'react';

/**
 * Taking text out of a conversation.
 *
 * Selecting in place does not work in this app and cannot be made to: see docs/text-selection.md.
 * Every block that is worth copying therefore points at one surface -- a full-screen viewer
 * holding the raw source in a single selectable node -- and reaches it through this context
 * rather than through a prop threaded from the shell down to a tool card.
 */
export interface SelectionTarget {
  /** What the bar says the reader is holding: "Message", "Reasoning", a tool name. */
  title: string;
  /** The source itself, exactly as it was written. */
  body: string;
}

export const TextSelectionContext = createContext<(target: SelectionTarget) => void>(() => {});

/** Opens the selection viewer on a block. A no-op outside the shell, never a crash. */
export function useOpenSelection(): (target: SelectionTarget) => void {
  return useContext(TextSelectionContext);
}

/**
 * A recording, as the line it stands for in text: `audio: "the words the server heard"`.
 *
 * A voice note is a message whose prose lives beside the file rather than in it, so anything that
 * hands a message over as text (the clipboard, the composer's history) has to carry those words
 * itself or it hands over nothing at all (owner, 2026-11-07).
 */
export function audioLines(
  item: {
    attachments?: ReadonlyArray<{ id: string; type: string }>;
    transcripts?: Record<string, string>;
  },
): string[] {
  const lines: string[] = [];
  for (const att of item.attachments ?? []) {
    if (att.type !== 'audio') continue;
    const heard = item.transcripts?.[att.id]?.trim();
    if (heard) lines.push(`audio: "${heard}"`);
  }
  return lines;
}

/**
 * Everything one message holds, in the order it was written: what the model thought, what it
 * answered, what a compaction kept. One string, because the viewer is one selectable node and
 * the point is to be able to drag across the lot in a single gesture.
 *
 * Raw markdown, not rendered: the source is what a reader wants in their clipboard (a path, a
 * command, a code fence), and rendering it would split it into nodes again.
 *
 * The words of a recording travel with the message that carried it: a voice note whose transcript
 * stayed behind is a message that copies as an empty string.
 */
export function messageSelectionBody(item: {
  text: string;
  reasoning?: string;
  details?: string;
  attachments?: ReadonlyArray<{ id: string; type: string }>;
  transcripts?: Record<string, string>;
}): string {
  const parts: string[] = [];
  const reasoning = item.reasoning?.trim();
  const details = item.details?.trim();
  const text = item.text.trim();
  if (reasoning) parts.push(`## Reasoning\n\n${reasoning}`);
  if (text) parts.push(text);
  parts.push(...audioLines(item));
  if (details) parts.push(`## Summary\n\n${details}`);
  return parts.join('\n\n');
}
