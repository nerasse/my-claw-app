/**
 * The reconciliation line on the page itself.
 *
 * Its own formatting is pinned in `statusReconciliation.test.ts`; what is proved here is the part
 * no string test can reach: it is drawn whether or not the conversation has spent anything, and a
 * server that never heard of the field leaves the page exactly as it was.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StatusScreen } from '../StatusScreen';
import { statusStore } from '../../core/status';
import type { StatusPayload, UsageReconciliation } from '../../core/protocol';

const RECONCILIATION: UsageReconciliation = {
  provider: 'openrouter.ai',
  recordedUsd: 2,
  calls: 12,
  windowDays: 90,
  providerUsd: 12.5,
  deltaUsd: 10.5,
  balanceUsd: 7.5,
  providerUnread: false,
};

function payload(over: Partial<StatusPayload> = {}): StatusPayload {
  return {
    session: { id: 'my-claw-app/thread/o/t1', createdAt: '2026-09-12T10:00:00.000Z', lastActiveAt: '2026-09-12T12:00:00.000Z', turns: 4 },
    model: { current: 'z-ai/glm-5.2', selfHosted: false, contextLimit: 200_000, contextNotes: ['declared'], timeout: '120s (default)' },
    context: { estimated: 1000, occupied: 1200, autoCompactOn: true, autoCompactThresholdPct: 80, autoCompactThresholdTokens: 160_000 },
    usage: {
      total: { calls: 12, errors: 0, promptTokens: 2_000_000, cacheReadTokens: 0, completionTokens: 1000, billedUsd: 2, referenceUsd: 0, unpriced: 0 },
      own: {
        calls: 12, errors: 0, promptTokens: 2_000_000, cacheReadTokens: 0, completionTokens: 1000, billedUsd: 2, referenceUsd: 0, unpriced: 0,
        durationMs: 1000,
        rows: [{ model: 'z-ai/glm-5.2', provider: 'openrouter.ai', calls: 12, errors: 0, promptTokens: 2_000_000, cacheReadTokens: 0, completionTokens: 1000, costUsd: 2, costBilled: true, costApproximate: false }],
      },
      agents: [],
    },
    runtime: { runs: [], compacting: false, verbose: true, approvedTools: [] },
    ...over,
  };
}

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    const collect = (value: unknown): void => {
      if (typeof value === 'string') out.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
    };
    collect(node.props.children);
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'props' in (child as object)) {
        walk(child as ReactTestRenderer.ReactTestInstance);
      }
    }
  };
  walk(tree.root);
  return out;
}

function drawn(status: StatusPayload): string[] {
  ReactTestRenderer.act(() => statusStore.open('t1'));
  ReactTestRenderer.act(() => {
    statusStore.receive({ type: 'status.result', threadId: 't1', status });
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<StatusScreen onClose={() => {}} />);
  });
  return textsOf(tree);
}

afterEach(() => {
  ReactTestRenderer.act(() => statusStore.reset());
});

describe('the reconciliation line on the page', () => {
  test('is drawn under the usage figures when the server sends one', () => {
    const texts = drawn(payload({ reconciliation: RECONCILIATION }));
    expect(texts).toContain('openrouter.ai · they charged $12.50 · we recorded $2.00 · gap +$10.50');
  });

  test('is drawn on a conversation that has spent nothing, because the money is the account\u2019s', () => {
    // `usage` is null the moment nothing has been called here, and the key was still billed.
    const texts = drawn(payload({ usage: null, reconciliation: RECONCILIATION }));
    expect(texts).toContain('nothing has been called here yet.');
    expect(texts).toContain('openrouter.ai · they charged $12.50 · we recorded $2.00 · gap +$10.50');
  });

  test('leaves the page untouched on a server that never heard of the field', () => {
    const texts = drawn(payload());
    expect(texts.some(t => t.includes('we recorded'))).toBe(false);
    expect(texts.some(t => t.includes('provider not reached'))).toBe(false);
    // The rest of the card is still there: the absent field costs a line, not the page.
    expect(texts).toContain('this conversation');
  });
});
