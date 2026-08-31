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

  it('does not let a periodic check reset an in-flight download', () => {
    const phase = run(
      [{ type: 'checked', result: { ok: true, version: '0.5.53', apkSize: 45_000_000 }, current: '0.5.52' }],
      { kind: 'downloading', version: '0.5.53', apkSize: 45_000_000, progress: 0.4 },
    );
    expect(phase).toEqual({ kind: 'downloading', version: '0.5.53', apkSize: 45_000_000, progress: 0.4 });
  });

  it('keeps a staged APK on ready when a failed install is followed by a check', () => {
    const phase = run(
      [{ type: 'checked', result: { ok: true, version: '0.5.53', apkSize: 45_000_000 }, current: '0.5.52' }],
      { kind: 'error', message: 'install failed', staged: '0.5.53' },
    );
    expect(phase).toEqual({ kind: 'ready', version: '0.5.53' });
  });

  it('re-offers a download when the staged APK is for an older release than the one published', () => {
    const phase = run(
      [{ type: 'checked', result: { ok: true, version: '0.5.54', apkSize: 45_000_000 }, current: '0.5.52' }],
      { kind: 'error', message: 'install failed', staged: '0.5.53' },
    );
    expect(phase).toEqual({ kind: 'available', version: '0.5.54', apkSize: 45_000_000 });
  });

  it('marks a failure after install as staged so the next tap installs again', () => {
    const phase = run(
      [{ type: 'failed', message: 'install failed', staged: true }],
      { kind: 'installing', version: '0.5.53' },
    );
    expect(phase).toEqual({ kind: 'error', message: 'install failed', staged: '0.5.53' });
  });

  it('leaves a failure unstaged when the device says the file is gone', () => {
    const phase = run(
      [{ type: 'failed', message: 'the downloaded file is gone, download it again', staged: false }],
      { kind: 'installing', version: '0.5.53' },
    );
    expect(phase).toEqual({
      kind: 'error',
      message: 'the downloaded file is gone, download it again',
      staged: undefined,
    });
  });

  it('does not mark a failed download as staged', () => {
    const phase = run(
      [{ type: 'failed', message: 'download failed', staged: false }],
      { kind: 'downloading', version: '0.5.53', apkSize: 45_000_000, progress: 0.5 },
    );
    expect(phase).toEqual({ kind: 'error', message: 'download failed', staged: undefined });
  });

  it('offers the install for an APK found on disk at launch', () => {
    const phase = run([{ type: 'stagedFound', version: '0.5.53' }]);
    expect(phase).toEqual({ kind: 'ready', version: '0.5.53' });
  });

  it('does not let a staged file interrupt a download in flight', () => {
    const phase = run([{ type: 'stagedFound', version: '0.5.53' }], {
      kind: 'downloading',
      version: '0.5.53',
      apkSize: 45_000_000,
      progress: 0.3,
    });
    expect(phase).toEqual({ kind: 'downloading', version: '0.5.53', apkSize: 45_000_000, progress: 0.3 });
  });
});
