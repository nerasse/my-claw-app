/**
 * `BlockActions` exists because a native chat list cannot lift text out of itself
 * (docs/text-selection.md). A browser can, so there `select` disappears and `copy` stays
 * (owner, 2026-10-15: the button came back to the web).
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { BlockActions } from '../BlockActions';
import { CodeBlockBar } from '../CodeBlockBar';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

jest.mock('../../core/textSelection', () => ({ useOpenSelection: () => jest.fn() }));

// A getter, not `resetModules`: re-requiring the tree would give the test a second copy of React
// and every hook call would be invalid. The flag is read at render time, so flipping it is enough.
let mockSelectable = false;
jest.mock('../../core/platform', () => ({
  get chatSelectable() {
    return mockSelectable;
  },
}));

function render(node: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>{node}</ThemeContext.Provider>,
    );
  });
  return tree;
}

function labels(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
    .filter(Boolean);
}

describe('BlockActions', () => {
  it('offers copy and select where the platform cannot select in place', () => {
    mockSelectable = false;
    const tree = render(<BlockActions title="bash output" value="hello" />);
    expect(labels(tree)).toEqual(['copy', 'select']);
  });

  it('keeps copy and drops select where the browser selects on its own', () => {
    mockSelectable = true;
    const tree = render(<BlockActions title="bash output" value="hello" />);
    expect(labels(tree)).toEqual(['copy']);
  });
});

/** The strip over a fenced block carries the language and the copy, on every platform. */
describe('CodeBlockBar', () => {
  it('offers the copy where a selection cannot lift the block out', () => {
    mockSelectable = false;
    const tree = render(<CodeBlockBar value="const a = 1" language="ts" />);
    expect(labels(tree)).toEqual(['ts', 'copy']);
  });

  it('keeps the button in a browser too', () => {
    mockSelectable = true;
    const tree = render(<CodeBlockBar value="const a = 1" language="ts" />);
    expect(labels(tree)).toEqual(['ts', 'copy']);
  });
});
