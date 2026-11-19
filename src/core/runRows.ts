import { isSubAgentTool, type ChatItem, type RunInfo, type RunSummaryItem, type TextItem } from './chat';
import { dayOf } from './day';
import { msOf } from './utils';

/**
 * One row of the chat list. A finished run's work collapses into a group row (its header), the
 * free bubbles around it stay rows of their own.
 *
 * `folded` is the same group, held by the server instead of by this list: the work never arrived,
 * only a header standing for it -- docs/run-hydration.md. It is a distinct kind because it draws
 * from counts rather than from children, and because opening it has to fetch something.
 */
export type ChatRow =
  /**
   * `foot` marks the row a finished run's empreinte draws under (`RunFoot`): its span and its
   * status, signed at the run's very end -- the run's last message, or its last fold when it
   * stopped mid-work. A run whose tail is neither gets `{ kind: 'foot' }` after it instead.
   */
  | { kind: 'item'; item: ChatItem; foot?: RunInfo }
  | { kind: 'group'; run: RunInfo; items: ChatItem[]; foot?: RunInfo; live?: boolean }
  | { kind: 'folded'; run: RunInfo; summaries: RunSummaryItem[]; foot?: RunInfo }
  /**
   * The live compaction rule, as a row of the list rather than a decoration on a cell.
   *
   * It used to be drawn inside the cell of the bubble parked behind it, and a cell is not a
   * reliable reading order: `inverted` puts every cell in `column-reverse` *and* under a scaleY
   * flip, so a cell with two children renders them the other way round. The owner saw exactly
   * that, the bubble above a rule meant to stand above it (2026-09-11). A row is ordered by the
   * data, which is what the inversion is built on, and that holds whatever the cell does.
   */
  | { kind: 'rule' }
  /**
   * The empreinte alone: a run whose last visible thing is a thought, or that drew nothing at
   * all, has no message to sign and no fold to stand under. Its signature is then its only trace
   * in the thread, and it stands where the work would have (2026-09-22).
   */
  | { kind: 'foot'; run: RunInfo }
  /**
   * The day a run of rows belongs to, drawn once where that day starts.
   *
   * A row of its own, like the compaction rule: a cell's children are laid out the other way
   * round under the inverted list, so a divider drawn above a bubble inside its cell lands under
   * it. `day` is local midnight -- the identity the divider is keyed on.
   */
  | { kind: 'day'; day: number };

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
  // A sub-agent call is a door, never a line of a fold: it is the one thing the reader waits on,
  // and in a spine of thirteen rows it would be the least visible of them.
  if (item.kind === 'tool') return isSubAgentTool(item.name, item.args);
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
 * - A finished run ends with its empreinte (`RunFoot`): its total span and its status, signed
 *   once, at the run's very end (`markRunFeet`). They used to ride the title of the run's last
 *   fold, where the span read as the fold's own time.
 * - A burst with nothing left in it produces no group: a run that only ever wrote messages
 *   renders as plain bubbles, never as an empty header.
 */
/**
 * The sends that have not started yet, taken to the bottom of the thread.
 *
 * Two waits, and both are the same complaint: the reader looks for a message where the thread
 * stops. An `undelivered` send waits for a connection while the run keeps writing above it. An
 * `injection` is parked in the run's mailbox for the next turn boundary, and the run it is waiting
 * on keeps appending steps -- so a bubble left in its reading order slid up under the work in
 * progress, and the owner saw his own message queued *above* the group it was queued behind
 * (2026-11-15: "la queue doit être stuck en bas ... tant qu'elle est pas injectée réellement").
 *
 * A `compaction` hold keeps its place: the boundary it waits behind is a rule drawn right under it,
 * the run that will read it has not started, and nothing is appended below -- its own position is
 * already the bottom of the thread.
 */
export function pinnedSends(rows: ChatRow[]): ChatRow[] {
  const pinned = rows.filter(
    row =>
      row.kind === 'item' &&
      row.item.kind === 'text' &&
      (row.item.queuedReason === 'undelivered' || row.item.queuedReason === 'injection'),
  );
  if (pinned.length === 0) return rows;
  return joined([...rows.filter(row => !pinned.includes(row)), ...pinned]);
}

