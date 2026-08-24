/**
 * A `spawn`/`send` card is a door, not a result. Everything here guards that: the way to the
 * sub-agent is reachable while the card is folded, and the head says who and in what state
 * without unfolding anything.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SubAgentCard } from '../SubAgentCard';
import type { ToolItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

function makeItem(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: 'tool-1',
    kind: 'tool',
    name: 'spawn',
    args: { name: 'digger', type: 'research', mode: 'session', task: 'read the reasoning flow' },
    ok: true,
    output: 'found it',
    truncated: false,
    ts: Date.now(),
    ...overrides,
  };
}

function render(item: ToolItem, props: Record<string, unknown> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <SubAgentCard item={item} {...props} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
    .filter(Boolean);
}

function door(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Open sub-agent ') &&
      typeof node.props.onPress === 'function',
    { deep: true },
  );
}

const DOOR = { subagent: { label: 'digger', status: 'idle' as const } };

it('offers the door without unfolding anything, and hands back the card id', () => {
  const onOpen = jest.fn();
  const tree = render(makeItem(), { ...DOOR, onOpen });
  const [button] = door(tree);
  expect(button).toBeDefined();
  ReactTestRenderer.act(() => button!.props.onPress());
  expect(onOpen).toHaveBeenCalledWith('tool-1');
  // Folded: the result is not on screen yet.
  expect(texts(tree)).not.toContain('found it');
});

it('names the sub-agent and its shape in the head, folded', () => {
  const tree = render(makeItem(), DOOR);
  const shown = texts(tree);
  expect(shown).toContain('digger');
  expect(shown).toContain('research · session');
});

it('has no door when the sub-agent is gone, and still says what was asked', () => {
  const tree = render(makeItem(), { onOpen: jest.fn() });
  expect(door(tree)).toHaveLength(0);
  expect(texts(tree)).toContain('read the reasoning flow');
});

it('shows the task and the result once unfolded', () => {
  const tree = render(makeItem(), DOOR);
  ReactTestRenderer.act(() => {
    tree.root
      .find(node => node.props.accessibilityLabel === 'Sub-agent digger' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  const shown = texts(tree);
  expect(shown).toContain('task');
  expect(shown).toContain('found it');
});

it('calls a send what it is: a message, not a task', () => {
  const tree = render(makeItem({ name: 'send', args: { id: 'subagent/digger-a1b2', message: 'status?' } }), DOOR);
  ReactTestRenderer.act(() => {
    tree.root
      .find(node => node.props.accessibilityLabel === 'Sub-agent digger' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  expect(texts(tree)).toContain('message');
  expect(texts(tree)).not.toContain('task');
});

it.each([
  ['running' as const, '● running'],
  ['complete' as const, '✓ done'],
  ['error' as const, 'error'],
  ['aborted' as const, 'aborted'],
])('says in the head that the run is %s', (status, expected) => {
  const tree = render(makeItem({ running: status === 'running' }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status },
  });
  expect(texts(tree)).toContain(expected);
});
