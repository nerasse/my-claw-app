/**
 * A background sub-agent's return, on screen.
 *
 * The turn has `role: 'user'` because that is the role the prompt needs to answer it, so without
 * the `from` marker it drew as something the owner had typed -- his own voice introducing a report
 * he never wrote. It is a row of the thread now, the launch card's twin: who reported, one word for
 * what became of the run, one line of what came back, and everything else behind a tap.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { SubAgentReturn } from '../SubAgentReturn';
import { chatStore, type TextItem } from '../../core/chat';
import { isOwnerMessage } from '../../core/runRows';
import { returnPreview, returnWord } from '../../core/subagentReturn';
import { recallLines } from '../../core/recall';

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

async function render(item: TextItem): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <SubAgentReturn item={item} mediaBase="" deviceInfo={null} />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => String(node.props.children));

const head = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && typeof node.props.onPress === 'function',
  );

test('a return names the agent that reported, and what became of its run', async () => {
  const tree = await render(returnItem());
  const texts = textsOf(tree);
  expect(texts).toContain('eyes');
  expect(texts).toContain('returned');
});

test('a failed return says failed, not returned', async () => {
  const tree = await render(returnItem({ from: { label: 'eyes', kind: 'return', status: 'error' }, text: 'the provider refused' }));
  const texts = textsOf(tree);
  expect(texts).toContain('failed');
  expect(texts).not.toContain('returned');
});

/**
 * Folded, the card is one line of what came back: enough to know whether to open it, and nothing
 * that reads like a message. The body is behind the tap.
 */
test('folded, the card shows one line and keeps the report behind the tap', async () => {
  const body = 'line one of the report\nline two, much longer, with details';
  const tree = await render(returnItem({ text: body }));
  const texts = textsOf(tree);
  expect(texts).toContain('line one of the report');
  expect(texts.some(text => text.includes('line two'))).toBe(false);

  await ReactTestRenderer.act(async () => head(tree).props.onPress());
  expect(textsOf(tree).some(text => text.includes('line two, much longer'))).toBe(true);
});

/** A report with pictures on it is not a card that opens on nothing: the pictures are the report. */
test('a return carrying files starts open', async () => {
  const tree = await render(
    returnItem({
      text: 'here is the cart',
      attachments: [{ id: 'a1', type: 'image', filename: 'cart.png' }],
    }),
  );
  expect(textsOf(tree).some(text => text.includes('here is the cart'))).toBe(true);
});

/**
 * The turn sits in the log under the owner's role, so every reader of "what did the owner type"
 * has to skip it: the terminal recall above all, which offered a report as an earlier message.
 */
test('a return is not something the owner typed', () => {
  const items = [returnItem()];
  expect(isOwnerMessage(items[0]!)).toBe(false);
  expect(recallLines(items)).toEqual([]);
  // An ordinary turn of his still is one.
  expect(isOwnerMessage({ ...returnItem(), from: undefined } as TextItem)).toBe(true);
});

test('the vocabulary is one word per outcome, and a preview is one line', () => {
  expect(returnWord('complete')).toBe('returned');
  expect(returnWord('error')).toBe('failed');
  expect(returnWord('stopped')).toBe('stopped');
  expect(returnPreview('## Heading\n\nfirst real line\nsecond')).toBe('Heading');
  expect(returnPreview('x'.repeat(200)).endsWith('…')).toBe(true);
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
