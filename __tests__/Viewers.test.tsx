/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { ImageViewer } from '../src/app/ImageViewer';
import { TextViewer } from '../src/app/TextViewer';

const TOP = 40;

// The shared mock reports a zero top inset, which hides exactly the bug these tests are
// about: a phone with a status bar is the only case where the offsets matter.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context/jest/mock').default;
  return { ...actual, useSafeAreaInsets: () => ({ top: 40, bottom: 16, left: 0, right: 0 }) };
});

function flatten(style: unknown): Record<string, string | number | undefined> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, string | number | undefined>;
}

/** Every view of the tree, outermost first. */
function views(tree: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance[] {
  return tree.root.findAll(node => String(node.type) === 'View', { deep: true });
}

async function render(element: React.JSX.Element): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(element);
  });
  return tree;
}

test('the image viewer keeps its controls clear of the status bar', async () => {
  const tree = await render(
    <ImageViewer url="http://h/media/1" filename="photo.png" onClose={() => {}} />,
  );

  // The layer is laid out against the shell's outer box: a negative top would lift the whole
  // stage off-screen, and the bar padding would only buy back what the offset just took.
  const stage = flatten(views(tree)[0]!.props.style);
  expect(stage.top ?? 0).toBe(0);

  const bar = views(tree).find(node => {
    const style = flatten(node.props.style);
    return style.position === 'absolute' && style.top === 0 && style.paddingTop !== undefined;
  });
  expect(bar).toBeDefined();
  expect(flatten(bar!.props.style).paddingTop as number).toBeGreaterThanOrEqual(TOP);

  await ReactTestRenderer.act(async () => tree.unmount());
});

test('the text viewer starts below the status bar', async () => {
  const tree = await render(
    <TextViewer url="http://h/media/2" filename="notes.md" onClose={() => {}} />,
  );

  const stage = flatten(views(tree)[0]!.props.style);
  expect(stage.top).toBe(TOP);

  await ReactTestRenderer.act(async () => tree.unmount());
});
