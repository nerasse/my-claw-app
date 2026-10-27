import type { ChatItem } from './chat';

/** Past this gap two messages of the same author are two moments, not one block. */
const GROUP_WINDOW_MS = 120_000;

/** A bubble that opens on the model's reasoning: the server sealed the previous one to make room. */
function opensReasoning(item: ChatItem): boolean {
  if (item.kind !== 'text' || item.role !== 'agent') return false;
  return Boolean(item.reasoning?.trim()) || (item.reasoningChars ?? 0) > 0 || (item.reasoningTokens ?? 0) > 0;
}

/** Same author, close in time and not split by a tool card: render as one visual block. */
export function isGrouped(items: ChatItem[], index: number): boolean {
  const item = items[index];
  const previous = items[index - 1];
  if (!item || !previous || item.kind !== 'text' || previous.kind !== 'text') return false;
  // A new reasoning phase is a block of its own. The server closes the bubble on screen as soon as
  // reasoning follows an answer (docs/reasoning-visibility.md), and grouping glued the two back
  // together at 4px: the reasoning read as a note stuck under the answer already written, and the
  // words after it as that same message continuing.
  if (opensReasoning(item)) return false;
  // A compaction boundary is a rule across the thread, not a bubble. Grouping either side of it
  // would tuck a divider inside a block of messages and tighten the gap around it.
  if (item.summaryOf || previous.summaryOf) return false;
  return previous.role === item.role && item.ts - previous.ts < GROUP_WINDOW_MS;
}
