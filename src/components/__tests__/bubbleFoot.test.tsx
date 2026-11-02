/**
 * The run's empreinte, on the last message it signed.
 *
 * It shares the `⋯` line and always lands at the right end: a signature, never a caption of the
 * bubble above it -- the run's span used to sit inside a fold title and read as that fold's time.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Bubble } from '../Bubble';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import type { RunInfo, TextItem } from '../../core/chat';

const RUN: RunInfo = { id: 'r1', status: 'done', startTs: 1_000, endTs: 61_000 };

const message = (): TextItem => ({
  kind: 'text',
  id: 'm1',
  role: 'agent',
  text: 'the answer',
  attachments: [],
  streaming: false,
  ts: 5,
});

function mount(foot?: RunInfo): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <Bubble
          item={message()}
          mediaBase=""
          deviceInfo={null}
          grouped={false}
          showTime={false}
          foot={foot}
          onMenu={jest.fn()}
        />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

const texts = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => String(node.props.children));

test('the bubble that closed a run signs it, with the span scoped to the run', () => {
  expect(texts(mount(RUN))).toContain('run · 1 min');
});

test('a bubble no run closed draws no signature', () => {
  // Mid-run, or outside every run: there is nothing to say yet, and a bare "run" would be noise.
  expect(texts(mount(undefined)).some(line => line.includes('run'))).toBe(false);
});

test('the signature carries the word the run ended on', () => {
  expect(texts(mount({ ...RUN, status: 'error' }))).toContain(' · error');
  expect(texts(mount({ ...RUN, status: 'aborted' }))).toContain(' · Stopped');
  // A run the server went down under: nobody stopped it, so it does not say Stopped.
  expect(texts(mount({ ...RUN, status: 'interrupted' }))).toContain(' · Interrupted');
  expect(texts(mount({ ...RUN, status: 'interrupted' }))).not.toContain(' · Stopped');
});
