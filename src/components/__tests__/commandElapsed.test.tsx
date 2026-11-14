/**
 * The counter on a running command. A `/compact` is one to two minutes of complete silence on
 * the wire, so this line is the only thing that tells the owner the server is still working.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { CommandElapsed } from '../CommandElapsed';

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
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
  return out;
}

test('the counter starts at the age of the command and ticks every second', () => {
  jest.useFakeTimers();
  const started = Date.now() - 42_000;
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<CommandElapsed since={started} />);
  });
  expect(textsOf(tree).join('')).toContain('42 s');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(3_000);
  });
  expect(textsOf(tree).join('')).toContain('45 s');

  // The interval is the component's own: unmounting has to take it with it, or a thread full
  // of past commands keeps ticking forever.
  const pending = jest.getTimerCount();
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
  expect(jest.getTimerCount()).toBe(pending - 1);
  jest.useRealTimers();
});

/**
 * The counter reads the clock at every render, not the instant the component happened to mount.
 *
 * A `now` captured in state froze the figure for as long as the row stayed mounted: the fold of a
 * live run, whose first card can land after the row itself, showed `running · 0 ms` and kept
 * showing it until something else forced a redraw (measured 2026-11-14).
 */
test('a counter mounted before its instant existed catches up instead of sitting at 0 ms', () => {
  jest.useFakeTimers();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    // `since` is 12 s ahead of the clock this component mounted on: what a device running behind
    // the server sees when it is handed the server's start instant.
    tree = ReactTestRenderer.create(<CommandElapsed since={Date.now() + 12_000} />);
  });
  expect(textsOf(tree).join('')).toContain('0 ms');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(15_000);
  });
  expect(textsOf(tree).join('')).toContain('3 s');
  jest.useRealTimers();
});

/**
 * An instant that cannot be read draws no figure at all. `NaN` reached `formatSpan` from a stamp the
 * store had copied verbatim off a frame, and the fold's header read `running · NaN h` for as long
 * as the run lasted.
 */
test('an unreadable instant draws no figure rather than NaN', () => {
  jest.useFakeTimers();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<CommandElapsed since={'not a date' as unknown as number} />);
  });
  const text = textsOf(tree).join('');
  expect(text).not.toContain('NaN');
  expect(text.trim()).toBe('');
  jest.useRealTimers();
});
