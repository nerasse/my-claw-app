/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { darkPalette, lightPalette } from '../src/theme/palettes';
import type { HistoryEntry } from '../src/core/protocol';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-ui';

const history: HistoryEntry[] = [
  { id: 'h-0', role: 'user', text: 'check the site', ts: '2026-01-01T10:00:00.000Z' },
  {
    role: 'tool',
    ts: '2026-01-01T10:00:01.000Z',
    id: 'h-1',
    name: 'bash',
    args: { command: 'echo hello' },
    durationMs: 4,
    ok: true,
    output: 'hello',
    truncated: false,
  },
  { id: 'h-2', role: 'assistant', text: 'the command replied', ts: '2026-01-01T10:00:02.000Z' },
];

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.props.children === 'string', { deep: true })
    .map(node => node.props.children as string);
}

async function renderWithHistory(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('a tool card starts collapsed and reveals arguments and output on tap', async () => {
  const tree = await renderWithHistory();

  // Collapsed: name plus a one-line argument preview, no output block.
  expect(textsOf(tree)).toContain('bash');
  expect(textsOf(tree)).toContain('echo hello');
  expect(textsOf(tree)).not.toContain('arguments');

  const card = tree.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Tool bash'),
  );
  expect(card.props.accessibilityLabel).toContain('4ms');

  await ReactTestRenderer.act(async () => {
    card.props.onPress();
  });

  const shown = textsOf(tree).join('|');
  expect(shown).toContain('hello');
  expect(shown).toContain('"command"');
  expect(textsOf(tree)).toContain('arguments');
  expect(textsOf(tree)).toContain('copy');

  await ReactTestRenderer.act(async () => tree.unmount());
});

test('the stored dark mode paints the shell dark', async () => {
  const tree = await renderWithHistory();
  const backgrounds = new Set<string>();
  for (const node of tree.root.findAll(() => true, { deep: true })) {
    for (const entry of [node.props.style].flat(3)) {
      const color = entry && typeof entry === 'object' ? (entry as { backgroundColor?: unknown }).backgroundColor : null;
      if (typeof color === 'string') backgrounds.add(color);
    }
  }
  expect(backgrounds).toContain(darkPalette.bg);
  expect(backgrounds).not.toContain(lightPalette.bg);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('bubbles stay compact: agent text sits in a tight bubble', async () => {
  const tree = await renderWithHistory();
  const bubbles = tree.root.findAll(
    node =>
      Array.isArray(node.props.style) &&
      node.props.style.some((entry: unknown) => entry && typeof entry === 'object' && 'paddingVertical' in (entry as object)),
    { deep: true },
  );
  const paddings = bubbles.flatMap(node =>
    (node.props.style as Array<Record<string, unknown> | null>)
      .filter(Boolean)
      .map(entry => entry!.paddingVertical)
      .filter((value): value is number => typeof value === 'number'),
  );
  expect(paddings.length).toBeGreaterThan(0);
  expect(Math.max(...paddings)).toBeLessThanOrEqual(8);
  await ReactTestRenderer.act(async () => tree.unmount());
});
