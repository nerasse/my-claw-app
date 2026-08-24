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
import { summarizeArgs } from '../../core/utils';
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

/**
 * The arguments are a fold of their own inside the card. An `apply_patch` call carries the whole
 * patch twice -- once as escaped JSON in the arguments, once as a readable diff in the output --
 * and the JSON was pushing the diff off the screen.
 */
describe('ToolCard arguments fold', () => {
  const PATCH = { path: '/tmp/a.ts', edits: [{ old: 'a\nb', new: 'c\nd' }] };

  function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
    return tree.root
      .findAllByType(Text)
      .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
      .filter(Boolean);
  }

  function toggleArgs(tree: ReactTestRenderer.ReactTestRenderer, name = 'bash') {
    ReactTestRenderer.act(() => {
      tree.root
        .find(node => node.props.accessibilityLabel === `Arguments of ${name}` && typeof node.props.onPress === 'function')
        .props.onPress();
    });
  }

  it('shows the output and only a preview of the arguments when the card opens', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'Patched, +3', running: true }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
    const shown = texts(tree);
    expect(shown).toContain('Patched, +3');
    // The preview line, not the serialized call.
    expect(shown).toContain(summarizeArgs(PATCH));
    expect(shown.some(t => t.includes('"edits"'))).toBe(false);
  });

  it('unfolds the arguments on tap and folds them back', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'ok', running: true }), { expandTools: true });
    toggleArgs(tree);
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(true);
    toggleArgs(tree);
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(false);
  });

  it('forgets an unfolded argument list when the card itself closes', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'ok', running: true }), { expandTools: true });
    toggleArgs(tree);
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(true);
    // The pref goes off: the card folds, and reopening it must start on the output again.
    updateItem(tree, makeItem({ args: PATCH, output: 'ok', running: false }));
    expect(bodyVisible(tree)).toBe(false);
    updateItem(tree, makeItem({ args: PATCH, output: 'ok', running: false }), { expandTools: true });
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(false);
  });
});
