/**
 * The counter beside the reasoning label. A model can think for a minute with nothing else on
 * screen, so this line is what tells the owner the wait is progress and not a stall -- and once
 * the answer starts it has to hold still at what the thinking actually cost.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { ReasoningLine } from '../ReasoningLine';

function render(props: React.ComponentProps<typeof ReasoningLine>) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <ReasoningLine {...props} />
      </ThemeContext.Provider>,
    );
  });
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
  expect(textOf(tree)).toContain('Thinking…');
  expect(textOf(tree)).toContain('12s');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(5_000);
  });
  expect(textOf(tree)).toContain('17s');

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
  expect(textOf(tree)).toContain('1m 33s');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(10_000);
  });
  expect(textOf(tree)).toContain('1m 33s');
  jest.useRealTimers();
});

test('a sealed span wins over the start, so a stopped run never counts on forever', () => {
  // `streaming` can still be true for the frame between the seal and the end of the bubble.
  const tree = render({ reasoning: 'thought', startedAt: Date.now() - 60_000, durationMs: 2_000, streaming: true });
  expect(textOf(tree)).toContain('2s');
  expect(textOf(tree)).not.toContain('1m');
});

test('a turn replayed from server history shows the reasoning without inventing a duration', () => {
  // The span is measured on the client, so history carries neither field. Better no counter than
  // one started from an instant nobody recorded.
  const tree = render({ reasoning: 'weighing options', streaming: false });
  expect(textOf(tree)).toContain('Reasoning');
  expect(textOf(tree)).not.toMatch(/\d+s/);
});

test('a redacted engine gets the counter too, beside its token estimate', () => {
  jest.useFakeTimers();
  const tree = render({ tokens: 1500, startedAt: Date.now() - 8_000, streaming: true });
  expect(textOf(tree)).toContain('1.5k tokens');
  expect(textOf(tree)).toContain('8s');
  ReactTestRenderer.act(() => tree.unmount());
  jest.useRealTimers();
});

test('nothing to say, nothing drawn', () => {
  const tree = render({ streaming: true, startedAt: Date.now() });
  expect(tree.toJSON()).toBeNull();
});
