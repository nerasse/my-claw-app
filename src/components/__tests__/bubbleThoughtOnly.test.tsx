/**
 * A bubble that is nothing but a thought.
 *
 * The model thinks, calls a tool, thinks again: between two calls the thread holds bubbles with no
 * words at all, only a reasoning line. Each of them used to close on its own action row -- a clock
 * and a `...` under an empty strip -- which read as a message that never arrived. The two marks move
 * into the reasoning line's head row instead, and the action row goes away. A bubble that says
 * something keeps both where they were (owner, 2026-11-08).
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Bubble } from '../Bubble';
import type { TextItem } from '../../core/chat';

const at = (hour: number, minute: number): number => new Date(2026, 10, 8, hour, minute).getTime();

function thought(extra: Partial<TextItem> = {}): TextItem {
  return {
    kind: 'text',
    id: 'm1',
    role: 'agent',
    text: '',
    attachments: [],
    streaming: false,
    ts: at(14, 6),
    reasoningTokens: 33,
    reasoningMs: 912,
    ...extra,
  };
}

function mount(item: TextItem, showTime = true): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Bubble item={item} mediaBase="" deviceInfo={null} grouped={false} showTime={showTime} onMenu={jest.fn()} />,
    );
  });
  return tree;
}

/** Every string the tree draws, in render order. */
function drawn(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => {
    const { children } = node.props;
    return Array.isArray(children) ? children.join('') : String(children);
  });
}

/** The action buttons a bubble draws: the copy and the `...` menu. */
function buttons(tree: ReactTestRenderer.ReactTestRenderer): number {
  return tree.root.findAll(
    node => typeof node.props.accessibilityLabel === 'string'
      && ['Message actions', 'Copy message'].includes(node.props.accessibilityLabel),
  ).length;
}

test('a thought alone keeps its clock and its menu, on the reasoning line', () => {
  const tree = mount(thought());
  expect(drawn(tree)).toContain('14:06');
  expect(buttons(tree)).toBeGreaterThan(0);
});

test('a thought alone draws no action row of its own', () => {
  const tree = mount(thought());
  // Everything the bubble draws sits in the reasoning line and its body: the row that used to close
  // an empty bubble is gone, so the clock is the last thing on the line that names the thought.
  const strings = drawn(tree);
  expect(strings.indexOf('14:06')).toBe(strings.length - 1);
});

test('a bubble that says something keeps its action row', () => {
  const tree = mount(thought({ text: 'je regarde les fichiers' }));
  expect(drawn(tree)).toContain('14:06');
  expect(drawn(tree)).toContain('je regarde les fichiers');
  expect(buttons(tree)).toBeGreaterThan(0);
  // The clock closes the row under the message, after its words.
  const strings = drawn(tree);
  expect(strings.indexOf('14:06')).toBeGreaterThan(strings.indexOf('je regarde les fichiers'));
});

test('a bubble carrying a file is not a thought alone', () => {
  const tree = mount(
    thought({ attachments: [{ id: 'a1', type: 'image', filename: 'shot.png', uri: 'file:///shot.png' }] }),
  );
  expect(buttons(tree)).toBeGreaterThan(0);
});
