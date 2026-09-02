import type { ChatItem, RunInfo } from './chat';

/**
 * One row of the chat list. A finished run's work collapses into a group row (its header), the
 * free bubbles around it stay rows of their own.
 */
export type ChatRow =
  | { kind: 'item'; item: ChatItem }
  | { kind: 'group'; run: RunInfo; items: ChatItem[] };

/**
 * Bubbles that never belong inside a run group: the owner's own turns (which split the group
 * around them, so an answer to a question stays readable when the work folds), command output
 * and system notices (the agent did not write them), and compaction boundaries (a divider across
 * the thread, not a bubble). Everything else -- tool cards, thinking phases, interim prose -- is
 * the run's work and folds with it.
 */
export function isHoisted(item: ChatItem): boolean {
  if (item.kind !== 'text') return false;
  return (
    item.role === 'user' ||
    item.command === true ||
    item.notice === true ||
    item.summaryOf !== undefined
  );
}

/**
 * Splits a thread into rows, folding every finished run's work under one group per segment.
 *
 * Rules, in the order a reader meets them:
 * - An item with no run, and every item of a run still `running`, is a plain row: nothing is
 *   grouped while the run answers.
 * - Inside a terminal run, hoisted bubbles (see `isHoisted`) stay rows and cut the group into
 *   segments around them.
 * - The last phase of a run is its answer, not its work: it leaves the group and stands as the
 *   row after it. A run whose last entry is a tool (it died before answering) keeps everything.
 * - A segment with nothing left in it produces no group: a run that only ever wrote its answer
 *   renders as plain bubbles, never as an empty header.
 */
export function buildRows(items: ChatItem[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let run: RunInfo | null = null;
  // The segment of the run being folded so far. Flushed as a group row the moment a hoisted
  // bubble cuts it (that bubble keeps its place in the rows), except the last one, which waits
  // for the run to close so its final phase -- the answer -- can leave the group.
  let current: ChatItem[] = [];

  const closeRun = () => {
    if (!run) return;
    if (current.length > 0) {
      const last = current[current.length - 1]!;
      // The answer is the run's final phase: the last item before the run ends. A run whose last
      // entry is a tool died without answering, and everything stays in the group.
      if (last.kind === 'text' && last.role === 'agent') {
        const answer = current.pop()!;
        if (current.length > 0) rows.push({ kind: 'group', run, items: current });
        rows.push({ kind: 'item', item: answer });
      } else {
        rows.push({ kind: 'group', run, items: current });
      }
      current = [];
    }
    run = null;
  };

  for (const item of items) {
    const itemRun = item.run;
    // Same terminal run as the one being folded: keep accumulating, hoisting the bubbles that
    // must stay readable (which cuts the group into segments around them).
    if (itemRun && itemRun.status !== 'running' && run && run.id === itemRun.id) {
      if (isHoisted(item)) {
        if (current.length > 0) rows.push({ kind: 'group', run, items: current });
        current = [];
        rows.push({ kind: 'item', item });
      } else {
        current.push(item);
      }
      continue;
    }
    // Anything else ends the folding run: an item outside any run, a run in flight, a new run.
    closeRun();
    if (!itemRun || itemRun.status === 'running') {
      rows.push({ kind: 'item', item });
      continue;
    }
    run = itemRun;
    if (isHoisted(item)) {
      rows.push({ kind: 'item', item });
    } else {
      current = [item];
    }
  }
  closeRun();
  return rows;
}