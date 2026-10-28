/**
 * Getting a long block out of the app.
 *
 * React Native ends a selection at the Text node it started in, and rendered markdown is one node
 * per block: a reasoning trace or a compaction summary can be read but never selected whole. The
 * copy button is the way out, so it is guarded like one.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Clipboard from '@react-native-clipboard/clipboard';
import { CollapsibleAside } from '../CollapsibleAside';
import { CopyButton } from '../CopyButton';

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

function pressLabelled(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll(n => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
  if (!node) throw new Error(`no pressable labelled ${label}`);
  ReactTestRenderer.act(() => {
    node.props.onPress();
  });
}

beforeEach(() => {
  // Every press arms the "copied" timer; on real timers it fires after the suite is torn down.
  jest.useFakeTimers();
  (Clipboard.setString as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

test('a tap fills the clipboard and says so, then goes quiet again', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<CopyButton value="tout le bloc" accessibilityLabel="Copy it" />);
  });
  expect(textsOf(tree)).toContain('copy');

  pressLabelled(tree, 'Copy it');
  expect(Clipboard.setString).toHaveBeenCalledWith('tout le bloc');
  // The clipboard is invisible: without this the tap reads as a dead button.
  expect(textsOf(tree)).toContain('copied');

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(2_000);
  });
  expect(textsOf(tree)).toContain('copy');

  // A bubble scrolled out of the window while the acknowledgement is pending must take its
  // timer with it, or the state lands on an unmounted component.
  pressLabelled(tree, 'Copy it');
  const pending = jest.getTimerCount();
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
  expect(jest.getTimerCount()).toBe(pending - 1);
});

test('the bar shape is a lone tile that copies the whole document', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<CopyButton value={'# titre\n\ntout le fichier'} variant="bar" />);
  });
  // No word on it: the tile lives in a row of icons, and a label would break the line.
  expect(textsOf(tree)).not.toContain('copy');

  pressLabelled(tree, 'Copy the whole file');
  expect(Clipboard.setString).toHaveBeenCalledWith('# titre\n\ntout le fichier');

  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});

test('an aside copies its raw source, and only once open', () => {
  const body = '1. Primary Request\n\n   `src/app.ts`, whole paragraphs of it.';
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <CollapsibleAside label="Summary" body={body} showHint="show" hideHint="hide" />,
    );
  });
  // Folded, the aside is one muted line: nothing to copy yet, and no second glyph on it.
  expect(textsOf(tree)).not.toContain('copy');

  pressLabelled(tree, 'Summary');
  expect(textsOf(tree)).toContain('copy');

  pressLabelled(tree, 'Copy summary');
  // The markdown source, not what the renderer made of it.
  expect(Clipboard.setString).toHaveBeenCalledWith(body);

  // Copying must not fold the block away under the reader.
  const toggle = tree.root.findAll(n => n.props?.accessibilityLabel === 'Summary')[0];
  expect(toggle?.props.accessibilityState).toEqual({ expanded: true });

  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});
