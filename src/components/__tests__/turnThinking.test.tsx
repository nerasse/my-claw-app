/**
 * The line drawn at the bottom of the thread while a model call has produced nothing yet.
 *
 * It is the quietest thing on the screen on purpose: it must lose to every answer, and it is only
 * ever there while there is nothing else to read.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { TurnThinking } from '../TurnThinking';

let mounted: ReactTestRenderer.ReactTestRenderer | null = null;

function render(since: number): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <TurnThinking since={since} />
      </ThemeContext.Provider>,
    );
  });
  mounted = tree;
  return tree;
}

afterEach(() => {
  // The counter holds a one-second interval: left mounted it fires into the next test's console.
  if (mounted) ReactTestRenderer.act(() => mounted?.unmount());
  mounted = null;
});

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll(n => n.type === Text)
    .map(n => (typeof n.props.children === 'string' ? n.props.children : ''))
    .join(' | ');
}

describe('TurnThinking', () => {
  test('says the model is working, and how long it has been', () => {
    const tree = render(Date.now() - 1_500);
    expect(textsOf(tree)).toContain('Thinking');
    // The counter ticks while the test runs: what matters is that a span is formatted from the
    // instant given, not the exact tenth of a second it had reached.
    expect(textsOf(tree)).toMatch(/[0-9]+(\.[0-9]+)? s/);
  });

  test('counts from the instant the server gave, not from when the window saw it', () => {
    const tree = render(Date.now() - 42_000);
    expect(textsOf(tree)).toContain('42 s');
  });

  test('is announced as a wait, for a reader who cannot see the counter move', () => {
    const tree = render(Date.now());
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'The model is working').length).toBeGreaterThan(0);
  });
});
