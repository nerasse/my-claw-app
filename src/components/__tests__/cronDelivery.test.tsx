/**
 * A scheduled job's report is a card, not a message -- and since 2026-11-17 it is also a door.
 *
 * The delivery arrives as the conversation's next turn (`role: 'user'` on the wire), and what
 * separates it from something the owner typed is the marker on the card and the way to the run
 * that wrote it. Everything here guards that: the job's name and cadence, what became of the run,
 * and a door that leads to the run's own conversation.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CronDelivery } from '../CronDelivery';
import type { TextItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

function makeItem(overrides: Partial<TextItem> = {}): TextItem {
  return {
    id: 'cron-1',
    kind: 'text',
    role: 'user',
    text: '[Cron: veille]\n\n## Results\n\n- Ready',
    attachments: [],
    streaming: false,
    from: { label: 'veille', kind: 'cron', cadence: 'every 1h', runId: 'cron-0123456789ab-1794938597013' },
    ts: Date.parse('2026-11-17T08:00:00.000Z'),
    ...overrides,
  } as TextItem;
}

function render(item: TextItem, props: Record<string, unknown> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <CronDelivery item={item} mediaBase="" deviceInfo={null} {...props} />
      </ThemeContext.Provider>,
    );
  });
  lastTree = tree;
  return tree;
}

let lastTree: ReactTestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (!lastTree) return;
  const tree = lastTree;
  lastTree = undefined;
  ReactTestRenderer.act(() => tree.unmount());
});

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => node.type === Text)
    .map(node => (Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? '')))
    .filter(Boolean);
}

function door(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Open the run of ') &&
      typeof node.props.onPress === 'function',
    { deep: true },
  );
}

it('names the job and how often it runs, and says the report landed', () => {
  const tree = render(makeItem());
  const shown = texts(tree);
  expect(shown).toContain('veille');
  expect(shown).toContain('every 1h');
  expect(shown).toContain('delivered');
});

it('offers a door to the run it came from, without unfolding the report', () => {
  const onOpenRun = jest.fn();
  const tree = render(makeItem(), { onOpenRun });
  const [button] = door(tree);
  expect(button).toBeDefined();
  expect(button!.props.accessibilityLabel).toBe('Open the run of veille');
  ReactTestRenderer.act(() => button!.props.onPress());
  expect(onOpenRun).toHaveBeenCalledWith('cron-0123456789ab-1794938597013');
  // Folded: the report is one line of preview, never the whole body.
  expect(texts(tree)).not.toContain('## Results');
});

it('draws no door on a delivery written before the run was recorded', () => {
  const tree = render(makeItem({ from: { label: 'veille', kind: 'cron', cadence: 'every 1h' } }), { onOpenRun: jest.fn() });
  expect(door(tree)).toHaveLength(0);
});

it('draws no door when the screen offers nowhere to go', () => {
  const tree = render(makeItem());
  expect(door(tree)).toHaveLength(0);
});
