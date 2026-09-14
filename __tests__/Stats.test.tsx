/**
 * @format
 *
 * The statistics page, from the More sheet to the figures on it.
 *
 * It is the one page of the app that is about the install rather than about a conversation, which
 * is why it hangs off More and not off a thread menu, and why its answer carries no `threadId` to
 * be matched against. What it owes the reader, and what this suite pins: the window it asked for
 * actually travels, the frontier between the two horizons is visible where it bites, a conversation
 * that no longer exists is marked as gone, and a refusal is shown instead of a spinner.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { statsStore } from '../src/core/stats';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';
import type { StatsPayload, StatsPeriod } from '../src/core/protocol';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

async function pressLabel(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const target = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  )[0];
  if (!target) throw new Error(`no pressable labelled ${label}`);
  await ReactTestRenderer.act(async () => target.props.onPress());
}

/** Everything drawn on screen, joined: the page states its figures in sentences, not in cells. */
function screen(tree: Tree): string {
  return textsOf(tree).join('\n');
}

/**
 * How many times one exact line is drawn. Host nodes only: the renderer exposes the composite
 * `Text` and the host one under it, so every string is in `textsOf` twice.
 */
function countText(tree: Tree, exact: string): number {
  return tree.root.findAll(node => typeof node.type === 'string' && node.props.children === exact, { deep: true }).length;
}

const ZERO = {
  errors: 0,
  cacheWriteTokens: 0,
  unpriced: 0,
  durationMs: 0,
};

/** A fabricated install: round numbers, invented ids, nothing read from anybody's account. */
function report(period: StatsPeriod, over: Partial<StatsPayload> = {}): StatsPayload {
  return {
    period,
    rollupIncluded: false,
    detailSince: '2026-05-04T08:00:00.000Z',
    totals: {
      calls: 40,
      errors: 2,
      promptTokens: 900_000,
      completionTokens: 30_000,
      cacheReadTokens: 300_000,
      cacheWriteTokens: 50_000,
      billedUsd: 12,
      referenceUsd: 3,
      unpriced: 4,
      durationMs: 600_000,
    },
    models: [
      { ...ZERO, model: 'vendor/model-big', provider: 'api.vendor.test', calls: 25, promptTokens: 700_000, completionTokens: 20_000, cacheReadTokens: 250_000, billedUsd: 12, referenceUsd: 0 },
      { ...ZERO, model: 'vendor/model-small', provider: 'api.other.test', variant: 'fp8', calls: 15, promptTokens: 200_000, completionTokens: 10_000, cacheReadTokens: 50_000, billedUsd: 0, referenceUsd: 3 },
    ],
    providers: [
      { ...ZERO, provider: 'api.vendor.test', calls: 25, promptTokens: 700_000, completionTokens: 20_000, cacheReadTokens: 250_000, billedUsd: 12, referenceUsd: 0 },
    ],
    sessions: [
      {
        ...ZERO,
        sessionId: 'fixture/alive',
        label: 'Plan de travail cuisine',
        labelSource: 'title',
        deleted: false,
        firstAt: '2026-05-04T08:00:00.000Z',
        lastAt: '2026-05-06T19:00:00.000Z',
        calls: 25,
        promptTokens: 700_000,
        completionTokens: 20_000,
        cacheReadTokens: 250_000,
        billedUsd: 9,
        referenceUsd: 0,
      },
      {
        ...ZERO,
        sessionId: 'fixture/gone',
        label: 'fixture/gone-7f3c1d',
        labelSource: 'id',
        deleted: true,
        firstAt: '2026-05-05T08:00:00.000Z',
        lastAt: '2026-05-05T09:00:00.000Z',
        calls: 15,
        promptTokens: 200_000,
        completionTokens: 10_000,
        cacheReadTokens: 50_000,
        billedUsd: 3,
        referenceUsd: 3,
      },
    ],
    daily: [
      { ...ZERO, date: '2026-05-04', calls: 10, promptTokens: 200_000, completionTokens: 6_000, cacheReadTokens: 60_000, billedUsd: 2, referenceUsd: 0 },
      { ...ZERO, date: '2026-05-05', calls: 25, promptTokens: 500_000, completionTokens: 18_000, cacheReadTokens: 200_000, billedUsd: 8, referenceUsd: 2 },
      { ...ZERO, date: '2026-05-06', calls: 5, promptTokens: 200_000, completionTokens: 6_000, cacheReadTokens: 40_000, billedUsd: 2, referenceUsd: 1 },
    ],
    reliability: [
      { key: 'vendor/model-small', kind: 'model', calls: 15, errors: 2, errorRatePct: 13.3, avgDurationMs: 21_000 },
      { key: 'api.vendor.test', kind: 'provider', calls: 25, errors: 0, errorRatePct: 0, avgDurationMs: 9_000 },
    ],
    cache: {
      promptTokens: 900_000,
      cacheReadTokens: 300_000,
      cacheWriteTokens: 50_000,
      readSharePct: 33.3,
      writeSharePct: 5.6,
    },
    callers: [
      { ...ZERO, caller: 'orchestrator', calls: 30, promptTokens: 700_000, completionTokens: 20_000, cacheReadTokens: 250_000, billedUsd: 10, referenceUsd: 0 },
      { ...ZERO, caller: 'subagent', calls: 10, promptTokens: 200_000, completionTokens: 10_000, cacheReadTokens: 50_000, billedUsd: 2, referenceUsd: 3 },
    ],
    reconciliation: [
      { provider: 'ledger.example', recordedUsd: 12, calls: 40, providerUsd: 17, deltaUsd: 5, balanceUsd: 6, providerUnread: false },
    ],
    filter: {},
    facets: {
      models: ['vendor/model-big', 'vendor/model-small'],
      providers: ['api.other.test', 'api.vendor.test'],
      callers: ['orchestrator', 'subagent'],
      sessions: [
        { sessionId: 'fixture/alive', label: 'Plan de travail cuisine', labelSource: 'title', deleted: false },
        { sessionId: 'fixture/gone', label: 'fixture/gone-7f3c1d', labelSource: 'id', deleted: true },
      ],
    },
    ...over,
  };
}

