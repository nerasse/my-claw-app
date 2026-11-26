import type { ChatItem } from './chat';

/**
 * A background sub-agent reporting back into the conversation that launched it -- what it is, and
 * how its card reads. Pure on purpose: the vocabulary is the part two components and three tests
 * have to agree on, so it lives nowhere near a render tree.
 *
 * The turn is stored as `role: 'user'` because that is the role the prompt needs to answer it (the
 * server writes a `<subagent …>` tag and the model answers it like an incoming message). Everything
 * here exists because that role is a fact about the wire, not about who wrote it: `from` is the
 * only thing that says an agent did, and every reader that asks "is this the owner speaking?" has
 * to consult it.
 */

/**
 * Whether this turn is a sub-agent's report rather than something a person typed.
 *
 * `kind` has two possible values on the wire, and only one is ever written today: `send` was
 * declared for a report a child hands back while it is being driven, and nothing emits it. Matching
 * on `from` alone would therefore draw such a turn correctly if it ever lands, but it would also
 * claim every future non-owner turn (a cron note, another conversation speaking) as a sub-agent's,
 * which is a different card. So the marker stays exact, and the day `send` is emitted this is the
 * one line to widen.
 */
export function isSubAgentReturn(item: ChatItem): boolean {
  // A job's notice rides the same card: same shape (an id, a label, how it ended), same question
  // the reader asks ("what reported, and what became of it"). Only the mark and the word differ.
  return item.kind === 'text' && (item.from?.kind === 'return' || item.from?.kind === 'job');
}

/**
 * Whether this turn is a scheduled job's delivery rather than something a person wrote.
 *
 * It arrives as `role: 'user'` for the same reason a sub-agent's return does -- the prompt needs a
 * turn in that role for the conversation's agent to have read the report. Drawn as one, it read as
 * the owner talking to himself (owner, 2026-11-15); the card is `CronDelivery`.
 *
 * Matched on the marker alone, like `isSubAgentReturn`: a delivery written before the server sent
 * `kind: 'cron'` keeps the plain bubble it has always been.
 */
export function isCronDelivery(item: ChatItem): boolean {
  return item.kind === 'text' && item.from?.kind === 'cron';
}

/**
 * What became of the run that reported, in one word.
 *
 * `returned` rather than `complete`: the card is signed by an agent handing something back, which
 * is the thing the reader is being told. `complete` is a status word about a machine's job, and it
 * would sit beside "failed" and "stopped" as if all three described the same kind of event.
 */
export function returnWord(status: string | undefined): string {
  if (status === 'error') return 'failed';
  if (status === 'stopped') return 'stopped';
  return 'returned';
}

/**
 * The same word for a job, whose end is its own event: a command does not "return", so the card
 * says what the shell did -- `done`, `failed`, `stopped`.
 */
export function jobWord(status: string | undefined): string {
  if (status === 'error') return 'failed';
  if (status === 'stopped') return 'stopped';
  return 'done';
}

/** The one line a folded card shows, out of a report that can be pages long. */
export function returnPreview(text: string, limit = 120): string {
  const line =
    text
      .split('\n')
      // A fence, a table rule or a heading mark is not a summary: the first line of prose is.
      .map(raw => raw.trim())
      .filter(raw => raw !== '' && !/^(```|~~~|\|)/.test(raw))
      .map(raw => raw.replace(/^[#>\s*-]+/, '').trim())
      .find(candidate => candidate !== '') ?? '';
  const flat = line.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}
