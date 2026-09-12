/**
 * The rule drawn at the bottom of the thread while a compaction runs.
 *
 * It said "Compacting the context · 42s" and nothing else, which is indistinguishable from a stuck
 * app for the minute or two the summarizer takes. The text it is writing is shown under it since
 * 2026-09-12, folded like every other aside because it is thousands of tokens by the end.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { CompactionRunning } from '../CompactionBoundary';

function render(props: React.ComponentProps<typeof CompactionRunning>) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <CompactionRunning {...props} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll(n => n.type === Text)
    .map(n => {
      const collect = (v: unknown): string =>
        typeof v === 'string' || typeof v === 'number'
          ? String(v)
          : Array.isArray(v)
            ? v.map(collect).join('')
            : '';
      return collect(n.props.children);
    })
    .join(' | ');
}

test('the rule counts, and says what it is doing', () => {
  const tree = render({ since: Date.now() - 5_000 });
  expect(textOf(tree)).toContain('Compacting the context');
});

test('the summary being written is offered under the rule', () => {
  const tree = render({ since: Date.now(), text: 'Prior work: we fixed the runner.' });
  expect(textOf(tree)).toContain('Writing the summary');
});

test('nothing written yet draws no aside, rather than an empty one', () => {
  // The prefill of a long prompt is silence too: there is nothing to reveal, so no control is
  // offered that would open on nothing.
  const tree = render({ since: Date.now(), text: '   ' });
  expect(textOf(tree)).not.toContain('Writing the summary');
});