async function openStats(tree: Tree): Promise<void> {
  await pressLabel(tree, 'More');
  await pressLabel(tree, 'Statistics');
  await waitFor(() => labelsOf(tree).includes('Close statistics'));
}

beforeEach(() => {
  jest.clearAllMocks();
  statsStore.reset();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark' });
});

test('More opens the install-wide page, which asks for a window and says so while it waits', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);

    // Install-wide: the request carries a period and nothing else. No thread is named, because
    // no thread is being reported on.
    expect(sentFrames()).toContainEqual({ type: 'stats.get', period: '30d' });
    expect(screen(tree)).toContain('asking the server…');

    await emit({ type: 'stats.result', stats: report('30d') });
    await waitFor(() => screen(tree).includes('billed'));
    expect(screen(tree)).not.toContain('asking the server…');
  } finally {
    await unmount(tree);
  }
});

test('the window the owner presses is the window that travels, and a stale answer is refused', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'stats.result', stats: report('30d') });
    await waitFor(() => screen(tree).includes('last 30 days'));

    await pressLabel(tree, 'Period 7d');
    expect(sentFrames()).toContainEqual({ type: 'stats.get', period: '7d' });

    // The answer to the window the owner has left cannot land under a header reading "7d".
    await emit({ type: 'stats.result', stats: report('30d') });
    expect(screen(tree)).toContain('asking the server…');

    await emit({ type: 'stats.result', stats: report('7d') });
    await waitFor(() => screen(tree).includes('last 7 days'));
  } finally {
    await unmount(tree);
  }
});

