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
