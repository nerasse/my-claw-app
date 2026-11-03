/**
 * When the composer measures its height again.
 *
 * A browser textarea has one fixed height, so `autoGrow` sets it from where the text wraps. It ran
 * on a change of text only, while the wrap also moves with the field's width: measured while a
 * column folded or a page opened beside it, the empty field kept a height of several lines until
 * the next keystroke. The arithmetic is `autoGrowWeb.test.ts`; this is when it runs.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet, TextInput, View } from 'react-native';
import { Composer } from '../Composer';
import { VoiceRecorder } from '../VoiceRecorder';
import { autoGrow } from '../../core/webProps';

jest.mock('../../core/webProps', () => ({
  ...jest.requireActual('../../core/webProps'),
  autoGrow: jest.fn(),
}));

const grown = autoGrow as jest.Mock;

function render(props: { questionPending?: boolean } = {}): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Composer value="" onChange={() => {}} onSend={() => {}} onRecorded={() => {}} {...props} />,
    );
  });
  return tree;
}

/** The frame around the field: the one whose width decides where the text wraps. */
function frame(tree: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  return tree.root.findAll(n => n.type === View && typeof n.props.onLayout === 'function' && n.findAllByType(TextInput).length > 0).at(-1)!;
}

function laidOut(tree: ReactTestRenderer.ReactTestRenderer, width: number, height = 44): void {
  ReactTestRenderer.act(() => frame(tree).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } }));
}

let tree: ReactTestRenderer.ReactTestRenderer | null = null;

afterEach(() => {
  if (tree) ReactTestRenderer.act(() => tree?.unmount());
  tree = null;
  grown.mockClear();
});

test('a new width measures the field again, a new height alone does not', () => {
  tree = render();
  grown.mockClear();

  laidOut(tree, 130);
  expect(grown).toHaveBeenCalledTimes(1);

  // The column comes back: the text wraps elsewhere, and the height has to follow.
  laidOut(tree, 900);
  expect(grown).toHaveBeenCalledTimes(2);

  // The height autoGrow just set lays the frame out again: measuring on that would loop.
  laidOut(tree, 900, 60);
  expect(grown).toHaveBeenCalledTimes(2);
});

test('a new placeholder measures the field again', () => {
  tree = render();
  grown.mockClear();

  ReactTestRenderer.act(() => tree?.update(<Composer value="" onChange={() => {}} onSend={() => {}} questionPending />));

  expect(tree.root.findByType(TextInput).props.placeholder).toBe('Answer the pending questions');
  expect(grown).toHaveBeenCalledTimes(1);
});

test('recording keeps the same field and geometry instead of moving the microphone', () => {
  tree = render();
  laidOut(tree, 130);
  grown.mockClear();

  const field = tree.root.findByType(TextInput);
  const recorder = tree.root.findAllByType(VoiceRecorder).at(0)!;
  ReactTestRenderer.act(() => recorder.props.onActiveChange(true));
  expect(tree.root.findByType(TextInput) === field).toBe(true);
  expect(field.props.editable).toBe(false);

  ReactTestRenderer.act(() => recorder.props.onActiveChange(false));
  laidOut(tree, 130);

  expect(grown).not.toHaveBeenCalled();
  expect(tree.root.findByType(TextInput) === field).toBe(true);
  expect(field.props.editable).toBe(true);
});

// The line box is the browser's fix (the caret was cut by a textarea exactly as tall as the
// glyphs). On Android a pinned line box clips colour emoji, so the native field keeps its own.
test('the native field keeps the platform line box', () => {
  tree = render();

  expect(StyleSheet.flatten(tree.root.findByType(TextInput).props.style).lineHeight).toBeUndefined();
});
