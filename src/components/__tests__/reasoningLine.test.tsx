/**
 * The counter beside the reasoning label. A model can think for a minute with nothing else on
 * screen, so this line is what tells the owner the wait is progress and not a stall -- and once
 * the answer starts it has to hold still at what the thinking actually cost.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { ReasoningLine, showsReasoningRow } from '../ReasoningLine';
import { resetAsideExpansion, setAsideExpanded } from '../../core/asideExpansion';

// Every tree is taken down after its test: one left mounted hears the next test's resets outside
// act(), and its counter keeps ticking into the tests after it.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  ReactTestRenderer.act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

function render(props: React.ComponentProps<typeof ReasoningLine>) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <ReasoningLine {...props} />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    const collect = (value: unknown): void => {
      if (typeof value === 'string') out.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
    };
    collect(node.props.children);
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'props' in (child as object)) {
        walk(child as ReactTestRenderer.ReactTestInstance);
      }
    }
  };
  walk(tree.root);
  return out.join(' ');
}

test('the counter climbs while the model is thinking', () => {
  jest.useFakeTimers();
  const tree = render({ reasoning: 'weighing options', startedAt: Date.now() - 12_000, streaming: true });
  expect(textOf(tree)).toContain('Reasoning');
  expect(textOf(tree)).toContain('12 s');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(5_000);
  });
  expect(textOf(tree)).toContain('17 s');

  // The interval belongs to the counter: a thread full of finished turns must not keep ticking.
  const pending = jest.getTimerCount();
  ReactTestRenderer.act(() => tree.unmount());
  expect(jest.getTimerCount()).toBe(pending - 1);
  jest.useRealTimers();
});

test('once the answer starts, the label settles and the duration holds still', () => {
  jest.useFakeTimers();
  const tree = render({ reasoning: 'weighing options', startedAt: Date.now() - 60_000, durationMs: 93_000, streaming: false });
  expect(textOf(tree)).toContain('Reasoning');
  expect(textOf(tree)).toContain('1 min 33 s');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(10_000);
  });
  expect(textOf(tree)).toContain('1 min 33 s');
  jest.useRealTimers();
});

test('a sealed span wins over the start, so a stopped run never counts on forever', () => {
  // `streaming` can still be true for the frame between the seal and the end of the bubble.
  const tree = render({ reasoning: 'thought', startedAt: Date.now() - 60_000, durationMs: 2_000, streaming: true });
  expect(textOf(tree)).toContain('2 s');
  expect(textOf(tree)).not.toContain('1 min');
});

test('a turn replayed from server history shows the span the server recorded', () => {
  // Measured at the stream since 2026-09-11 and written on the phase, so a reopened conversation
  // shows what the thinking cost instead of keeping the thought and losing its duration.
  const tree = render({ reasoning: 'weighing options', durationMs: 60, streaming: false });
  expect(textOf(tree)).toContain('Reasoning');
  expect(textOf(tree)).toContain('60 ms');
});

test('a replayed turn whose span nobody recorded draws no counter, rather than a zero', () => {
  // A phase written by a server that predates the field, or one whose span was never closed.
  const tree = render({ reasoning: 'weighing options', streaming: false });
  expect(textOf(tree)).toContain('Reasoning');
  expect(textOf(tree)).not.toMatch(/\d+(\.\d+)?s/);
});

test('a thought with no words shows what it spent and how long, and opens nothing', () => {
  const tree = render({ tokens: 516, durationMs: 4_200, streaming: false });
  expect(textOf(tree)).toContain('Reasoning');
  expect(textOf(tree)).toContain('516 tokens');
  expect(textOf(tree)).toContain('4.2 s');
  // Nothing to reveal, so nothing to press: a control that opens nothing is worse than none.
  expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
});

test('a thought with words carries its count too, beside the duration', () => {
  const tree = render({ reasoning: 'weighing options', tokens: 1500, durationMs: 12_000, streaming: false });
  expect(textOf(tree)).toContain('1.5k tokens');
  expect(textOf(tree)).toContain('12 s');
  expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button').length).toBeGreaterThan(0);
  // Folded by default: the words are behind the tap, the figures are not.
  expect(textOf(tree)).not.toContain('weighing options');
});

test('a count with no span says the count alone, without a dangling separator', () => {
  const tree = render({ tokens: 300, streaming: false });
  expect(textOf(tree)).toContain('300 tokens');
  expect(textOf(tree)).not.toContain('·');
});

test('nothing to say, nothing drawn', () => {
  const tree = render({ streaming: true, startedAt: Date.now() });
  expect(tree.toJSON()).toBeNull();
});

/**
 * A reasoning section the reader opened mid-stream must still be open when the stream ends.
 *
 * Reported by the owner on 2026-09-14: "quand on a expand la section de raisonnement en stream et
 * que ca fini ca referme la section sous un autre nom". Two causes in one call. The aside carried
 * no `persistKey`, so its open state lived in a `useState` that the live-to-history transition
 * threw away -- the component's own contract says the key is the only truth for a keyed aside.
 * And the label moved from "Thinking..." to "Reasoning" at the same instant, so what the reader
 * saw was their section vanishing and a different, closed one taking its place. The label no longer
 * moves at all: one name for the whole life of the section, so there is nothing to re-identify.
 */
