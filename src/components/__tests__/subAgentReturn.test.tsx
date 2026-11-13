/**
 * A background sub-agent's return, on screen.
 *
 * The turn has `role: 'user'` because that is the role the prompt needs to answer it, so without
 * the `from` marker it drew as something the owner had typed -- his own voice introducing a report
 * he never wrote. The card says who reported and what became of the run, on the thread's neutral
 * surface.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { Bubble } from '../Bubble';
import { chatStore, type TextItem } from '../../core/chat';

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

function returnItem(over: Partial<TextItem> = {}): TextItem {
  return {
    kind: 'text',
    id: 'ret-1',
    role: 'user',
    text: 'three pages read, nothing actionable',
    attachments: [],
    streaming: false,
    from: { label: 'eyes', kind: 'return', status: 'complete' },
    ts: Date.now(),
    ...over,
  };
}

async function render(item: TextItem): Promise<string[]> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true }}>
        <Bubble item={item} onMenu={() => {}} onCopy={() => {}} onResend={() => {}} mediaBase="" />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return tree.root.findAllByType('Text' as never).map((node) => String(node.props.children));
}

test("a return names the agent that reported, and what became of its run", async () => {
  const texts = await render(returnItem());
  expect(texts).toContain('eyes');
  expect(texts).toContain('returned');
  expect(texts.some((t) => t.includes('three pages read'))).toBe(true);
});

test('a failed return says failed, not returned', async () => {
  const texts = await render(returnItem({ from: { label: 'eyes', kind: 'return', status: 'error' }, text: 'the provider refused' }));
  expect(texts).toContain('failed');
  expect(texts).not.toContain('returned');
});

test('an owner message carries no return header', async () => {
  const texts = await render(returnItem({ from: undefined, text: 'hello' }));
  expect(texts).not.toContain('returned');
});

test('the store draws a live return as a turn of its own, once', () => {
  // The singleton: the frame router writes through it, and the idempotence is what keeps a
  // reconnect from drawing the same return twice.
  chatStore.addSubAgentReturn('t1', 'ret-1', 'the report', 'subagent/eyes-1a2b', 'eyes', 'complete');
  chatStore.addSubAgentReturn('t1', 'ret-1', 'the report', 'subagent/eyes-1a2b', 'eyes', 'complete');
  const items = chatStore.getItems('t1');
  expect(items).toHaveLength(1);
  const item = items[0]!;
  expect(item.kind).toBe('text');
  if (item.kind !== 'text') throw new Error('expected a text item');
  expect(item.from).toEqual({ label: 'eyes', kind: 'return', status: 'complete' });
  expect(item.text).toBe('the report');
});
