import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { QuotaCard } from '../QuotaCard';
import { quotaStore } from '../../core/quota';
import type { QuotaOutcome } from '../../core/protocol';

const PROVIDER = 'chatgpt';

function outcome(usedPercent: number): QuotaOutcome {
  return {
    ok: true,
    snapshot: {
      provider: PROVIDER,
      source: 'codex',
      plan: 'plus',
      windows: [{ id: '18000', label: '5 h', usedPercent }],
      balances: [],
      extras: [],
      resets: { available: 2, nextExpiresAt: '2026-10-29T16:22:45.000Z' },
      fetchedAt: new Date().toISOString(),
    },
  };
}

const mounted: TestRenderer.ReactTestRenderer[] = [];

function show(usedPercent: number): TestRenderer.ReactTestRenderer {
  quotaStore.receive({ type: 'quota.state', provider: PROVIDER, outcome: outcome(usedPercent) });
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<QuotaCard provider={PROVIDER} />);
  });
  mounted.push(tree);
  return tree;
}

const texts = (tree: TestRenderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map((node) => (Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children))
    .filter((value): value is string => typeof value === 'string')
    .join(' | ');

function button(tree: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const node = tree.root.findAll(
    (candidate) => candidate.props?.accessibilityLabel === 'Use a reset' && typeof candidate.props?.onPress === 'function',
  )[0];
  if (!node) throw new Error('no reset button');
  return node;
}

afterEach(() => {
  // Unmounted first: the confirm timer of a pressed button would otherwise fire into a tree the
  // test has already stopped watching.
  for (const tree of mounted.splice(0)) act(() => tree.unmount());
  quotaStore.reset();
});

describe('a banked reset on the quota card', () => {
  test('is offered when a window is full, and says which credit expires first', () => {
    const tree = show(100);
    expect(texts(tree)).toContain('2 banked resets');
    expect(texts(tree)).toContain('one expires');
    expect(button(tree).props.accessibilityState.disabled).toBe(false);
  });

  test('is offered below the wall: spending a reset at 80% is the owner\'s call', () => {
    const tree = show(80);
    expect(texts(tree)).not.toContain('no window is full');
    expect(button(tree).props.accessibilityState.disabled).toBe(false);
  });

  test('asks twice before spending a credit', () => {
    const tree = show(100);
    act(() => button(tree).props.onPress());
    // The first tap only arms the confirmation: a credit is not spent by a stray touch.
    expect(texts(tree)).toContain('Tap again');
  });
});