test('a reasoning section opened while it streams is still open once it ends', () => {
  resetAsideExpansion();
  setAsideExpanded('reasoning:bubble-1', true);

  const streaming = render({ id: 'bubble-1', reasoning: 'step one, then two', streaming: true, startedAt: Date.now() });
  expect(textOf(streaming)).toContain('step one, then two');

  // The same bubble, sealed: same key, same open section.
  const done = render({ id: 'bubble-1', reasoning: 'step one, then two', streaming: false, durationMs: 4_200 });
  expect(textOf(done)).toContain('step one, then two');
});

test('the reasoning of one bubble does not open the reasoning of another', () => {
  resetAsideExpansion();
  setAsideExpanded('reasoning:bubble-1', true);

  const other = render({ id: 'bubble-2', reasoning: 'a different thought', streaming: false, durationMs: 900 });
  expect(textOf(other)).not.toContain('a different thought');
});

/**
 * The "always expand reasoning" pref did nothing once every reasoning line was keyed: a keyed
 * aside read only what the reader had set, and nobody had set anything (fixed 2026-10-05).
 */
test('the expand pref opens a line nobody touched, and a line the reader closed stays closed', () => {
  resetAsideExpansion();
  const opened = render({ id: 'bubble-1', reasoning: 'a long thought', streaming: false, expandReasoning: true });
  expect(textOf(opened)).toContain('a long thought');

  setAsideExpanded('reasoning:bubble-2', false);
  const closed = render({ id: 'bubble-2', reasoning: 'another thought', streaming: false, expandReasoning: true });
  expect(textOf(closed)).not.toContain('another thought');
});

/**
 * The wait the call cost, opposite the thought it preceded -- once the block is open.
 *
 * Folded, a line says what it is and what it holds and nothing else: no wait, no button, no clock
 * (owner, 2026-11-08). Open, the wait keeps the far end it has always had, apart from the `12 s`
 * beside the label: that one is how long the thinking lasted, this one is how long the reader
 * watched nothing before the first word, and folded together they read as one span measured twice.
 */
test('the wait belongs to the opened block, not to the folded line', () => {
  const tree = render({ id: 'wait-1', reasoning: 'weighing options', tokens: 640, durationMs: 12_000, waitMs: 4_200, streaming: false });
  const folded = textOf(tree);
  expect(folded).toContain('Reasoning');
  expect(folded).toContain('640 tokens');
  expect(folded).toContain('12 s');
  expect(folded).not.toContain('wait 4.2 s');

  ReactTestRenderer.act(() => {
    tree.root.findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0]!.props.onPress();
  });
  expect(textOf(tree)).toContain('wait 4.2 s');
});

test('a call that streamed no reasoning still shows its wait, once it was long enough to read', () => {
  const tree = render({ waitMs: 9_000, streaming: false });
  expect(textOf(tree)).toContain('wait 9 s');
  // No label: there is no thought for it to name, and a row saying "Reasoning" over nothing is a
  // button that opens nothing.
  expect(textOf(tree)).not.toContain('Reasoning');
});

test('a fast answer adds no row at all', () => {
  // Below the threshold the wait is the ordinary case, not information: a row on every bubble.
  const tree = render({ waitMs: 1_100, streaming: false });
  expect(tree.toJSON()).toBeNull();
});

test('a thought of its own keeps its wait once it is opened', () => {
  // With a row already there the figure is a footnote, not a new line -- and a footnote of the
  // opened body, never of the folded line.
  const tree = render({ id: 'wait-2', reasoning: 'a quick thought', waitMs: 1_100, durationMs: 900, streaming: false });
  expect(textOf(tree)).not.toContain('wait 1.1 s');
  ReactTestRenderer.act(() => {
    tree.root.findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0]!.props.onPress();
  });
  expect(textOf(tree)).toContain('wait 1.1 s');
});

test('a long wait alone takes the caret down with it', () => {
  // Two "working" marks in the same bubble was the regression the row and the caret once were:
  // the row is what says the turn is alive, so the bubble must not draw both.
  expect(showsReasoningRow({ waitMs: 9_000 })).toBe(true);
  // Under the threshold nothing is drawn at all, so the caret keeps its place.
  expect(showsReasoningRow({ waitMs: 800 })).toBe(false);
  // A count or a thought always earns the row.
  expect(showsReasoningRow({ tokens: 500, waitMs: 800 })).toBe(true);
  expect(showsReasoningRow({ reasoning: 'thought', waitMs: undefined })).toBe(true);
  expect(showsReasoningRow({ reasoningChars: 4_000 })).toBe(true);
});