/**
 * Two folds of one run that became neighbours are one fold.
 *
 * Taking a row out of the middle (a queued send, pinned to the bottom) leaves the work it stood
 * between as two groups of the same run, side by side -- `13 steps` then `4 steps` where a single
 * `17 steps` was true. Only the same run joins: a different id is a different piece of work, and a
 * rule or a separator between them means they were never one.
 */
function joined(rows: ChatRow[]): ChatRow[] {
  const out: ChatRow[] = [];
  for (const row of rows) {
    const previous = out[out.length - 1];
    if (row.kind === 'group' && previous?.kind === 'group' && previous.run.id === row.run.id) {
      out[out.length - 1] = {
        ...row,
        items: [...previous.items, ...row.items],
        // The signature and the live flag belong to the later half: it is the one the run's own
        // end marked, and the one still being written.
        ...(row.foot ?? previous.foot ? { foot: row.foot ?? previous.foot } : {}),
        ...(row.live || previous.live ? { live: true } : {}),
      };
      continue;
    }
    out.push(row);
  }
  return out;
}

/**
 * The day each run of rows opens, inserted where that day changes.
 *
 * A divider belongs to a row that has a time of its own: a bubble's, a group's first item's, a
 * folded row's first summary's. A footer (the empreinte) has none and keeps the day the row
 * before it opened, so a signature never divides a day in two. The live rule is the other way
 * round -- it says what is happening now, and when the message parked behind it opens a new day,
 * the divider goes above the rule rather than between the two.
 *
 * `pinnedSends` runs before this: a send pinned to the bottom is drawn there, and the divider
 * must follow the bubble rather than the order it was typed in.
 */
function dayOfRow(row: ChatRow): number | undefined {
  if (row.kind === 'item') return row.item.ts;
  if (row.kind === 'group') return row.items[0]?.ts;
  if (row.kind === 'folded') return row.summaries[0]?.ts;
  return undefined;
}

export function withDaySeparators(rows: ChatRow[]): ChatRow[] {
  const out: ChatRow[] = [];
  let current: number | undefined;
  for (const row of rows) {
    const ts = dayOfRow(row);
    if (ts !== undefined) {
      const day = dayOf(ts);
      if (day !== current) {
        // The live rule says "now": when the message it holds is the first of a new day, the rule
        // belongs to that day too, and the divider goes above it rather than between the two.
        const at = out[out.length - 1]?.kind === 'rule' ? out.length - 1 : out.length;
        out.splice(at, 0, { kind: 'day', day });
        current = day;
      }
    }
    out.push(row);
  }
  return out;
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
export function hasNothingToShow(item: ChatItem): boolean {
  if (item.kind !== 'text') return false;
  const says = item.text.trim() !== '';
  const shows = (item.attachments?.length ?? 0) > 0;
  const thought =
    Boolean(item.reasoning?.trim()) ||
    (item.reasoningChars ?? 0) > 0 ||
    item.reasoningTokens !== undefined ||
    item.reasoningMs !== undefined;
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

/**
 * A message the owner sent, as opposed to what is stored under the same role: a command and its
 * output, a notice, a compaction boundary (the summary is a `user` turn because the prompt needs
 * it there), and a sub-agent's return (written under `user` so the model answers it, and drawn as
 * an agent's card).
 *
 * Every reader of "what did the owner type" goes through this: the terminal history recall, the
 * Continue button, the run's own trigger signature. A return is not one of those, and treating it
 * as one made Up recall a report and made a run sign a message nobody had sent.
 */
export function isOwnerMessage(item: ChatItem): item is TextItem {
  return (
    item.kind === 'text' &&
    item.role === 'user' &&
    item.command !== true &&
    item.notice !== true &&
    item.summaryOf === undefined &&
    item.compactionMs === undefined &&
    item.compactionStopped !== true &&
    item.from?.kind !== 'return'
  );
}

/**
 * The run Continue would pick back up: the thread's last run, when it stopped, failed, or was lost
 * (still marked running while the thread is at rest -- the caller knows that part).
 *
 * Nothing when a newer message of the owner stands under it: that message is what comes next, sent
 * or on its way. A command output or a notice after the run does not count, the owner's `/stop`
 * included.
 */
export function continueTarget(items: readonly ChatItem[]): RunInfo | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (item.run) return item.run.status === 'done' ? undefined : item.run;
    if (isOwnerMessage(item)) return undefined;
  }
  return undefined;
}

