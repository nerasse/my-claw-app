/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

function labelsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string', { deep: true })
    .map(node => node.props.accessibilityLabel as string);
}

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.props.children === 'string', { deep: true })
    .map(node => node.props.children as string);
}

async function render(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  return tree;
}

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string): Promise<void> {
  const target = tree.root.find(node => node.props.accessibilityLabel === label);
  await ReactTestRenderer.act(async () => {
    target.props.onPress();
  });
}

test('boots on the chat screen with a composer and a drawer handle', async () => {
  const tree = await render();
  const labels = labelsOf(tree);
  expect(labels).toContain('Message to send');
  expect(labels).toContain('Open conversations');
  expect(labels).toContain('Send message');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('the drawer holds the conversations and leads to the settings', async () => {
  const tree = await render();
  await press(tree, 'Open conversations');

  expect(labelsOf(tree)).toContain('Open settings');
  expect(textsOf(tree)).toContain('MyClaw');
  expect(textsOf(tree)).toContain('Settings');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('the settings expose the three theme modes', async () => {
  const tree = await render();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');

  const labels = labelsOf(tree);
  expect(labels).toContain('Theme System');
  expect(labels).toContain('Theme Light');
  expect(labels).toContain('Theme Dark');
  expect(labels).toContain('Server address');
  await ReactTestRenderer.act(async () => tree.unmount());
});