test('the hero is the valuation, and its two parts are named under it', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'stats.result', stats: report('30d') });
    await waitFor(() => screen(tree).includes('at list price'));

    const text = screen(tree);
    // The figure an owner means by "what does this cost me in API terms", on an install whose
    // traffic is almost all subscription: the parts add up to it, and both are named.
    expect(text).toContain('$15.00');
    expect(text).toContain('$12.00 charged · metered endpoints');
    expect(text).toContain('$3.00 on a flat plan · subscription or plan, never billed per token');
    // Counted calls with no money behind them are stated rather than rounded away.
    expect(text).toContain('4 calls nothing could price');
  } finally {
    await unmount(tree);
  }
});

test('the tabs answer one question at a time instead of unrolling every section', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'stats.result', stats: report('30d') });
    await waitFor(() => screen(tree).includes('total · last 30 days'));

    // The overview is a shape: the totals, the timeline, who called, and the head of the ranking.
    expect(screen(tree)).toContain('top models');
    expect(screen(tree)).not.toContain('reliability');

    await pressLabel(tree, 'Models');
    await waitFor(() => screen(tree).includes('vendor/model-big'));
    expect(screen(tree)).toContain('by what they are worth');
    expect(screen(tree)).not.toContain('top models');

    await pressLabel(tree, 'Reliability');
    await waitFor(() => screen(tree).includes('mean latency only'));
    expect(screen(tree)).toContain('13.3%');

    // The filter row is above the tabs, so it never leaves the screen with one of them.
    expect(labelsOf(tree)).toContain('Model filter, off');
  } finally {
    await unmount(tree);
  }
});

test('a filter travels with the window, and an answer has to agree with both', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'stats.result', stats: report('30d') });
    await waitFor(() => screen(tree).includes('last 30 days'));

    await pressLabel(tree, 'Model filter, off');
    await waitFor(() => labelsOf(tree).includes('vendor/model-big'));
    await pressLabel(tree, 'vendor/model-big');

    expect(sentFrames()).toContainEqual({ type: 'stats.get', period: '30d', filter: { model: 'vendor/model-big' } });

    // The answer to the unfiltered window cannot land under a page that asked for a filter.
    await emit({ type: 'stats.result', stats: report('30d') });
    expect(screen(tree)).toContain('asking the server…');

    await emit({ type: 'stats.result', stats: report('30d', { filter: { model: 'vendor/model-big' } }) });
    await waitFor(() => labelsOf(tree).includes('Model filter, model-big, tap to change'));

    // A narrowed report that matches nothing says what narrowed it, and offers the way back.
    await emit({
      type: 'stats.result',
      stats: report('30d', {
        filter: { model: 'vendor/model-big', errorsOnly: true },
        totals: { ...report('30d').totals, calls: 0 },
      }),
    });
    // The filter it asked for and the one the answer carries differ: the page keeps what it has.
    await waitFor(() => labelsOf(tree).includes('Model filter, model-big, tap to change'));

    await emit({
      type: 'stats.result',
      stats: report('30d', {
        filter: { model: 'vendor/model-big' },
        totals: { ...report('30d').totals, calls: 0 },
      }),
    });
    await waitFor(() => screen(tree).includes('nothing matches model model-big.'));
    expect(labelsOf(tree)).toContain('Clear every filter');
  } finally {
    await unmount(tree);
  }
});

test('a conversation that no longer exists is listed and marked, never drawn as a living one', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'stats.result', stats: report('30d') });
    await pressLabel(tree, 'Conversations');
    await waitFor(() => screen(tree).includes('Plan de travail cuisine'));

    const labels = labelsOf(tree);
    expect(labels).toContain('deleted conversation fixture/gone-7f3c1d');
    expect(labels).toContain('conversation Plan de travail cuisine');
    // The ranking says how much of itself is gone, so a reader does not have to count badges.
    expect(screen(tree)).toContain('1 of them no longer exist on disk; their calls do.');
  } finally {
    await unmount(tree);
  }
});

