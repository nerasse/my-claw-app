/**
 * The sub-agent roster, on screen.
 *
 * It is a list, not a stack of cards, and the order is the last message -- not the server's own
 * filing of named-before-temporary and then by agent type, which put the agent that answered a
 * minute ago wherever its type alphabetically fell (owner, 2026-11-13).
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AgentsScreen } from '../AgentsScreen';
import { rosterRows } from '../../core/subagents';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import type { SubAgentEntry } from '../../core/protocol';

const entry = (over: Partial<SubAgentEntry> & Pick<SubAgentEntry, 'id'>): SubAgentEntry => ({
  threadId: `sub-${over.id.replace(/\W/g, '')}`,
  displayName: over.id.replace(/^subagent\//, ''),
  type: 'research',
  messageCount: 2,
  status: 'idle',
  visibility: 'private',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

let mounted: ReactTestRenderer.ReactTestRenderer | undefined;

afterEach(() => {
  if (!mounted) return;
  const tree = mounted;
  mounted = undefined;
  ReactTestRenderer.act(() => tree.unmount());
});

function render(agents: SubAgentEntry[]): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <AgentsScreen
            parentTitle="a conversation"
            rows={rosterRows(agents)}
            status="ready"
            onClose={() => {}}
            onOpenAgent={() => {}}
          />
        </SafeAreaProvider>
      </ThemeContext.Provider>,
    );
  });
  mounted = tree;
  return tree;
}

/**
 * The rows, in the order the list draws them.
 *
 * Deduplicated: a `Pressable` renders its host view with the same props, so every row is found
 * twice, and the order -- which is the whole point of this file -- survives a `Set`.
 */
function rowLabels(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  const labels = tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Open sub-agent '))
    .map(node => String(node.props.accessibilityLabel).replace('Open sub-agent subagent/', '').split(',')[0]!);
  return [...new Set(labels)];
}

test('draws the agents in the order of their last message, whatever their type', () => {
  const tree = render([
    entry({ id: 'subagent/old-0001', type: 'writer', lastMessageAt: '2026-05-01T10:00:00.000Z' }),
    entry({ id: 'subagent/new-0002', type: 'research', lastMessageAt: '2026-05-03T10:00:00.000Z' }),
    entry({ id: 'subagent/mid-0003', type: 'coder', lastMessageAt: '2026-05-02T10:00:00.000Z' }),
  ]);
  expect(rowLabels(tree)).toEqual(['new-0002', 'mid-0003', 'old-0001']);
});

test('there is no section header left to read: the date is the whole order', () => {
  const tree = render([
    entry({ id: 'subagent/a-0001', type: 'research', lastMessageAt: '2026-05-03T10:00:00.000Z' }),
    entry({ id: 'subagent/b-0002', type: 'writer', lastMessageAt: '2026-05-02T10:00:00.000Z' }),
  ]);
  const texts = tree.root.findAllByType(Text).map(node => String(node.props.children));
  for (const heading of ['named', 'temporary', 'research', 'writer', 'public']) {
    expect(texts).not.toContain(heading);
  }
});

test('a running agent is marked, an idle one is not', () => {
  const tree = render([
    entry({ id: 'subagent/busy-0001', status: 'running', lastMessageAt: '2026-05-03T10:00:00.000Z' }),
    entry({ id: 'subagent/idle-0002', lastMessageAt: '2026-05-02T10:00:00.000Z' }),
  ]);
  const busy = tree.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('busy-0001'),
  );
  const idle = tree.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('idle-0002'),
  );
  expect(busy.props.accessibilityLabel).toContain('running');
  expect(idle.props.accessibilityLabel).toContain('idle');
});

test('the header counts the agents and what is working', () => {
  const tree = render([
    entry({ id: 'subagent/a-0001', status: 'running' }),
    entry({ id: 'subagent/b-0002' }),
    entry({ id: 'subagent/c-0003' }),
  ]);
  const texts = tree.root.findAllByType(Text).map(node => String(node.props.children));
  expect(texts).toContain('a conversation · 3 agents · 1 running');
});

test('an empty roster says what the screen waits for', () => {
  const tree = render([]);
  const texts = tree.root.findAllByType(Text).map(node => String(node.props.children));
  expect(texts.some(text => text.includes('no sub-agent yet'))).toBe(true);
});
