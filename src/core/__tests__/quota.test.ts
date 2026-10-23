import { formatRemaining, formatReset } from '../../components/QuotaCard';
import { quotaRetryStore, quotaStore } from '../quota';
import type { QuotaOutcome } from '../protocol';

const NOW = Date.parse('2026-10-23T00:00:00.000Z');

describe('formatRemaining', () => {
  it('counts down in minutes, then hours, then days', () => {
    expect(formatRemaining('2026-10-23T00:00:30.000Z', NOW)).toBe('in under a minute');
    expect(formatRemaining('2026-10-23T00:23:00.000Z', NOW)).toBe('in 23 min');
    expect(formatRemaining('2026-10-23T01:20:00.000Z', NOW)).toBe('in 1 h 20');
    expect(formatRemaining('2026-10-26T04:00:00.000Z', NOW)).toBe('in 3 d 4 h');
  });

  it('is null once the reset has passed, and for a window with no reset', () => {
    expect(formatRemaining('2026-10-22T23:59:00.000Z', NOW)).toBeNull();
    expect(formatRemaining(undefined, NOW)).toBeNull();
  });
});

describe('formatReset', () => {
  it('names the time alone on the same day, the date otherwise', () => {
    const today = new Date();
    today.setHours(2, 30, 0, 0);
    expect(formatReset(today.toISOString())).toBe('02:30');
    const later = new Date(today.getTime() + 3 * 86_400_000);
    const hh = String(later.getHours()).padStart(2, '0');
    const mm = String(later.getMinutes()).padStart(2, '0');
    expect(formatReset(later.toISOString())).toBe(`${String(later.getDate()).padStart(2, '0')}/${String(later.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`);
  });
});

describe('quotaStore', () => {
  const outcome: QuotaOutcome = {
    ok: true,
    snapshot: {
      provider: 'claude-2',
      source: 'claude',
      windows: [{ id: 'session', label: '5 h', usedPercent: 100, resetAt: '2026-10-23T02:30:00.000Z' }],
      balances: [],
      extras: [],
      fetchedAt: '2026-10-23T00:00:00.000Z',
    },
  };

  afterEach(() => quotaStore.reset());

  it('keeps the last answer per provider and notifies on every change', () => {
    const listener = jest.fn();
    const off = quotaStore.subscribe(listener);
    quotaStore.receive({ type: 'quota.state', provider: 'claude-2', outcome });
    expect(quotaStore.get('claude-2')).toEqual(outcome);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('hands out the same object between two pushes, so a reader does not re-render on nothing', () => {
    quotaStore.receive({ type: 'quota.state', provider: 'claude-2', outcome });
    const first = quotaStore.all();
    expect(quotaStore.all()).toBe(first);
  });
});

describe('quotaRetryStore', () => {
  afterEach(() => quotaRetryStore.reset());

  it('stores the switch and the armed wait per conversation', () => {
    quotaRetryStore.receive({
      type: 'session.quotaRetry.state',
      threadId: 't1',
      enabled: true,
      waiting: { at: '2026-10-23T02:31:00.000Z', attempts: 1, windows: ['5 h'] },
    });
    expect(quotaRetryStore.get('t1')).toEqual({
      enabled: true,
      waiting: { at: '2026-10-23T02:31:00.000Z', attempts: 1, windows: ['5 h'] },
    });
    expect(quotaRetryStore.get('t2')).toBeUndefined();
  });

  it('does not notify when nothing moved', () => {
    const listener = jest.fn();
    const off = quotaRetryStore.subscribe(listener);
    quotaRetryStore.set('t1', { enabled: true });
    quotaRetryStore.set('t1', { enabled: true });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