/**
 * The reasoning a message carries, split out as a row of its own.
 *
 * A bubble owns the thinking that produced it, and it drew that thinking inside itself: so the
 * last thought of a run sat on top of the answer, outside the fold, and the thread kept a
 * reasoning line and a "wait" figure on every finished message (owner, 2026-11-13: "on laisse le
 * dernier reasoning avec le message. Il n'est pas dans le groupement de tools ... ça va clean
 * l'interface énormément").
 *
 * The reasoning is moved onto its own item, immediately before the bubble, and every reasoning
 * field of the message is cleared: the bubble then draws only its words, and the thought joins the
 * run's fold like every other thinking phase. It keeps the message's id under a suffix, so an
 * aside the reader opened (`persistKey`) stays the same key across a redraw and across the live to
 * history transition -- the expanded state of a thought must not reset when its bubble settles.
 *
 * Only agent messages are touched: a user bubble never thinks, and a command output or a notice is
 * not the agent speaking. A message that kept its reasoning on the server (`reasoningChars`) is
 * split the same way: the row knows how to fetch it on open.
 */
export function splitReasoning(items: ChatItem[]): ChatItem[] {
  const out: ChatItem[] = [];
  for (const item of items) {
    if (!carriesReasoning(item)) {
      out.push(item);
      continue;
    }
    const thought: ChatItem = {
      kind: 'text',
      id: `${item.id}~reasoning`,
      role: 'agent',
      text: '',
      attachments: [],
      streaming: item.streaming,
      ts: item.ts,
      ...(item.run !== undefined ? { run: item.run } : {}),
      ...(item.reasoning !== undefined ? { reasoning: item.reasoning } : {}),
      ...(item.reasoningChars !== undefined ? { reasoningChars: item.reasoningChars } : {}),
      ...(item.reasoningTokens !== undefined ? { reasoningTokens: item.reasoningTokens } : {}),
      ...(item.reasoningStartedAt !== undefined ? { reasoningStartedAt: item.reasoningStartedAt } : {}),
      ...(item.reasoningMs !== undefined ? { reasoningMs: item.reasoningMs } : {}),
      // The wait belongs to the call that produced both, and it is a figure about the thought: left
      // on the message it would draw a second line under the answer.
      ...(item.waitMs !== undefined ? { waitMs: item.waitMs } : {}),
      ...(item.waitingSince !== undefined ? { waitingSince: item.waitingSince } : {}),
      // The id the server knows this reasoning by. The split item's own id is synthetic, so an
      // aside that has to fetch its text (`reasoningChars`) would ask for a row that does not
      // exist; `docs/run-hydration.md`, and `__tests__/Reasoning.test.tsx` pins the frame.
      reasoningOf: item.id,
    };
    out.push(thought, withoutReasoning(item));
  }
  return out;
}

/**
 * Whether a bubble draws its thinking inside itself, and therefore has to hand it to the fold.
 *
 * Only a message that says something: its reasoning was drawn *above its words*, inside the same
 * bubble, and that is the line the owner wants folded. A phase that only thought is already a row
 * of the work -- it has no words to sit above, and `ReasoningLine` is all it draws -- so splitting
 * it again would put an empty bubble beside its own thought.
 */
function carriesReasoning(item: ChatItem): item is Extract<ChatItem, { kind: 'text' }> {
  if (item.kind !== 'text' || item.role !== 'agent') return false;
  if (item.command === true || item.notice === true || item.summaryOf !== undefined) return false;
  if (item.error !== undefined) return false;
  // Nothing to hang the line above: a bare thought is already its own row.
  if (item.text.trim() === '' && (item.attachments?.length ?? 0) === 0) return false;
  return (
    Boolean(item.reasoning?.trim()) ||
    (item.reasoningChars ?? 0) > 0 ||
    item.reasoningTokens !== undefined ||
    item.reasoningMs !== undefined ||
    item.waitMs !== undefined
  );
}

