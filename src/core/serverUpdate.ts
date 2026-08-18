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
 * The other thing this owns is the verdict, which is genuinely not obvious. The server answers
 * *before* the unit runs, so `started` only means "asked". What happened afterwards is read from
 * two observations:
 *
 *   - the socket dropped, or not: the updater only stops the service when it has something to
 *     install, so no drop within the settle window means the registry had nothing
 *   - the version that comes back: different means the swap happened, identical after a drop
 *     means nothing was installed (or it was rolled back, which the journal can tell apart)
 *
 * Three outcomes, three sentences, none of them a disjunction the reader has to resolve.
 */

/** No restart within this window means the updater found nothing and never touched the service. */
export const SETTLE_MS = 20_000;
/** A restart that never comes back. Long enough for a slow swap plus the health check. */
export const STALLED_MS = 5 * 60_000;

export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'refused'; reason: 'busy' | 'denied' | 'failed'; detail?: string }
  /** Started. `sawDrop` is what tells "installing" apart from "nothing to install". */
  | { kind: 'running'; since: number; version: string; sawDrop: boolean }
  | { kind: 'done'; from: string; to: string }
  | { kind: 'unchanged'; version: string }
  | { kind: 'rolledBack'; version: string }
  | { kind: 'stalled'; version: string };

export type UpdateEvent =
  | { type: 'asked' }
  | { type: 'sendFailed' }
  | { type: 'result'; frame: UpdateResultFrame; now: number }
  | { type: 'socket'; connected: boolean }
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
      return { kind: 'running', since: event.now, version, sawDrop: false };
    }
    case 'socket':
      // Only a drop is recorded here. The reconnection is not the end of the story: the version
      // it comes back with is, and that arrives in the `hello` right after.
      if (phase.kind !== 'running' || event.connected || phase.sawDrop) return phase;
      return { ...phase, sawDrop: true };
    case 'hello': {
      if (phase.kind !== 'running') return phase;
      if (event.version !== phase.version) return { kind: 'done', from: phase.version, to: event.version };
      if (phase.sawDrop) return { kind: 'rolledBack', version: event.version };
      return phase;
    }
    case 'tick': {
      if (phase.kind !== 'running') return phase;
      const waited = event.now - phase.since;
      if (!phase.sawDrop && waited >= SETTLE_MS) return { kind: 'unchanged', version: phase.version };
      if (phase.sawDrop && waited >= STALLED_MS) return { kind: 'stalled', version: phase.version };
      return phase;
    }
  }
}

/** The button is out of reach exactly while something is pending; nothing else disables it. */
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
      return phase.sawDrop
        ? 'the server is restarting · this page reconnects on its own'
        : `started on ${phase.version} · waiting to see whether it restarts`;
    case 'done':
      return `updated ${phase.from} → ${phase.to}`;
    case 'unchanged':
      return `already up to date (${phase.version}) · the updater found nothing to install`;
    case 'rolledBack':
      return `back on ${phase.version} · nothing was installed, see my-claw-update in the journal`;
    case 'stalled':
      return `the server has not come back · check my-claw-update in the journal`;
  }
}
