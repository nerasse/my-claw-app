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
  | { kind: 'group'; run: RunInfo; items: ChatItem[]; runTail?: boolean }
  | { kind: 'folded'; run: RunInfo; summaries: RunSummaryItem[]; runTail?: boolean }
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

/**
 * The identity of a fold, stable across the moment its items arrive.
 *
 * A folded row is replaced by the group of items it stood for, and the reader must not lose the
 * state they just set: a group that snaps shut the moment it fills is the bug this key exists to
 * prevent (docs/run-hydration.md). The server keys a summary on the first entry it stands for
 * (`run-<id>`), and the items it hands back carry `foldOf` with that same string, so both sides
 * of the swap read one fold.
 */
export function foldKeyOf(row: Extract<ChatRow, { kind: 'group' | 'folded' }>): string {
  if (row.kind === 'folded') return row.summaries[0]?.id ?? row.run.id;
  const first = row.items[0];
  const fetchedFor = first && first.kind !== 'run' ? first.foldOf : undefined;
  return fetchedFor ?? first?.id ?? row.run.id;
}

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
 * and system notices (the agent did not write them), compaction boundaries (a divider across the
 * thread, not a bubble), and anything carrying an error. Everything else -- tool cards, thinking
 * phases, interim prose -- is the run's work and folds with it.
 *
 * The error is the one that is not about authorship: it is why the run stopped, which is the
 * first thing the owner has to read, and a group is closed by default. A run that died after
 * `chat.stream.start` but before its first token has that message patched onto the phase itself
 * (`abortStream`), and that phase carries the run -- so without this the reason was folded out of
 * sight under a header that only said "error".
 *
 * Hoisted, not elected as the run's answer: an answer leaves the group and is drawn *after* it,
 * which would move the failure away from the moment it happened. A hoisted row keeps its place
 * and cuts the group in two around it, so the order the thread was written in survives.
 *
 * A tool call that failed is not this: `kind` stops it on the first line, because a command that
 * came back non-zero is the run's work and belongs in the fold with the rest of it.
 */
export function isHoisted(item: ChatItem): boolean {
  if (item.kind !== 'text') return false;
  return (
    item.role === 'user' ||
    item.command === true ||
    item.notice === true ||
    item.summaryOf !== undefined ||
    item.error !== undefined
  );
}

/**
 * Prose the agent actually wrote, which is the only thing a run's answer can be.
 *
 * A phase the model only thought in is a `text` item all the same -- that item is what carries the
 * reasoning the row draws -- but its `text` is empty. Matching on the kind alone read such a phase
 * as the answer: it was hoisted out of the group and drawn under it, after every tool call it had
 * come before. Measured on a run that died with four thinking phases and no prose at all, where
 * the reasoning card ended up between the folded work and the error that killed the run
 * (2026-09-13).
 *
 * Whitespace is not prose either: a phase whose text is a stray newline says nothing.
 */
export function isAgentProse(item: ChatItem): boolean {
  return item.kind === 'text' && item.role === 'agent' && item.text.trim() !== '';
}

/**
 * A message the agent addressed to the owner: the words it wrote, or the pictures it sent.
 *
 * The counterpart of `isMessage` in the server's `display.ts`, and the rule the fold follows:
 * everything else in a terminal run is work, and folds between two messages. A phase that only
 * thought before calling a tool wrote nothing and carries nothing -- it stays in the fold.
 */
