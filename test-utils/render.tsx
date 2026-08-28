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
 *
 * Time-based instead of attempt-based: a slow CI runner (cache miss, contended CPU) can easily
 * need many more micro-turns than local, and 25 attempts of ~0ms was timing out there while
 * passing locally. 10s of wall-clock is generous for any reasonable boot, and a broken condition
 * still fails in the same 10s (just with a clean message instead of "Exceeded timeout of 30000").
 */
export async function waitFor(check: () => boolean, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) return;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: condition still false after ${timeoutMs} ms`);
    }
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
    });
  }
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

/**
 * Like `renderApp` but for the home screen: waits for the "New conversation" button instead of
 * the composer field, because the home has no composer.
 */
export async function renderAppHome(): Promise<Tree> {
  await prefs.hydrate();
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await waitFor(() => tree.root.findAll(node => node.props.testID === 'home-screen').length > 0);
  return tree;
}
