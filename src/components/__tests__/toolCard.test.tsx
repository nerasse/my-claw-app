/**
 * ToolCard expansion is owned by the server pref:
 * - expandTools off (default): the card NEVER auto-opens, not even while a tool runs. Only the
 *   owner's tap opens it, and a tap survives the settle.
 * - expandTools on: the card opens when the run starts and stays open while it runs; after the
 *   settle it stays open too (the pref means "always expand").
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ToolCard } from '../ToolCard';
import type { ToolItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

function makeItem(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: 'tool-1',
    kind: 'tool',
    name: 'bash',
    args: { command: 'sleep 1' },
    ok: true,
    output: '',
    truncated: false,
    ts: Date.now(),
    ...overrides,
  };
}

function renderTool(item: ToolItem, props: Record<string, unknown> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <ToolCard item={item} {...props} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function bodyVisible(tree: ReactTestRenderer.ReactTestRenderer): boolean {
  return tree.root
    .findAllByType(Text)
    .some(t => t.props.children === 'arguments' || t.props.children === 'output');
}

function updateItem(tree: ReactTestRenderer.ReactTestRenderer, item: ToolItem, props: Record<string, unknown> = {}) {
  ReactTestRenderer.act(() => {
    tree.update(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <ToolCard item={item} {...props} />
      </ThemeContext.Provider>,
    );
  });
}

describe('ToolCard expansion pref', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does NOT auto-open while running when expandTools is off', () => {
    const tree = renderTool(makeItem({ running: true }));
    expect(bodyVisible(tree)).toBe(false);
    // First chunk arrives: still collapsed.
    updateItem(tree, makeItem({ running: true, output: 'chunk' }));
    expect(bodyVisible(tree)).toBe(false);
    // Settles: still collapsed, no flash possible.
    updateItem(tree, makeItem({ running: false, output: 'result', ok: true }));
    expect(bodyVisible(tree)).toBe(false);
  });

  it('does NOT auto-open a spawn run when expandTools is off', () => {
    const tree = renderTool(makeItem({ running: false }), {
      spawn: { subagentId: 's1', displayName: 'agent', status: 'running' },
    });
    expect(bodyVisible(tree)).toBe(false);
  });

  it('auto-opens while running when expandTools is on', () => {
    const tree = renderTool(makeItem({ running: true }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
  });

  it('stays open after the settle when expandTools is on', () => {
    const tree = renderTool(makeItem({ running: true }), { expandTools: true });
    updateItem(tree, makeItem({ running: false, output: 'result' }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
  });

  it('a manual tap opens the card even with expandTools off, and the settle leaves it open', () => {
    const tree = renderTool(makeItem({ running: true }));
    expect(bodyVisible(tree)).toBe(false);
    ReactTestRenderer.act(() => {
      // The header row is a Pressable labeled 'Tool bash, running'.
      const header = tree.root.find(
        node => node.props.accessibilityLabel === 'Tool bash, running' && typeof node.props.onPress === 'function',
      );
      header.props.onPress();
    });
    expect(bodyVisible(tree)).toBe(true);
    updateItem(tree, makeItem({ running: false, output: 'result' }));
    expect(bodyVisible(tree)).toBe(true);
  });
});