export function isAgentMessage(item: ChatItem): boolean {
  if (item.kind !== 'text' || item.role !== 'agent') return false;
  return isAgentProse(item) || (item.attachments?.length ?? 0) > 0;
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
 * Splits a thread into rows, folding the work between two messages under one group per burst.
 *
 * Rules, in the order a reader meets them:
 * - A folded row (the server sent a header instead of the work) is a `folded` row. Two adjacent
 *   ones of the same run merge: a run cut by a page boundary folds once per page, and the reader
 *   must see one group, not the same run twice with its work split at an arbitrary count.
 * - An item with no run, and every item of a run still `running`, is a plain row: nothing is
 *   grouped while the run answers.
 * - Inside a terminal run, hoisted bubbles (see `isHoisted`) and the agent's own messages (see
 *   `isAgentMessage`) stay rows and cut the fold into bursts around them. A message is what the
 *   reader follows, and the work between two of them is what the header hides -- the owner asked
 *   for exactly that (2026-09-17: "je veux pouvoir tous les voir, ce qu'il y a entre se
 *   regroupe"). Messages are hoisted by position, so the order they were written in survives; the
 *   answer election this replaces is gone with its reordering bugs.
 * - The last fold of a run carries its status and total span (`runTail`): a run has several
 *   headers now, and repeating "Stopped" or "4 min" on every one of them says nothing.
 * - A burst with nothing left in it produces no group: a run that only ever wrote messages
 *   renders as plain bubbles, never as an empty header.
 */
/**
 * The sends that never made it out, taken to the bottom of the thread.
 *
 * They wait for a connection, not for a turn: the run keeps writing while they wait, so a bubble
 * left in its reading order scrolls away from the only place the owner looks. Every other wait
 * keeps its place -- a send the server holds has a turn coming, which is a fact about the thread,
 * and its bubble belongs where it was typed.
 */
export function pinnedSends(rows: ChatRow[]): ChatRow[] {
  const pinned = rows.filter(
    row => row.kind === 'item' && row.item.kind === 'text' && row.item.queuedReason === 'undelivered',
  );
  if (pinned.length === 0) return rows;
  return [...rows.filter(row => !pinned.includes(row)), ...pinned];
}

/**
 * Whether a row would draw nothing at all.
 *
 * A bubble is a row because it has something to say: prose, a file, a thought, a reason it is
 * still on screen (waiting for its turn, stopped by an error, streaming). None of that is a
 * blank bubble, and the server drops the ones it has nothing to say with before sending them --
 * so an empty one that arrives is a hole in the conversation, and since any row breaks the fold
 * it also cuts the group it landed in (2026-09-16).
 */
function hasNothingToShow(item: ChatItem): boolean {
  if (item.kind !== 'text') return false;
  const says = item.text.trim() !== '';
  const shows = (item.attachments?.length ?? 0) > 0;
  const thought =
    Boolean(item.reasoning?.trim()) || item.reasoningTokens !== undefined || item.reasoningMs !== undefined;
  const heard = item.transcripts !== undefined && Object.keys(item.transcripts).length > 0;
  const why =
    Boolean(item.error) || item.streaming || item.pending === true || item.queuedSince !== undefined;
  // A separator or an aside is drawn apart from the message it came from, and has no prose of
  // its own: the boundary, the notice, the command output.
  const apart =
    Boolean(item.location) ||
    item.command === true ||
    item.notice === true ||
    Boolean(item.details) ||
    item.summaryOf !== undefined ||
    item.compactionMs !== undefined ||
    item.compactionStopped === true;
  return !(says || shows || thought || heard || why || apart);
}

export function buildRows(items: ChatItem[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let run: RunInfo | null = null;
  // The segment of the run being folded so far. Flushed as a group row the moment a hoisted
  // bubble cuts it (that bubble keeps its place in the rows), except the last one, which waits
  // for the run to close so its final phase -- the answer -- can leave the group.
  let current: ChatItem[] = [];

  const closeRun = () => {
    if (!run) return;
    if (current.length > 0) rows.push({ kind: 'group', run, items: current });
    current = [];
    run = null;
  };

  for (const item of items) {
    if (hasNothingToShow(item)) continue;
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
    // Bubbles the fold never swallows: the hoisted ones, and the agent's own messages.
    const stays = isHoisted(item) || isAgentMessage(item);
    // Same terminal run as the one being folded: keep accumulating, cutting the group around
    // every bubble that must stay readable.
    if (itemRun && itemRun.status !== 'running' && run && run.id === itemRun.id) {
      if (stays) {
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
    if (stays) {
      rows.push({ kind: 'item', item });
    } else {
      current = [item];
    }
  }
  closeRun();
  return markRunTails(rows);
}

/**
 * Marks the last fold of each run, which is the one that carries its status and total span.
 *
 * Computed here rather than in the renderer: a run's folds sit in the rows in order, and only the
 * list that built them knows which one a reader meets last. A run whose last message has no work
 * after it keeps the mark on its last fold anyway -- the status has to stand somewhere.
 */
function markRunTails(rows: ChatRow[]): ChatRow[] {
  const last = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.kind === 'group' || row.kind === 'folded') last.set(row.run.id, index);
  });
  if (last.size === 0) return rows;
  return rows.map((row, index) => {
    if ((row.kind === 'group' || row.kind === 'folded') && last.get(row.run.id) === index) {
      return { ...row, runTail: true };
    }
    return row;
  });
}