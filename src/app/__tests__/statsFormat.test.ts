/**
 * @format
 *
 * The four statements the statistics page is not allowed to get wrong, each reachable without
 * drawing nine sections to read one string.
 *
 * Two of them are the reason the page exists at all. The install has two horizons -- the monthly
 * rollup survives the 90-day purge, the per-call rows do not -- so a per-session ranking silently
 * starts months after the total printed above it, and a page that does not say so lies about one
 * of its two halves. And the hero is a valuation: it adds what was charged to what the flat-plan
 * half would have cost, which is one figure only because the parts are named under it.
 *
 * The other two are about what a row actually is: a conversation that no longer exists still spent
 * money, and a label the server could only fill with a session id is an id, not a title.
 */

import type {
  StatsPayload,
  StatsReconciliation,
  StatsSessionRow,
  StatsTotals,
} from '../../core/protocol';
import {
  horizonNote,
  listPrice,
  rowMoney,
  sessionLabel,
  sessionRowLabel,
  statsReconciliationLines,
  totalsMoneyLines,
} from '../StatsScreen';

function totals(over: Partial<StatsTotals> = {}): StatsTotals {
  return {
    calls: 10,
    errors: 0,
    promptTokens: 100_000,
    completionTokens: 8_000,
    cacheReadTokens: 40_000,
    cacheWriteTokens: 5_000,
    billedUsd: 0,
    referenceUsd: 0,
    unpriced: 0,
    durationMs: 60_000,
    ...over,
  };
}

function payload(over: Partial<StatsPayload> = {}): StatsPayload {
  return {
    period: 'all',
    rollupIncluded: true,
    detailSince: '2026-05-04T08:00:00.000Z',
    totalsSince: '2026-01',
    totals: totals(),
    models: [],
    providers: [],
    sessions: [],
    daily: [],
    reliability: [],
    cache: { promptTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, readSharePct: 0, writeSharePct: 0 },
    callers: [],
    reconciliation: [],
    filter: {},
    facets: { models: [], providers: [], callers: [], sessions: [] },
    ...over,
  };
}

function sessionRow(over: Partial<StatsSessionRow> = {}): StatsSessionRow {
  return {
    ...totals(),
    sessionId: 'fixture/one',
    label: 'Cuisine, plan de travail',
    labelSource: 'title',
    deleted: false,
    firstAt: '2026-05-04T08:00:00.000Z',
    lastAt: '2026-05-06T19:00:00.000Z',
    ...over,
  };
}

test('the frontier between the two horizons is named with both dates, not just the older one', () => {
  const note = horizonNote(payload());
  expect(note).toBe('counts from 2026-05-04 only · the totals above reach back to 2026-01');
});

test('there is no frontier to draw when both halves cover the same ground', () => {
  // A bounded window reads live rows alone: the rollup only ever holds what the purge deleted,
  // and the purge only deletes what is older than the widest bounded window.
  expect(horizonNote(payload({ period: '30d', rollupIncluded: false }))).toBeNull();
  // `all` on an install the purge has never run on: one horizon, so nothing to warn about.
  expect(horizonNote(payload({ totalsSince: undefined }))).toBeNull();
  // The rollup starts in the same month the per-call rows do: the sentence would say nothing.
  expect(horizonNote(payload({ totalsSince: '2026-05' }))).toBeNull();
});

test('the hero is the valuation, and the two figures it adds are named under it', () => {
  const lines = totalsMoneyLines(totals({ billedUsd: 12, referenceUsd: 3 }));
  expect(lines[0]).toBe('$12.00 charged · metered endpoints');
  expect(lines[1]).toBe('$3.00 on a flat plan · subscription or plan, never billed per token');
  // The parts are a partition of the hero, never a second figure beside it: a page showing $12,
  // $3 and a $15 total would be quoting three answers to one question.
  expect(listPrice(totals({ billedUsd: 12, referenceUsd: 3 }))).toBeCloseTo(15, 6);
  expect(lines.join(' ')).not.toContain('$15.00');
});

