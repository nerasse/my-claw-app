/**
 * How a call ended, in one vocabulary.
 *
 * Before this, the same fact had four spellings: `failed` on a tool, `error` on a sub-agent,
 * `interrupted` here and `aborted` there, and a `truncated` that only existed inside the output
 * fold's label. A reader comparing two cards was comparing words, not states.
 *
 * The set is closed on purpose. A tool or a sub-agent is running, done, failed, stopped (the run
 * ended under it) or truncated (its output was clipped by the server, not by an error).
 */
export type RunState = 'running' | 'done' | 'failed' | 'stopped' | 'truncated';

export interface StateSource {
  /** Still executing. */
  running?: boolean;
  /** The call came back with an error. */
  ok?: boolean;
  /** The run ended before this call reported (a tool the store froze). */
  interrupted?: boolean;
  /** A sub-agent the owner or the scheduler stopped. */
  aborted?: boolean;
  /** The server clipped the payload. */
  truncated?: boolean;
}

export function runStateOf(source: StateSource): RunState {
  if (source.running) return 'running';
  if (source.aborted || source.interrupted) return 'stopped';
  if (source.ok === false) return 'failed';
  if (source.truncated) return 'truncated';
  return 'done';
}

/**
 * The word drawn on a card's head, or null when the head already says it: a spinner for running,
 * a duration for done. A card that spelled out "done" next to "1.2s" would be saying it twice.
 */
export function stateWord(state: RunState): string | null {
  switch (state) {
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'stopped';
    case 'truncated':
      return 'truncated';
    default:
      return null;
  }
}
