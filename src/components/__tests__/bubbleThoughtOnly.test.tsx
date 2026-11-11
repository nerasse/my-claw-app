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
import { resetAsideExpansion } from '../../core/asideExpansion';
import type { TextItem } from '../../core/chat';

// The fold belongs to the reading session, keyed by bubble id: one test opening `m1` would open it
// for the next one.
beforeEach(() => resetAsideExpansion());

// Today, whatever today is: a stamp from another day is printed with its day in front of the
// clock (core/clock.ts), and these assertions are about the clock alone.
const at = (hour: number, minute: number): number => {
  const day = new Date();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
};

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

/** Every accessibility label the tree carries. */
function labelsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string')
    .map(node => node.props.accessibilityLabel as string);
}

/** The action buttons a bubble draws: the copy and the `...` menu. */
function buttons(tree: ReactTestRenderer.ReactTestRenderer): number {
  return tree.root.findAll(
    node => typeof node.props.accessibilityLabel === 'string'
      && ['Message actions', 'Copy message'].includes(node.props.accessibilityLabel),
  ).length;
}

/**
 * Folded, a thought is one muted line and nothing else: no action row, no `...`, no clock. The
 * hour belongs to a message, or to a block the reader opened (owner, 2026-11-08: "quand un reasoning
 * est fermé, il ne faut pas afficher le wait, le copier et l'heure. Jamais.").
 */
test('a thought alone draws no action row, no menu and no clock while it is folded', () => {
  const tree = mount(thought());
  const strings = drawn(tree);
  expect(strings).not.toContain('14:06');
  expect(buttons(tree)).toBe(0);
  // What it does say: what the thinking cost.
  expect(strings).toContain('Reasoning');
  expect(strings).toContain('33 tokens');
});

test('a thought alone stamps its hour once the reader opens it', () => {
  // A thought with words is a fold; one the endpoint only counted is a single line with nothing to
  // open, and no hour either.
  const tree = mount(thought({ reasoning: 'le raisonnement complet, en clair' }));
  ReactTestRenderer.act(() => {
    tree.root
      .findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0]!
      .props.onPress();
  });
  const strings = drawn(tree);
  expect(strings).toContain('14:06');
  expect(strings[strings.length - 1]).toBe('14:06');
  expect(labelsOf(tree)).toContain('Copy reasoning');
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

/**
 * One minute, one stamp. A message draws its hour under itself; the reasoning inside it belongs to
 * the same instant, and stamping it again under the opened block read as a duplicate (owner,
 * 2026-11-08: "des fois ça fait doublon").
 */
test('a message that carries a reasoning stamps its minute once', () => {
  const tree = mount(thought({ text: 'je regarde les fichiers', reasoning: 'un long raisonnement' }));
  expect(drawn(tree).filter(line => line === '14:06')).toHaveLength(1);
  ReactTestRenderer.act(() => {
    tree.root
      .findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0]!
      .props.onPress();
  });
  expect(drawn(tree).filter(line => line === '14:06')).toHaveLength(1);
  // The open block still offers its own ways out.
  expect(labelsOf(tree)).toContain('Copy reasoning');
});

test('a bubble carrying a file is not a thought alone', () => {
  const tree = mount(
    thought({ attachments: [{ id: 'a1', type: 'image', filename: 'shot.png', uri: 'file:///shot.png' }] }),
  );
  expect(buttons(tree)).toBeGreaterThan(0);
});
