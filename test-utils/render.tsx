import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';
import { prefs } from '../src/core/prefs';

export type Tree = ReactTestRenderer.ReactTestRenderer;

export function labelsOf(tree: Tree): string[] {
  return tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string', { deep: true })
    .map(node => node.props.accessibilityLabel as string);
}

export function textsOf(tree: Tree): string[] {
  return tree.root
    .findAll(node => typeof node.props.children === 'string', { deep: true })
    .map(node => node.props.children as string);
}

/**
 * Drains pending promises and timers until the condition holds. Asserting right after a
 * single act() made the suite depend on how many promise hops boot took, which failed on a
 * cold cache: wait on the observable state instead.
 */
export async function waitFor(check: () => boolean, attempts = 25): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) return;
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
    });
  }
  if (!check()) throw new Error(`waitFor: condition still false after ${attempts} attempts`);
}

/**
 * Settings are read before the first paint, so the theme and the restored thread are already
 * in place when the tree mounts instead of arriving one promise later.
 */
export async function renderApp(): Promise<Tree> {
  await prefs.hydrate();
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  return tree;
}

export async function press(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const target = tree.root.find(node => node.props.accessibilityLabel === label);
  await ReactTestRenderer.act(async () => {
    target.props.onPress();
  });
}

export async function unmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => tree.unmount());
}
