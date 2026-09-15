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

test('the counter keeps two decimals, like a thinking span', () => {
  // "0s c'est chelou": the owner asked for the thinking spans to carry two decimals, and the
  // compaction counter reads beside them.
  const tree = render({ since: Date.now() - 5_000 });
  expect(textOf(tree)).toMatch(/Compacting the context · \d+\.\d\ds/);
});

/**
 * The thinking phase, which is where the wait actually is.
 *
 * A summarizer inheriting `reasoning_effort: max` thinks for a minute before its first word. That
 * reasoning was dropped on the floor server side, so the rule with a counter was the whole story
 * and a thinking model looked exactly like the dead provider the owner was chasing (2026-09-14).
 */
test('what the compaction is thinking is on screen before a word of the summary exists', () => {
  const tree = render({ since: Date.now(), reasoning: 'weighing which turns matter' });

  expect(textOf(tree)).toContain('Thinking');
  expect(textOf(tree)).not.toContain('Writing the summary');
});

test('the thinking and the summary stand as two asides, not one', () => {
  const tree = render({ since: Date.now(), reasoning: 'weighing it', text: 'The user was' });

  const shown = textOf(tree);
  expect(shown).toContain('Thinking');
  expect(shown).toContain('Writing the summary');
});

test('a compaction that thinks nothing shows nothing of it', () => {
  const tree = render({ since: Date.now(), text: 'The user was' });

  expect(textOf(tree)).not.toContain('Thinking');
});

/**
 * The counter gives way to the stop in flight (2026-09-14).
 *
 * Owner: "le compteur cède la place à l'état réel : on voit que ça s'arrête, pas que ça continue."
 * A number still climbing while the abort travels says the opposite of the truth, and the word is
 * the same one the session menu and the composer's corner show.
 */
test('a stop in flight takes the counter’s place', () => {
  const tree = render({ since: Date.now() - 5_000, stopping: true });

  expect(textOf(tree)).toContain('Stopping…');
  expect(textOf(tree)).not.toContain('Compacting the context');
});

test('what the compaction had written stays readable while it is stopped', () => {
  // The asides are content, not the counter: the words already written are still there to read,
  // and only the line that claimed progress changes.
  const tree = render({ since: Date.now(), stopping: true, text: 'Prior work: we fixed the runner.' });

  expect(textOf(tree)).toContain('Stopping…');
  expect(textOf(tree)).toContain('Writing the summary');
});

/**
 * The tick goes with the number it exists for.
 *
 * `Stopping…` is a steady word, and the second-by-second redraw it used to keep would re-render
 * the rule *and* every aside under it -- an open summary is thousands of tokens -- for a figure
 * nothing is displaying any more.
 */
test('a stopped rule no longer ticks', () => {
  const scheduled = jest.spyOn(globalThis, 'setInterval');
  try {
    render({ since: Date.now() - 5_000, stopping: true });
    expect(scheduled).not.toHaveBeenCalled();
  } finally {
    scheduled.mockRestore();
  }
});

test('a rule that is counting still ticks', () => {
  const scheduled = jest.spyOn(globalThis, 'setInterval');
  try {
    render({ since: Date.now() - 5_000 });
    expect(scheduled).toHaveBeenCalled();
  } finally {
    scheduled.mockRestore();
  }
});
