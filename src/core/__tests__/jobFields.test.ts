import { durationLabel, limitsOf, limitsOut } from '../jobFields';
import type { JobEntry } from '../protocol';

function entry(over: Partial<JobEntry> = {}): JobEntry {
  return {
    id: 'j',
    name: 'n',
    prompt: 'p',
    schedule: { kind: 'cron', expr: '0 8 * * *', display: '0 8 * * *' },
    enabled: true,
    silent: false,
    state: 'scheduled',
    repeat: null,
    completedRuns: 0,
    deliver: 'local',
    skillsMode: 'inherit',
    mcpMode: 'inherit',
    toolsMode: 'inherit',
    subagents: true,
    browser: true,
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: '2026-10-05T00:00:00.000Z',
    unknownModel: false,
    unknownWorkspace: false,
    unknownSkills: [],
    unknownMcp: [],
    unknownTools: [],
    ...over,
  };
}

test('a job reads as the server lists it, and a new one delivers nowhere with the defaults', () => {
  expect(limitsOf(null)).toEqual({ deliver: 'local', deliverThread: '', alertAfterMs: 0, timeoutMs: 0, conversations: false });
  expect(
    limitsOf(entry({ deliver: 'my-claw-app:neras:t1', deliverKind: 'thread', deliverThread: 'Crons career', alertAfterMs: 10_800_000, conversations: true })),
  ).toEqual({ deliver: 'thread', deliverThread: 'Crons career', alertAfterMs: 10_800_000, timeoutMs: 0, conversations: true });
});

test('a server without deliverKind still reads origin and local, and anything else as kept', () => {
  expect(limitsOf(entry({ deliver: 'origin' })).deliver).toBe('origin');
  expect(limitsOf(entry({ deliver: 'telegram:42' })).deliver).toBe('target');
});

test('only what moved is sent', () => {
  const before = limitsOf(entry({ deliver: 'my-claw-app:neras:t1', deliverKind: 'thread', deliverThread: 'Crons career' }));
  expect(limitsOut(before, before)).toEqual({});
  // The same title, spaces aside, is the same conversation: not looked up again.
  expect(limitsOut(before, { ...before, deliverThread: ' Crons career ' })).toEqual({});
  expect(limitsOut(before, { ...before, deliverThread: 'Veille' })).toEqual({ deliver: { kind: 'thread', title: 'Veille' } });
  expect(limitsOut(before, { ...before, deliver: 'local' })).toEqual({ deliver: { kind: 'local' } });
  expect(limitsOut(before, { ...before, alertAfterMs: 3_600_000, timeoutMs: 0, conversations: true })).toEqual({
    alertAfterMs: 3_600_000,
    conversations: true,
  });
});

test('back to the default is a 0 the server understands, and a kept address is never sent', () => {
  const before = limitsOf(entry({ deliver: 'telegram:42', deliverKind: 'target', alertAfterMs: 3_600_000, timeoutMs: 7_200_000 }));
  expect(limitsOut(before, { ...before, alertAfterMs: 0, timeoutMs: 0 })).toEqual({ alertAfterMs: 0, timeoutMs: 0 });
  expect(limitsOut({ ...before, deliver: 'local' }, before)).toEqual({});
});

test('durations read the way a person says them', () => {
  expect(durationLabel(30 * 60_000)).toBe('30 min');
  expect(durationLabel(3_600_000)).toBe('1 h');
  expect(durationLabel(90 * 60_000)).toBe('1 h 30 min');
  expect(durationLabel(48 * 3_600_000)).toBe('2 d');
});
