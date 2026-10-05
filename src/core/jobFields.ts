import type { JobEntry, JobFieldsOut } from './protocol';

/**
 * The job settings the editor sets beside the prompt and the runtime: where the report goes, when
 * a long run is announced, the hard limit, and the conversation archive. The server's half is
 * src/channels/my-claw-app/job-fields.ts; docs/cron.md there.
 */

/** `thread`: one of the owner's conversations, by title. `target`: any other address, kept as is. */
export type DeliverKind = 'origin' | 'local' | 'thread' | 'target';

export interface JobLimits {
  deliver: DeliverKind;
  deliverThread: string;
  /** 0: the install's own. */
  alertAfterMs: number;
  /** 0: the install's own, which is no limit unless the install sets one. */
  timeoutMs: number;
  conversations: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const ALERT_PRESETS: readonly number[] = [30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR];
export const TIMEOUT_PRESETS: readonly number[] = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR];

export function limitsOf(job: JobEntry | null): JobLimits {
  return {
    deliver: job ? job.deliverKind ?? kindOf(job.deliver) : 'local',
    deliverThread: job?.deliverThread ?? '',
    alertAfterMs: job?.alertAfterMs ?? 0,
    timeoutMs: job?.timeoutMs ?? 0,
    conversations: job?.conversations === true,
  };
}

/** A server that predates `deliverKind` still says `origin` and `local` the same way. */
function kindOf(deliver: string): DeliverKind {
  return deliver === 'origin' || deliver === 'local' ? deliver : 'target';
}

/**
 * What the save carries: only what moved, so an edit never rewrites a field the owner did not
 * touch. A delivery the editor cannot express (`target`) is never sent.
 */
export function limitsOut(before: JobLimits, after: JobLimits): Pick<JobFieldsOut, 'deliver' | 'alertAfterMs' | 'timeoutMs' | 'conversations'> {
  const out: Pick<JobFieldsOut, 'deliver' | 'alertAfterMs' | 'timeoutMs' | 'conversations'> = {};
  const title = after.deliverThread.trim();
  if (after.deliver === 'thread') {
    if (before.deliver !== 'thread' || title !== before.deliverThread.trim()) out.deliver = { kind: 'thread', title };
  } else if (after.deliver !== 'target' && after.deliver !== before.deliver) {
    out.deliver = { kind: after.deliver };
  }
  if (after.alertAfterMs !== before.alertAfterMs) out.alertAfterMs = after.alertAfterMs;
  if (after.timeoutMs !== before.timeoutMs) out.timeoutMs = after.timeoutMs;
  if (after.conversations !== before.conversations) out.conversations = after.conversations;
  return out;
}

/** `30 min`, `1 h`, `1 h 30 min`, `2 d`. */
export function durationLabel(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} d`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