/** The same message with every reasoning field cleared: its words, nothing about the thinking. */
function withoutReasoning(item: Extract<ChatItem, { kind: 'text' }>): ChatItem {
  // Built rather than destructured-with-rests: the linter refuses seven "unused" bindings, and a
  // whitelist says exactly which fields are *kept* on a bubble, which is the thing that matters.
  const rest: Extract<ChatItem, { kind: 'text' }> = {
    kind: 'text',
    id: item.id,
    role: item.role,
    text: item.text,
    attachments: item.attachments,
    ts: item.ts,
    // A message that answered is not still thinking: `streaming` drove the caret (and the "is it
    // waiting yet" reveal) that the split row now owns. With no words under it, a stream flag would
    // draw a bare cursor under an empty bubble -- the very bar the thought row replaced.
    streaming: item.text.trim() === '' ? false : item.streaming,
  };
  // Everything else this bubble may carry, unchanged and still allowed to be absent.
  if (item.location !== undefined) rest.location = item.location;
  if (item.error !== undefined) rest.error = item.error;
  if (item.transcripts !== undefined) rest.transcripts = item.transcripts;
  if (item.command !== undefined) rest.command = item.command;
  if (item.notice !== undefined) rest.notice = item.notice;
  if (item.details !== undefined) rest.details = item.details;
  if (item.summaryOf !== undefined) rest.summaryOf = item.summaryOf;
  if (item.archive !== undefined) rest.archive = item.archive;
  if (item.compactionMs !== undefined) rest.compactionMs = item.compactionMs;
  if (item.compactionStopped !== undefined) rest.compactionStopped = item.compactionStopped;
  if (item.queuedSince !== undefined) rest.queuedSince = item.queuedSince;
  if (item.queuedReason !== undefined) rest.queuedReason = item.queuedReason;
  if (item.pending !== undefined) rest.pending = item.pending;
  if (item.run !== undefined) rest.run = item.run;
  if (item.foldOf !== undefined) rest.foldOf = item.foldOf;
  return rest;
}

export function buildRows(items: ChatItem[], compactionBefore?: string): ChatRow[] {
  return rowsOf(adoptRuns(splitReasoning(items)), compactionBefore);
}

/**
 * A phase the model only thought in: no words, no file, no place -- the bubble `ReasoningLine` is
 * the whole of it. It has nothing to stand outside a fold with, so a run takes it.
 */
function isThoughtOnly(item: ChatItem): item is Extract<ChatItem, { kind: 'text' }> {
  if (item.kind !== 'text' || item.role !== 'agent') return false;
  if (item.text.trim() !== '' || (item.attachments?.length ?? 0) > 0) return false;
  if (item.command || item.notice || item.error !== undefined || item.summaryOf !== undefined) return false;
  if (item.location !== undefined || item.details !== undefined) return false;
  return (
    Boolean(item.reasoning?.trim()) ||
    (item.reasoningChars ?? 0) > 0 ||
    item.reasoningTokens !== undefined ||
    item.reasoningMs !== undefined
  );
}

/**
 * The id a group invented around a thought nothing else claims wears, and the flag that says the
 * group is that invention rather than a run the server reported.
 */
const LONE_THOUGHTS = 'thoughts:';

/**
 * A thought belongs to a run even when it did not arrive wearing one.
 *
 * A split thought copies its message's run, and a live one is opened by `runForLiveItem`, so this
 * is about the other arrivals: a page whose entries predate run markers, a bubble whose start frame
 * was missed, a run the server folded as no longer running. Those thoughts drew as bare rows -- a
 * `Reasoning` line between two folds, wearing no dot, saying nothing about what it belonged to
 * (owner, 2026-11-15: "il doit être un item de groupement toujours").
 *
 * Two sources, in order: the message it was split from (`reasoningOf`, exact), then the nearest
 * item carrying a run -- the one before it, which is the work it was written between.
 */
