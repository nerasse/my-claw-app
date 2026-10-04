import {
  SETTLE_MS,
  STALLED_MS,
  updateBusy,
  updateHint,
  updateLabel,
  reduceUpdate,
  type UpdateEvent,
  type UpdatePhase,
} from '../serverUpdate';

/**
 * The update button's memory.
 *
 * Written as a reducer so the case that actually shipped broken can be asserted: a client that
 * never saw a `hello` re-enabled the button after every answer, and one press became five
 * systemd jobs. That is the first test here.
 */

const T0 = 1_000_000;

function run(events: UpdateEvent[], from: UpdatePhase = { kind: 'idle' }): UpdatePhase {
  return events.reduce(reduceUpdate, from);
}

const started = (version: string, now = T0): UpdateEvent => ({
  type: 'result',
  frame: { type: 'update.result', started: true, version },
  now,
});

describe('the update phase', () => {
  it('stays locked after a start, even when no version was ever announced', () => {
    const phase = run([{ type: 'asked' }, started('0.4.5')]);
    expect(phase.kind).toBe('running');
    expect(updateBusy(phase)).toBe(true);
    // The regression: nothing about the lock may depend on knowing the running version.
    expect(updateBusy(run([{ type: 'socket', connected: true }], phase))).toBe(true);
  });

  it('frees the button on a refusal, which is not a swap window', () => {
    const phase = run([
      { type: 'asked' },
      { type: 'result', frame: { type: 'update.result', started: false, version: '0.4.5', reason: 'busy' }, now: T0 },
    ]);
    expect(phase).toEqual({ kind: 'refused', reason: 'busy' });
    expect(updateBusy(phase)).toBe(false);
  });

  it('keeps sudo\'s own words when the privilege is missing', () => {
    const phase = run([
      { type: 'asked' },
      {
        type: 'result',
        frame: { type: 'update.result', started: false, version: '0.4.5', reason: 'denied', detail: 'sudo: a password is required' },
        now: T0,
      },
    ]);
    expect(phase).toEqual({ kind: 'refused', reason: 'denied', detail: 'sudo: a password is required' });
    expect(updateHint(phase, true)).toContain('sudoers drop-in missing');
  });

  it('calls it updated when the server comes back on another version', () => {
    const phase = run([
      { type: 'asked' },
      started('0.4.5'),
      { type: 'socket', connected: false },
      { type: 'socket', connected: true },
      { type: 'hello', version: '0.4.6' },
    ]);
    expect(phase).toEqual({ kind: 'done', from: '0.4.5', to: '0.4.6' });
    expect(updateHint(phase, true)).toBe('updated 0.4.5 → 0.4.6');
  });

  it('says nothing was installed when the same version comes back after a restart', () => {
    const phase = run([
      { type: 'asked' },
      started('0.4.5'),
      { type: 'socket', connected: false },
      { type: 'socket', connected: true },
      { type: 'hello', version: '0.4.5' },
    ]);
    expect(phase).toEqual({ kind: 'rolledBack', version: '0.4.5' });
    expect(updateHint(phase, true)).toContain('nothing was installed');
  });

  it.each([
    'a registry check that found no update',
    'a download that failed before stopping the server',
    'a job still checking or downloading after 20 seconds',
  ])('leaves the outcome unconfirmed for %s', () => {
    // These jobs produce the same frames: an acknowledgement, then no restart or job result.
    // The client cannot infer which happened from silence, even after five minutes.
    const phase = run([{ type: 'asked' }, started('0.4.5'), { type: 'tick', now: T0 + SETTLE_MS }]);
    expect(phase).toEqual({ kind: 'unconfirmed', since: T0, version: '0.4.5' });
    expect(run([{ type: 'tick', now: T0 + STALLED_MS }], phase)).toEqual(phase);
    expect(updateHint(phase, true)).toBe(
      'update outcome unconfirmed (0.4.5) · no restart observed · the job may still be running or may have failed · check my-claw-auto-update.service in the journal',
    );
    expect(updateHint(phase, true)).not.toMatch(/already up to date|nothing to install|^updated/);
    // Preserve the existing timeout's button behavior without pretending the job finished.
    expect(updateBusy(phase)).toBe(false);
    expect(updateLabel(phase, T0 + SETTLE_MS)).toBe('Update server');
  });

  it('keeps observing a slow job that restarts after the outcome became unconfirmed', () => {
    const uncertain = run([{ type: 'asked' }, started('0.4.5'), { type: 'tick', now: T0 + SETTLE_MS }]);
    const restarting = run([{ type: 'socket', connected: false }], uncertain);
    expect(restarting).toEqual({ kind: 'running', since: T0, version: '0.4.5', sawDrop: true });
    expect(updateBusy(restarting)).toBe(true);
    const phase = run([
      { type: 'tick', now: T0 + SETTLE_MS + 30_000 },
      { type: 'socket', connected: true },
      { type: 'hello', version: '0.4.6' },
    ], restarting);
    expect(phase).toEqual({ kind: 'done', from: '0.4.5', to: '0.4.6' });
  });

  it('needs a changed version, not a repeated hello, to confirm an unobserved restart', () => {
    const uncertain = run([{ type: 'asked' }, started('0.4.5'), { type: 'tick', now: T0 + SETTLE_MS }]);
    expect(run([{ type: 'socket', connected: true }, { type: 'hello', version: '0.4.5' }], uncertain)).toEqual(uncertain);
    expect(run([{ type: 'hello', version: '0.4.6' }], uncertain)).toEqual({ kind: 'done', from: '0.4.5', to: '0.4.6' });
  });

  it('keeps waiting before the observation window is over', () => {
    const phase = run([{ type: 'asked' }, started('0.4.5'), { type: 'tick', now: T0 + SETTLE_MS - 1 }]);
    expect(phase.kind).toBe('running');
  });

  it('keeps observing a restart that begins inside the window', () => {
    const phase = run([
      { type: 'asked' },
      started('0.4.5'),
      { type: 'socket', connected: false },
      { type: 'tick', now: T0 + SETTLE_MS + 5_000 },
    ]);
    expect(phase.kind).toBe('running');
    expect(updateHint(phase, false)).toContain('the server is restarting');
  });

  it('gives up on a server that never comes back, and says where to look', () => {
    const phase = run([
      { type: 'asked' },
      started('0.4.5'),
      { type: 'socket', connected: false },
      { type: 'tick', now: T0 + STALLED_MS },
    ]);
    expect(phase).toEqual({ kind: 'stalled', version: '0.4.5' });
    expect(updateHint(phase, false)).toContain('my-claw-auto-update.service in the journal');
  });

  it('ignores a hello that belongs to no request', () => {
    expect(run([{ type: 'hello', version: '0.4.6' }])).toEqual({ kind: 'idle' });
    expect(run([{ type: 'socket', connected: false }])).toEqual({ kind: 'idle' });
  });

  it('returns the button when the frame could not even be sent', () => {
    expect(run([{ type: 'asked' }, { type: 'sendFailed' }])).toEqual({ kind: 'idle' });
  });

  it('counts up while it runs, and says so on the button', () => {
    const phase = run([{ type: 'asked' }, started('0.4.5')]);
    expect(updateLabel(phase, T0 + 14_000)).toBe('Updating… 14s');
    expect(updateLabel(phase, T0 + 74_000)).toBe('Updating… 1m 14s');
    expect(updateLabel({ kind: 'idle' }, T0)).toBe('Update server');
  });
});
