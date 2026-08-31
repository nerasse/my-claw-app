import {
  appUpdateHint,
  appUpdateLabel,
  compareVersions,
  reduceAppUpdate,
  type AppUpdateEvent,
  type AppUpdatePhase,
} from '../appUpdate';

/**
 * The app updater card's memory. Written as a reducer so the state transitions are testable
 * without a device, exactly like serverUpdate.test.ts.
 */

function run(events: AppUpdateEvent[], from: AppUpdatePhase = { kind: 'idle' }): AppUpdatePhase {
  return events.reduce(reduceAppUpdate, from);
}

describe('compareVersions', () => {
  it('compares major, minor and patch', () => {
    expect(compareVersions('0.5.10', '0.5.9')).toBeGreaterThan(0);
    expect(compareVersions('0.5.9', '0.5.10')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
  });

  it('treats equal versions and v-prefixed ones as equal', () => {
    expect(compareVersions('0.5.52', '0.5.52')).toBe(0);
    expect(compareVersions('v0.5.52', '0.5.52')).toBe(0);
  });

  it('handles missing parts as zero', () => {
    expect(compareVersions('0.5', '0.5.0')).toBe(0);
    expect(compareVersions('0.5', '0.5.1')).toBeLessThan(0);
    expect(compareVersions('0.6', '0.5.9')).toBeGreaterThan(0);
  });
});

describe('the app update phase', () => {
  it('moves from idle to checking then available on a newer version', () => {
    const phase = run([
      { type: 'checked', result: { ok: true, version: '0.5.53', apkSize: 45_000_000 }, current: '0.5.52' },
    ]);
    expect(phase).toEqual({ kind: 'available', version: '0.5.53', apkSize: 45_000_000 });
    expect(appUpdateHint(phase, true)).toContain('0.5.53 is available');
  });

  it('reports uptodate when the current version is the latest', () => {
    const phase = run([
      { type: 'checked', result: { ok: true, version: '0.5.52', apkSize: 45_000_000 }, current: '0.5.52' },
    ]);
    expect(phase).toEqual({ kind: 'uptodate', version: '0.5.52' });
  });

  it('becomes an error when the check fails', () => {
    const phase = run([
      { type: 'checked', result: { ok: false, error: 'FORGEJO_TOKEN is not set' }, current: '0.5.52' },
    ]);
    expect(phase).toEqual({ kind: 'error', message: 'FORGEJO_TOKEN is not set' });
  });

  it('tracks progress, then ready, then installing', () => {
    const phase = run(
      [
        { type: 'downloadStarted', version: '0.5.53', apkSize: 45_000_000 },
        { type: 'progress', version: '0.5.53', progress: 0.5 },
        { type: 'downloadDone', version: '0.5.53' },
        { type: 'installStarted', version: '0.5.53' },
      ],
      { kind: 'available', version: '0.5.53', apkSize: 45_000_000 },
    );
    expect(phase).toEqual({ kind: 'installing', version: '0.5.53' });
    expect(appUpdateLabel(phase)).toBe('Installing…');
  });

  it('ignores progress for a stale version', () => {
    const phase = run(
      [{ type: 'progress', version: '0.5.52', progress: 0.5 }],
      { kind: 'downloading', version: '0.5.53', apkSize: 45_000_000, progress: 0 },
    );
    expect(phase).toEqual({ kind: 'downloading', version: '0.5.53', apkSize: 45_000_000, progress: 0 });
  });
});
