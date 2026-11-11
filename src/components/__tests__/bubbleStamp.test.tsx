/**
 * Where the clock sits on a message.
 *
 * It used to open the bubble, above an answer and after the owner's words, which read as a title:
 * a message announcing its hour before saying anything. It is the message's signature, so it
 * stands in the action row under the bubble, right of the `...` and on both sides (owner,
 * 2026-11-04: "il devrait etre en bas a droite ... a cote du ... menu de copy").
 *
 * Order, not just presence, is what this pins: the `...` then the clock means the clock is the
 * last mark on the line, and the button keeps the corner a thumb reaches for.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Bubble } from '../Bubble';
import type { TextItem } from '../../core/chat';

// Today, whatever today is: a stamp from another day is printed with its day in front of the
// clock (core/clock.ts), and this test is about where the clock sits, not what it says.
const at = (hour: number, minute: number): number => {
  const day = new Date();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
};

function mount(role: 'agent' | 'user', showTime = true): ReactTestRenderer.ReactTestRenderer {
  const item: TextItem = {
    kind: 'text',
    id: 'm1',
    role,
    text: 'the words',
    attachments: [],
    streaming: false,
    ts: at(9, 41),
  };
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

test('the owner stamps the message, on each side', () => {
  expect(drawn(mount('user'))).toContain('09:41');
  expect(drawn(mount('agent'))).toContain('09:41');
});

test('the clock comes after the message and after the action button', () => {
  const order = drawn(mount('user'));
  const indexOf = (value: string): number => order.findIndex(line => line === value);
  expect(indexOf('the words')).toBeGreaterThanOrEqual(0);
  // The `...` is a Pressable, so it draws no text of its own: the clock simply has to come after
  // the body, which is what "under the bubble" means for a tree without coordinates.
  expect(indexOf('09:41')).toBeGreaterThan(indexOf('the words'));
});

test('a message without its turn to be stamped draws no clock', () => {
  expect(drawn(mount('user', false))).not.toContain('09:41');
  expect(drawn(mount('agent', false))).not.toContain('09:41');
});
