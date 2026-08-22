/**
 * ToolCard live behaviour: a tool that starts streaming opens its card, stays open while it runs,
 * and folds back shortly after it settles — but never during the run, and never a hand-opened
 * card. Without the fold grace period, a fast tool reads as an open/close flash.
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

describe('ToolCard auto-open/fold', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens when a run starts (even before the first output chunk)', () => {
    const tree = renderTool(makeItem({ running: true }));
    expect(bodyVisible(tree)).toBe(true);
    // The settle must not fold an open card while it is still running.
    tree.update(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <ToolCard item={makeItem({ running: true, output: 'chunk' })} />
      </ThemeContext.Provider>,
    );
    expect(bodyVisible(tree)).toBe(true);
  });

  it('folds back shortly after the settle, not instantly', () => {
    jest.useFakeTimers();
    const tree = renderTool(makeItem({ running: true }));
    expect(bodyVisible(tree)).toBe(true);
    ReactTestRenderer.act(() => {
      tree.update(
        <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
          <ToolCard item={makeItem({ running: false, output: 'result', ok: true })} />
        </ThemeContext.Provider>,
      );
    });
    // Right after the settle the card is still open (grace period).
    expect(bodyVisible(tree)).toBe(true);
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(bodyVisible(tree)).toBe(false);
  });

  it('stays open after settle when expandTools is set', () => {
    jest.useFakeTimers();
    const tree = renderTool(makeItem({ running: true }), { expandTools: true });
    ReactTestRenderer.act(() => {
      tree.update(
        <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
          <ToolCard item={makeItem({ running: false, output: 'result' })} expandTools={true} />
        </ThemeContext.Provider>,
      );
    });
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(bodyVisible(tree)).toBe(true);
  });
});