test('a ranking row makes the same valuation, and names the part that was taken', () => {
  expect(rowMoney(totals({ billedUsd: 12, referenceUsd: 3 }))).toBe('$15.00 · $12.00 charged');
  // Nothing charged: the flat-plan half stands alone, with no word for a charge that never was.
  expect(rowMoney(totals({ billedUsd: 12 }))).toBe('$12.00 charged');
  expect(rowMoney(totals({ referenceUsd: 3 }))).toBe('$3.00');
});

test('calls no ladder could price are stated, since they are counted but carry no money', () => {
  const lines = totalsMoneyLines(totals({ billedUsd: 12, unpriced: 4 }));
  expect(lines.some(line => line.includes('4 calls nothing could price'))).toBe(true);
  expect(rowMoney(totals({ unpriced: 4 }))).toBe('unpriced');
});

test('a conversation that no longer exists is announced as deleted, a living one is not', () => {
  expect(sessionRowLabel(sessionRow({ deleted: true }))).toBe('deleted conversation Cuisine, plan de travail');
  expect(sessionRowLabel(sessionRow())).toBe('conversation Cuisine, plan de travail');
});

test('a label the server could only fill with an id is drawn as an id: monospaced and cut', () => {
  const long = sessionLabel(
    sessionRow({ labelSource: 'id', label: 'fixture/agent-0123456789abcdef0123456789abcdef' }),
  );
  expect(long.mono).toBe(true);
  // Cut from the head, because the tail is the half that tells two ids apart.
  expect(long.text).toBe('…3456789abcdef0123456789abcdef');
  expect(long.text.length).toBe(30);

  // A title stays a title, whole and in the page's own face.
  const titled = sessionLabel(sessionRow());
  expect(titled).toEqual({ text: 'Cuisine, plan de travail', mono: false });

  // An opening message is a real label too: only `id` gets the id treatment.
  const opener = sessionLabel(sessionRow({ labelSource: 'first-message', label: 'regarde le disque du NAS' }));
  expect(opener).toEqual({ text: 'regarde le disque du NAS', mono: false });
});

function ledger(over: Partial<StatsReconciliation> = {}): StatsReconciliation {
  return {
    provider: 'ledger.example',
    recordedUsd: 8,
    calls: 30,
    providerUnread: false,
    ...over,
  };
}

test('a ledger that was read is shown beside ours, gap signed, with why it is never zero', () => {
  const [figures, note] = statsReconciliationLines(
    ledger({ providerUsd: 11, deltaUsd: 3, balanceUsd: 4 }),
  );
  expect(figures).toBe('ledger.example · they charged $11.00 · we recorded $8.00 · gap +$3.00');
  expect(note).toContain('30 calls recorded here');
  expect(note).toContain('their figure runs from the key, not the window');
  expect(note).toContain('balance $4.00');
});

test('a ledger nothing could read leaves our own sum standing, and says so rather than $NaN', () => {
  const [figures, note] = statsReconciliationLines(ledger({ providerUnread: true }));
  expect(figures).toBe('ledger.example · we recorded $8.00');
  expect(note).toBe('30 calls recorded here · provider not reached');
  expect(figures + note).not.toContain('NaN');

  // Same statement when the flag is clear but the figures never arrived.
  expect(statsReconciliationLines(ledger())[1]).toContain('provider not reached');

  // And the flag wins over figures that came with it: a ledger the server says it could not read
  // is one we have no current number for, whatever is still sitting in its cache.
  const stale = statsReconciliationLines(ledger({ providerUnread: true, providerUsd: 99, deltaUsd: 91 }));
  expect(stale[0]).toBe('ledger.example · we recorded $8.00');
  expect(stale.join(' ')).not.toContain('$99.00');
});

test('a gap the other way round keeps its sign: money we recorded that they never billed', () => {
  const [figures] = statsReconciliationLines(ledger({ providerUsd: 5, deltaUsd: -3 }));
  expect(figures).toContain('gap -$3.00');
});