function adoptRuns(items: ChatItem[]): ChatItem[] {
  if (!items.some(item => item.run === undefined && isThoughtOnly(item))) return items;
  const runOfItem = new Map<string, RunInfo>();
  for (const item of items) if (item.run) runOfItem.set(item.id, item.run);
  return items.map((item, index) => {
    if (item.run !== undefined || !isThoughtOnly(item)) return item;
    const split = item.reasoningOf !== undefined ? runOfItem.get(item.reasoningOf) : undefined;
    const run = split ?? nearestRun(items, index);
    return run ? { ...item, run } : item;
  });
}

/** The run of the closest item that wears one, earlier first: the work the thought sits between. */
function nearestRun(items: ChatItem[], index: number): RunInfo | undefined {
  for (let at = index - 1; at >= 0; at -= 1) {
    const run = items[at]?.run;
    if (run) return run;
  }
  for (let at = index + 1; at < items.length; at += 1) {
    const run = items[at]?.run;
    if (run) return run;
  }
  return undefined;
}

/**
 * The run a group of thoughts nothing else claims wears.
 *
 * A thread whose entries carry no run at all -- a session written before the server marked them --
 * has nothing to inherit, and a fold invented around one thought is still the shape the owner asked
 * for. It signs nothing (`markRunFeet` skips it): a span from an invented start to an invented end
 * would print a `run · 0 ms` under a line that never ran.
 */
function loneThoughts(item: ChatItem): RunInfo {
  return {
    id: `${LONE_THOUGHTS}${item.id}`,
    status: 'done',
    startTs: msOf(item.ts) ?? Date.now(),
    invented: true,
  };
}

