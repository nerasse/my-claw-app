/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { CollapsibleAside } from '../CollapsibleAside';
import { FocusRequestHost, RowKey } from '../RowFocus';

/**
 * A row that cannot ask the thread to move must still work: the aside is drawn everywhere the
 * prop is threaded, and an absent host is a screen that does not scroll, not a crash.
 */
function mountHosted(onRequestFocus: (key: string) => void): ReactTestRenderer.ReactTestRenderer {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <FocusRequestHost onRequestFocus={onRequestFocus}>
          <RowKey id="row-7">
            <CollapsibleAside
              label="Thought"
              body="what it thought"
              showHint="Show the thinking"
              hideHint="Hide the thinking"
            />
          </RowKey>
        </FocusRequestHost>
      </ThemeContext.Provider>,
    );
  });
  return tree!;
}

/**
 * The toggle, found by the label it announces rather than by type: `Pressable` is a memoised
 * wrapper and `findAllByType` does not see through it.
 */
function toggleOf(tree: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  const node = tree.root.findAll(instance => instance.props.accessibilityLabel === 'Thought')[0];
  expect(node).toBeDefined();
  return node;
}

test('opening an aside asks the thread to bring its row to the top', () => {
  const requests: string[] = [];
  const tree = mountHosted(key => requests.push(key));

  ReactTestRenderer.act(() => {
    toggleOf(tree).props.onPress();
  });

  expect(requests).toEqual(['row-7']);
});

test('closing it asks for the same row, so the reader keeps the thread they were on', () => {
  const requests: string[] = [];
  const tree = mountHosted(key => requests.push(key));

  ReactTestRenderer.act(() => {
    toggleOf(tree).props.onPress();
  });
  ReactTestRenderer.act(() => {
    toggleOf(tree).props.onPress();
  });

  expect(requests).toEqual(['row-7', 'row-7']);
});

test('an aside drawn outside a row asks for nothing', () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <CollapsibleAside label="Thought" body="x" showHint="Show" hideHint="Hide" />
      </ThemeContext.Provider>,
    );
  });

  expect(() => {
    ReactTestRenderer.act(() => {
      toggleOf(tree!).props.onPress();
    });
  }).not.toThrow();
});
