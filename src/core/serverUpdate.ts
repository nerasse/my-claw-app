import type { UpdateResultFrame } from './protocol';

/**
 * What the update button knows, as a state machine rather than as booleans derived at render.
 *
 * The first version compared the running version against the one the server reported, and called
 * that "an update is in flight". It is a proxy, and it broke the moment the version was unknown:
 * a client that had not seen a `hello` yet re-enabled the button after every answer, and one
 * press became five requests and five systemd jobs. Asking is a fact of its own, so it is stored
 * as one.
 *
 * The server answers *before* the unit runs, so `started` only means "asked", not that the
 * update succeeded. A socket that stays connected cannot tell a no-op apart from a slow job
 * or a failure before the restart. After the observation window, the outcome is unconfirmed;
 * the journal is the source of truth until the server announces a different version.
 *
 * A late restart is still observed. A different version confirms the swap; the same version
 * after a drop means nothing changed (or it was rolled back, which the journal can tell apart).
 */

/** No restart within this window leaves the outcome unconfirmed, not "up to date". */
export const SETTLE_MS = 20_000;
/**
 * A restart that never comes back, counted from the drop: a slow job can stop the server minutes
 * after it was asked, and counting from the ask called a server that had just gone down "not
 * come back" (PR #4 review, 2026-10-05). Long enough for a slow swap plus the health check.
 */
export const STALLED_MS = 5 * 60_000;

export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'refused'; reason: 'busy' | 'denied' | 'failed'; detail?: string }
  /** Acknowledged. `droppedAt` records a possible restart, not the updater's job status. */
  | { kind: 'running'; since: number; version: string; droppedAt?: number }
  | { kind: 'done'; from: string; to: string }
  | { kind: 'unconfirmed'; since: number; version: string }
  | { kind: 'rolledBack'; version: string }
  | { kind: 'stalled'; version: string };

export type UpdateEvent =
  | { type: 'asked' }
  | { type: 'sendFailed' }
  | { type: 'result'; frame: UpdateResultFrame; now: number }
  | { type: 'socket'; connected: boolean; now: number }
  | { type: 'hello'; version: string }
  | { type: 'tick'; now: number };

export function reduceUpdate(phase: UpdatePhase, event: UpdateEvent): UpdatePhase {
  switch (event.type) {
    case 'asked':
      return { kind: 'asking' };
    case 'sendFailed':
      return phase.kind === 'asking' ? { kind: 'idle' } : phase;
    case 'result': {
      const { started, version, reason, detail } = event.frame;
      if (!started) {
        return { kind: 'refused', reason: reason ?? 'failed', ...(detail ? { detail } : {}) };
      }
      return { kind: 'running', since: event.now, version };
    }
    case 'socket':
      // Only a drop is recorded here. The reconnection is not the end of the story: the version
      // it comes back with is, and that arrives in the `hello` right after.
      if (event.connected) return phase;
      if (phase.kind === 'unconfirmed') return { ...phase, kind: 'running', droppedAt: event.now };
      if (phase.kind !== 'running' || phase.droppedAt !== undefined) return phase;
      return { ...phase, droppedAt: event.now };
    case 'hello': {
      if (phase.kind !== 'running' && phase.kind !== 'unconfirmed') return phase;
      if (event.version !== phase.version) return { kind: 'done', from: phase.version, to: event.version };
      if (phase.kind === 'running' && phase.droppedAt !== undefined) return { kind: 'rolledBack', version: event.version };
      return phase;
    }
    case 'tick': {
      if (phase.kind !== 'running') return phase;
      if (phase.droppedAt === undefined) {
        return event.now - phase.since >= SETTLE_MS ? { kind: 'unconfirmed', since: phase.since, version: phase.version } : phase;
      }
      return event.now - phase.droppedAt >= STALLED_MS ? { kind: 'stalled', version: phase.version } : phase;
    }
  }
}

/** Lock while asking or observing a restart. An unconfirmed outcome is not a job-status lock. */
export function updateBusy(phase: UpdatePhase): boolean {
  return phase.kind === 'asking' || phase.kind === 'running';
}

export function updateLabel(phase: UpdatePhase, now: number): string {
  if (phase.kind === 'asking') return 'Asking…';
  if (phase.kind === 'running') return `Updating… ${elapsed(now - phase.since)}`;
  return 'Update server';
}

/** `47s`, then `1m 47s`: the shape the server uses when it reports how long a run took. */
function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function updateHint(phase: UpdatePhase, connected: boolean): string {
  switch (phase.kind) {
    case 'idle':
      return connected
        ? 'runs the same check the server does every 15 minutes, now'
        : 'connect to the server to run an update';
    case 'asking':
      return 'asking the server…';
    case 'refused':
      if (phase.reason === 'busy') return 'a run is in flight · an update would interrupt it, try again after';
      if (phase.reason === 'denied') return 'the server may not start the update unit (sudoers drop-in missing)';
      return 'the server could not start the update';
    case 'running':
      return phase.droppedAt !== undefined
        ? 'the server is restarting · this page reconnects on its own'
        : `started on ${phase.version} · waiting to see whether it restarts`;
    case 'done':
      return `updated ${phase.from} → ${phase.to}`;
    case 'unconfirmed':
      return `update outcome unconfirmed (${phase.version}) · no restart observed · the job may still be running or may have failed · check my-claw-auto-update.service in the journal`;
    case 'rolledBack':
      return `back on ${phase.version} · nothing was installed, see my-claw-auto-update.service in the journal`;
    case 'stalled':
      return `the server has not come back · check my-claw-auto-update.service in the journal`;
  }
}
