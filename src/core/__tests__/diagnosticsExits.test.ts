/**
 * What Android's exit history turns into on the wire.
 *
 * The three crashes of 2026-09-15 arrived as `process exit: CRASH (crash)` and nothing else --
 * Android had kept a trace of each one and nothing read it, so the only way to attribute them was
 * a cable and `adb logcat -b crash`, on a phone that is not always on the network the machine
 * reading it lives on. These tests hold both halves of the fix: the trace travels, and it travels
 * clipped.
 */

import { deviceBridge } from '../nativeBridge';
import { exitReports, recordDiag, resetDiagnosticsForTest } from '../diagnostics';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const exit = (over: Partial<Parameters<typeof exitReports>[0]['exits'][number]> = {}) => ({
  reason: 'CRASH',
  at: 1_000,
  status: 0,
  description: 'crash',
  ...over,
});

describe('the exits Android kept', () => {
  it('carries the trace that names the thrower', () => {
    const { reports } = exitReports(
      {
        versionName: '0.6.74',
        exits: [exit({ trace: '*** *** ***\nbacktrace:\n  #00 pc 0000000000 libfoo.so\n' })],
      },
      0,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.stack).toContain('backtrace:');
    expect(reports[0]!.message).toBe('process exit: CRASH (crash)');
    expect(reports[0]!.appVersion).toBe('0.6.74');
  });

  it('says nothing about a death that is the owner closing the app', () => {
    // Reporting a normal exit would bury the crashes under it, which is the whole reason the
    // abnormal set exists.
    const { reports, newest } = exitReports({ versionName: '0.6.74', exits: [exit({ reason: 'USER_REQUESTED' })] }, 0);
    expect(reports).toEqual([]);
    expect(newest).toBe(1_000);
  });

  it('does not report the same death twice across a relaunch', () => {
    const info = { versionName: '0.6.74', exits: [exit({ at: 500 }), exit({ at: 2_000 })] };
    const { reports, newest } = exitReports(info, 1_000);
    expect(reports.map(r => r.at)).toEqual([2_000]);
    expect(newest).toBe(2_000);
  });

  it('leaves the newest death where it was when nothing is new', () => {
    const { reports, newest } = exitReports({ versionName: '0.6.74', exits: [exit({ at: 900 })] }, 1_000);
    expect(reports).toEqual([]);
    expect(newest).toBe(1_000);
  });

  it('reports a crash Android kept no trace of, without inventing one', () => {
    // The state of every crash we have seen so far: a reason and nothing to read. It must still be
    // reported -- a crash with no trace is a fact, and silence would be a lie.
    const { reports } = exitReports({ versionName: '0.6.74', exits: [exit()] }, 0);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.stack).toBeUndefined();
  });

  it('clips the trace where every other stack in this file is clipped', () => {
    // A tombstone runs past the register dump; the report carries the first screen and stops, the
    // same 8000 characters every other stack is held to. Read through what actually persists, so
    // the assertion is about the report that would travel and not about the pure mapping.
    resetDiagnosticsForTest();
    bridge.prefsSet.mockClear();
    const trace = `tombstone\n${'x'.repeat(9_000)}`;
    recordDiag(exitReports({ versionName: '0.6.74', exits: [exit({ trace })] }, 0).reports[0]!);
    const stored = JSON.parse(String(bridge.prefsSet.mock.calls.at(-1)![1])) as { stack?: string }[];
    expect(stored[0]!.stack).toHaveLength(8_000);
    expect(stored[0]!.stack!.startsWith('tombstone')).toBe(true);
  });
});
