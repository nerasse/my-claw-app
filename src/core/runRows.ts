import type { ChatItem, RunInfo, RunSummaryItem } from './chat';

/**
 * One row of the chat list. A finished run's work collapses into a group row (its header), the
 * free bubbles around it stay rows of their own.
 *
 * `folded` is the same group, held by the server instead of by this list: the work never arrived,
 * only a header standing for it -- docs/run-hydration.md. It is a distinct kind because it draws
 * from counts rather than from children, and because opening it has to fetch something.
 */
export type ChatRow =
  | { kind: 'item'; item: ChatItem }
  | { kind: 'group'; run: RunInfo; items: ChatItem[] }
  | { kind: 'folded'; run: RunInfo; summaries: RunSummaryItem[] }
  /**
   * The live compaction rule, as a row of the list rather than a decoration on a cell.
   *
   * It used to be drawn inside the cell of the bubble parked behind it, and a cell is not a
   * reliable reading order: `inverted` puts every cell in `column-reverse` *and* under a scaleY
   * flip, so a cell with two children renders them the other way round. The owner saw exactly
   * that, the bubble above a rule meant to stand above it (2026-09-11). A row is ordered by the
   * data, which is what the inversion is built on, and that holds whatever the cell does.
   */
  | { kind: 'rule' };

/** The oldest item a row draws, which is where a rule standing above the row has to attach. */
export function firstItemOfRow(row: ChatRow): string | undefined {
  if (row.kind === 'item') return row.item.id;
  if (row.kind === 'group') return row.items[0]?.id;
  return undefined;
}

/**
 * The rule, inserted as its own row just above the send it belongs to.
 *
 * Above, so the bubble comes after it in reading order: the rule is the divider the compaction
 * draws, and the message waits *below* it. Inserted before the row that holds that bubble, and
 * never after, so the parked message is the last thing the thread says.
 */
export function withCompactionRule(rows: ChatRow[], before: string | undefined): ChatRow[] {
  if (before === undefined) return rows;
  const at = rows.findIndex(row => firstItemOfRow(row) === before);
  if (at < 0) return rows;
  return [...rows.slice(0, at), { kind: 'rule' }, ...rows.slice(at)];
}

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
 * The bubble the live compaction rule has to stand above, if there is one.
 *
 * The rule lives in the list header, which on an inverted list is the bottom of the screen: exactly
 * where the thread stops, and exactly the wrong place once a send is parked behind that compaction.
 * A parked bubble is a row, so the header drew the rule *under* it, while the boundary the
 * compaction goes on to write sits above the same message -- the thread reordered itself under the
 * reader as the run ended. Only `compaction` counts: a send waiting for the next turn boundary of a
 * live run is not waiting for this.
 */
export function compactionRuleBefore(items: ChatItem[]): string | undefined {
  return items.find(item => item.kind === 'text' && item.queuedReason === 'compaction')?.id;
}

/**
 * Splits a thread into rows, folding every finished run's work under one group per segment.
 *
 * Rules, in the order a reader meets them:
 * - A folded row (the server sent a header instead of the work) is a `folded` row. Two adjacent
 *   ones of the same run merge: a run cut by a page boundary folds once per page, and the reader
 *   must see one group, not the same run twice with its work split at an arbitrary count.
 * - An item with no run, and every item of a run still `running`, is a plain row: nothing is
 *   grouped while the run answers.
 * - Inside a terminal run, hoisted bubbles (see `isHoisted`) stay rows and cut the group into
 *   segments around them.
 * - The last phase of a run is its answer, not its work: it leaves the group and stands as the
 *   row after it. A run whose entries are all cards never answered, and keeps everything. The
 *   answer is found by *kind*, not by position: an entry that landed after it does not demote it.
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
      // The answer is the last prose the agent wrote in the run, not the last item held. A card
      // left running when the run ended is re-appended after it by the store, and "the last item"
      // then read a card as the run's answer -- so the real answer stayed inside the group, under
      // a header that had moved below it. Measured on a real thread, 2026-09-10.
      //
      // A run whose entries are all cards died before writing anything, and then nothing is
      // hoisted out: everything stays in the group.
      let answerAt = -1;
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const item = current[i]!;
        if (item.kind === 'text' && item.role === 'agent') {
          answerAt = i;
          break;
        }
      }
      if (answerAt >= 0) {
        const rest = current.filter((_, i) => i !== answerAt);
        if (rest.length > 0) rows.push({ kind: 'group', run, items: rest });
        rows.push({ kind: 'item', item: current[answerAt]! });
      } else {
        rows.push({ kind: 'group', run, items: current });
      }
      current = [];
    }
    run = null;
  };

  for (const item of items) {
    if (item.kind === 'run') {
      // The work of this run never travelled, so there is nothing to accumulate: the header is
      // the row. It still ends whatever group was open, exactly like any other break.
      closeRun();
      const last = rows[rows.length - 1];
      if (last?.kind === 'folded' && last.run.id === item.run.id) last.summaries.push(item);
      else rows.push({ kind: 'folded', run: item.run, summaries: [item] });
      continue;
    }
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