/** The rows of an already-split thread: `buildRows` is this, behind `splitReasoning`. */
function rowsOf(items: ChatItem[], compactionBefore?: string): ChatRow[] {
  const rows: ChatRow[] = [];
  let run: RunInfo | null = null;
  // The segment of the run being folded so far. Flushed as a group row the moment a hoisted
  // bubble cuts it (that bubble keeps its place in the rows), except the last one, which waits
  // for the run to close so its final phase -- the answer -- can leave the group.
  let current: ChatItem[] = [];
  // Where a finished run that draws nothing at all goes: its empreinte is then its only trace,
  // and it belongs where the work would have stood, not at the end of the thread. First sighting
  // of the run, rows so far -- `markRunFeet` drops these for runs that do have rows.
  const ghosts: { run: RunInfo; at: number }[] = [];
  const ghostSeen = new Set<string>();
  /**
   * Whether this thread knows runs at all.
   *
   * A session written before the server marked them has nothing to inherit and nothing to compare
   * against: inventing a fold around each of its thoughts would hide them behind a header saying
   * what the row already said. Those threads keep their plain rows; every thread that does carry
   * runs -- which is every thread this server writes -- groups its thoughts, always.
   */
  const hasRuns = items.some(item => item.run !== undefined);

  const closeRun = () => {
    if (!run) return;
    if (current.length > 0) rows.push({ kind: 'group', run, items: current });
    current = [];
    run = null;
  };

  for (const item of items) {
    // A compaction cuts the thread, and it cuts the fold with it: the run it interrupts does not
    // go on into the work written after it, so what came before is a group of its own -- closed --
    // and whatever follows opens another. Drawn as a decoration *between* rows (`withCompactionRule`
    // used to place it), the rule left the group spanning the boundary and still spinning: the
    // owner saw a run "running · 3 min 41 s" above a compaction that had already cut it, and the
    // work after the boundary counted as part of that group (2026-11-14).
    if (compactionBefore !== undefined && item.id === compactionBefore) {
      closeRun();
      rows.push({ kind: 'rule' });
    }
    const itemRun = item.kind === 'run' ? item.run : item.run;
    if (itemRun && itemRun.status !== 'running' && !ghostSeen.has(itemRun.id)) {
      ghostSeen.add(itemRun.id);
      ghosts.push({ run: itemRun, at: rows.length });
    }
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
    // Bubbles the fold never swallows: the hoisted ones, and the agent's own messages.
    const stays = isHoisted(item) || isAgentMessage(item);
    // Same run as the one being folded -- running or settled. A run in flight is grouped too, so
    // the reader watches the same column from the first call instead of a stack of cards that
    // turns into a fold the moment the run ends (owner, 2026-11-07: "grouper les runs en cours
    // mais déplié, always déplié"). The screen forces it open while it runs.
    if (itemRun && run && run.id === itemRun.id) {
      if (stays) {
        if (current.length > 0) rows.push({ kind: 'group', run, items: current });
        current = [];
        rows.push({ kind: 'item', item });
      } else {
        current.push(item);
      }
      continue;
    }
    // Anything else ends the folding run: an item outside any run, or a new one.
    //
    // A thought never stands outside a group (owner, 2026-11-15). `adoptRuns` has already given it
    // the run it belongs to when one was near, so this is the rest: it joins the fold being written
    // whatever that run's status is -- a thought that arrived after its run was sealed is still the
    // thinking of that work, and a bare `Reasoning` line between two folds is what the owner saw --
    // and, with no run anywhere around it, it opens a group of its own rather than a row.
    if (!itemRun && isThoughtOnly(item)) {
      if (!run && hasRuns) {
        run = loneThoughts(item);
        current = [];
      }
      if (run) {
        current.push(item);
        continue;
      }
    }
    closeRun();
    if (!itemRun) {
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
  return markRunFeet(markLiveSegment(groupLooseThoughts(rows, hasRuns)), ghosts);
}

/**
 * The last word on a thought: it never stands as a row of its own.
 *
 * Everything above decides what joins a fold as it walks the thread, and every path it knows lands
 * a thought inside one. This is the guarantee rather than the deduction (owner, 2026-11-15: "ça doit
 * être un item de groupement toujours"): whatever route put a thought between two rows -- a run id
 * that split it from the work it belongs to, a page that named no run, a shape nobody anticipated --
 * it joins the fold next to it, same run first, and opens one of its own when there is none.
 *
 * It runs before the feet are marked, because merging moves where a run's last row is.
 *
 * A thread that knows no runs keeps its plain rows, as everywhere else: see `hasRuns`.
 */
function groupLooseThoughts(rows: ChatRow[], hasRuns: boolean): ChatRow[] {
  if (!hasRuns) return rows;
  const out: ChatRow[] = [];
  /**
   * The thinking a row stands for, when a thought is all it holds.
   *
   * Two shapes reach here: a bare thought row, and the group `rowsOf` opened around one when no
   * fold was open to take it. A group of one thought is not a group -- it draws a header for a
   * single line -- so both are decided the same way.
   */
  const loneThoughtOf = (row: ChatRow | undefined): Extract<ChatItem, { kind: 'text' }> | undefined => {
    if (row?.kind === 'item' && isThoughtOnly(row.item)) return row.item;
    if (row?.kind === 'group' && row.items.length === 1 && isThoughtOnly(row.items[0]!)) {
      return row.items[0] as Extract<ChatItem, { kind: 'text' }>;
    }
    return undefined;
  };
  for (const row of rows) {
    const thought = loneThoughtOf(row);
    if (!thought) {
      out.push(row);
      continue;
    }
    const previous = out[out.length - 1];
    const run = thought.run;
    if (previous?.kind === 'group' && (run === undefined || previous.run.id === run.id)) {
      out[out.length - 1] = { ...previous, items: [...previous.items, thought] };
      continue;
    }
    // A run that travelled folded already holds this thought: the folded row *is* that run's work,
    // and expanding it hands the thought back with the rest. Drawn beside it instead, the answer's
    // thinking stood as a bare Reasoning line between the fold and the answer, on no spine and with
    // no dot (owner, 2026-11-19: "il y a encore les reasoning qui ne se groupe pas et qui n'ont pas
    // de dot").
    if (previous?.kind === 'folded' && run !== undefined && previous.run.id === run.id) continue;
    out.push({ kind: 'group', run: run ?? loneThoughts(thought), items: [thought] });
  }
  return out;
}

/**
 * Marks the segment a run is *still writing into*: the thread's last group, and only that one.
 *
 * A run is folded in segments, one per burst between the messages it wrote, and every one of them
 * used to be told "the run is still going". So three finished bursts of a live run all wore a
 * spinner and the same elapsed time, which read as three runs that had been going for twelve
 * minutes (owner, 2026-11-08: "il doit compter pour chaque groupe et se reset a chaque debut d'un
 * autre").
 *
 * The last group of the whole list, not the last one of each run: a thread has one run writing at a
 * time, and the items of that one run can carry more than one run id -- a card the app opened live
 * wears the id it minted before the server's page named it. Keyed per run, that put a spinner and a
 * clock on two finished segments at once, which is exactly the screenshot.
 */
function markLiveSegment(rows: ChatRow[]): ChatRow[] {
  // Only what stands after the last boundary is "now": a compaction cuts the fold, and the group
  // it left above the rule is the past, however much of its run has not been written yet.
  const afterRule = rows.reduce((at, row, index) => (row.kind === 'rule' ? index + 1 : at), 0);
  let last = -1;
  rows.forEach((row, index) => {
    if (index >= afterRule && row.kind === 'group' && row.run.status === 'running') last = index;
  });
  if (last < 0) return rows;
  return rows.map((row, index) => (index === last ? { ...row, live: true } : row));
}

/**
 * Whether a row is a message the empreinte can sign: a bubble, whoever wrote it -- the words, the
 * pictures, or the failure said in one. A notice, a command output, a location or a compaction
 * boundary draws apart from every message and is not one.
 */
function footAnchorOf(row: ChatRow): boolean {
  if (row.kind !== 'item' || row.item.kind !== 'text') return false;
  const item = row.item;
  // A sub-agent's return is a card, not a message: it has no action row to sign under, so the
  // run's empreinte gets its own row after it. Left as an anchor, the signature was simply not
  // drawn -- the card drew the turn, and `foot` went nowhere.
  if (item.from?.kind === 'return') return false;
  return (
    item.command !== true &&
    item.notice !== true &&
    item.summaryOf === undefined &&
    item.compactionMs === undefined &&
    item.compactionStopped !== true &&
    item.location === undefined &&
    item.details === undefined
  );
}

/**
 * Marks where each finished run ends: the row its empreinte draws under, or the empreinte alone.
 *
 * Computed here rather than in the renderer: a run's rows sit in order, and only the list that
 * built them knows which one a reader meets last. The run's span and status are facts of the run
 * (the owner: the old `2 h 33 min` in a fold title "c'est pour toute la run"), so the mark lands
 * on the very last thing the run drew:
 *
 * - its last message, the answer it closed on: the signature under that message;
 * - its last fold, when it stopped in the middle of its work: a line under the fold, never in its
 *   title, where it read as the fold's own time ("on a l'impression que c'est le temps du dernier
 *   regroupement", 2026-09-22);
 * - or its own row, when the run's tail is a notice or a thought, or when the run drew nothing at
 *   all -- `ghosts` holds where those stand.
 */
function markRunFeet(rows: ChatRow[], ghosts: readonly { run: RunInfo; at: number }[]): ChatRow[] {
  const last = new Map<string, number>();
  rows.forEach((row, index) => {
    const run = row.kind === 'item' ? row.item.run : row.kind === 'group' || row.kind === 'folded' ? row.run : undefined;
    if (!run || run.status === 'running' || run.invented) return;
    last.set(run.id, index);
  });
  if (last.size === 0 && ghosts.length === 0) return rows;

  // Insertions first, deepest index first, so no insertion moves the one below it. The rows
  // themselves are re-marked before that: marking replaces rows, it never adds any.
  const insertions: { at: number; run: RunInfo }[] = ghosts
    .filter(ghost => !last.has(ghost.run.id))
    .map(ghost => ({ at: ghost.at, run: ghost.run }));
  const marked = rows.map((row, index) => {
    const run = row.kind === 'item' ? row.item.run : row.kind === 'group' || row.kind === 'folded' ? row.run : undefined;
    if (!run || last.get(run.id) !== index) return row;
    if (row.kind === 'group' || row.kind === 'folded') return { ...row, foot: run };
    if (footAnchorOf(row)) return { ...row, foot: run };
    insertions.push({ at: index + 1, run });
    return row;
  });
  insertions.sort((a, b) => b.at - a.at);
  let out = marked;
  for (const insertion of insertions) {
    out = [...out.slice(0, insertion.at), { kind: 'foot', run: insertion.run }, ...out.slice(insertion.at)];
  }
  return out;
}