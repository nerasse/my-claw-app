/**
 * `BlockActions` exists because a native chat list cannot lift text out of itself
 * (docs/text-selection.md). A browser can, so there the pair must disappear entirely rather than
 * sit twice on every tool card.
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
let mockSupported = true;
jest.mock('../../core/platform', () => ({
  get blockActionsSupported() {
    return mockSupported;
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
    mockSupported = true;
    const tree = render(<BlockActions title="bash output" value="hello" />);
    expect(labels(tree)).toEqual(['copy', 'select']);
  });

  it('renders nothing where the browser already does both', () => {
    mockSupported = false;
    const tree = render(<BlockActions title="bash output" value="hello" />);
    expect(labels(tree)).toEqual([]);
  });
});

/** Same rule for the strip over a fenced block: the language stays, the button does not. */
describe('CodeBlockBar', () => {
  it('offers the copy where a selection cannot lift the block out', () => {
    mockSupported = true;
    const tree = render(<CodeBlockBar value="const a = 1" language="ts" />);
    expect(labels(tree)).toEqual(['ts', 'copy']);
  });

  it('keeps the language and drops the button in a browser', () => {
    mockSupported = false;
    const tree = render(<CodeBlockBar value="const a = 1" language="ts" />);
    expect(labels(tree)).toEqual(['ts']);
  });
});