test('on "all", the sections the rollup cannot fill say how far back they actually count', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await pressLabel(tree, 'Period all');
    expect(sentFrames()).toContainEqual({ type: 'stats.get', period: 'all' });

    await emit({
      type: 'stats.result',
      stats: report('all', { rollupIncluded: true, totalsSince: '2026-01' }),
    });
    await waitFor(() => screen(tree).includes('everything recorded'));

    const frontier = 'counts from 2026-05-04 only · the totals above reach back to 2026-01';
    // Once under the daily chart, and once over the per-session ranking: they are the two views
    // the per-call rows bound, and the tabs are what keeps them from being read as one screen.
    expect(countText(tree, frontier)).toBe(1);
    expect(screen(tree)).toContain('from 2026-01, rollup included');
    await pressLabel(tree, 'Conversations');
    await waitFor(() => screen(tree).includes('Plan de travail cuisine'));
    expect(countText(tree, frontier)).toBe(1);
  } finally {
    await unmount(tree);
  }
});

test('a window the server refuses is shown where it was asked for, with a way to ask again', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'error', scope: 'stats', message: 'invalid period' });
    await waitFor(() => screen(tree).includes('invalid period'));
    expect(screen(tree)).not.toContain('asking the server…');

    await pressLabel(tree, 'Ask again');
    expect(screen(tree)).toContain('asking the server…');
    expect(sentFrames().filter(frame => frame.type === 'stats.get')).toHaveLength(2);
  } finally {
    await unmount(tree);
  }
});

test('an install with nothing recorded in the window says so instead of drawing rows of zeroes', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({
      type: 'stats.result',
      stats: report('30d', {
        totals: {
          calls: 0,
          errors: 0,
          promptTokens: 0,
          completionTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          billedUsd: 0,
          referenceUsd: 0,
          unpriced: 0,
          durationMs: 0,
        },
        models: [],
        providers: [],
        sessions: [],
        daily: [],
        callers: [],
        reliability: [],
        reconciliation: [],
      }),
    });
    await waitFor(() => screen(tree).includes('nothing was called in this window'));
    // The period buttons stay reachable: the answer to an empty window is often a wider one.
    expect(labelsOf(tree)).toContain('Period all');
  } finally {
    await unmount(tree);
  }
});

test('the page closes back to where it was opened from, and asks again on the next visit', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    await emit({ type: 'stats.result', stats: report('30d') });
    await pressLabel(tree, 'Conversations');
    await waitFor(() => screen(tree).includes('Plan de travail cuisine'));

    await pressLabel(tree, 'Close statistics');
    await waitFor(() => !labelsOf(tree).includes('Close statistics'));
    // The report leaves with the page: nothing is watching, so a late answer has nowhere to land.
    expect(statsStore.getSnapshot().fetch).toBe('closed');
    expect(statsStore.getSnapshot().payload).toBeNull();

    // Nothing pushes an install-wide total, so a report kept from the last visit would be as old
    // as that visit: the page asks again rather than redrawing it.
    await openStats(tree);
    expect(screen(tree)).toContain('asking the server…');
    expect(sentFrames().filter(frame => frame.type === 'stats.get')).toHaveLength(2);
  } finally {
    await unmount(tree);
  }
});

test('a server that ignores the filter says so, instead of waiting for an answer never coming', async () => {
  const tree = await renderAppHome();
  try {
    await openStats(tree);
    // A payload with no `filter` field at all: what a server that predates the filter sends.
    const older = { ...report('30d') } as Record<string, unknown>;
    delete older.filter;
    await emit({ type: 'stats.result', stats: older });
    await waitFor(() => screen(tree).includes('total · last 30 days'));

    await pressLabel(tree, 'Model filter, off');
    await waitFor(() => labelsOf(tree).includes('vendor/model-big'));
    await pressLabel(tree, 'vendor/model-big');
    expect(screen(tree)).toContain('asking the server…');

    // The answer comes, but it is the whole window: refused, and said out loud.
    await emit({ type: 'stats.result', stats: older });
    await waitFor(() => screen(tree).includes('this server does not apply a filter'));
    expect(screen(tree)).not.toContain('asking the server…');
  } finally {
    await unmount(tree);
  }
});
