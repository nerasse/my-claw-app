/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, type Tree } from '../../../test-utils/render';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

async function pressLabel(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const target = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  )[0];
  if (!target) throw new Error(`no pressable labelled ${label}`);
  await ReactTestRenderer.act(async () => target.props.onPress());
}

function homeNodes(tree: Tree): ReactTestRenderer.ReactTestInstance[] {
  // React Native's View test renderer exposes the host wrapper as well as the native component.
  // The parent prop distinguishes the mounted home drawer from the hidden floating drawer.
  return tree.root.findAll(
    node => node.props.testID === 'home-screen' && node.parent?.props.home === true,
    { deep: true },
  );
}

const sessions = [
  {
    threadId: 'thread-alpha',
    title: 'Alpha',
    messageCount: 2,
    createdAt: '2026-08-28T10:00:00.000Z',
    lastActiveAt: '2026-08-28T10:05:00.000Z',
  },
];

test('boots on the home screen with a new conversation button and a session list', async () => {
  const tree = await renderAppHome();
  try {
    expect(homeNodes(tree)).toHaveLength(1);
    expect(labelsOf(tree)).toContain('New conversation');
    expect(labelsOf(tree)).toContain('Open archived conversations');
    expect(labelsOf(tree)).toContain('Open shared agents');
    expect(labelsOf(tree)).toContain('Open jobs');
    expect(labelsOf(tree)).toContain('Open settings');
    expect(textsOf(tree)).toContain('MyClaw');

    await emit({ type: 'session.list.result', sessions });
    await waitFor(() => labelsOf(tree).includes('Conversation Alpha'));
  } finally {
    await unmount(tree);
  }
});

test('selecting a session leaves home, and MyClaw returns to it', async () => {
  const tree = await renderAppHome();
  try {
    await emit({ type: 'session.list.result', sessions });
    await waitFor(() => labelsOf(tree).includes('Conversation Alpha'));

    await pressLabel(tree, 'Conversation Alpha');
    await waitFor(() => labelsOf(tree).includes('Message to send'));
    expect(homeNodes(tree)).toHaveLength(0);

    await pressLabel(tree, 'Open conversations');
    await pressLabel(tree, 'Home');
    await waitFor(() => homeNodes(tree).length === 1);
  } finally {
    await unmount(tree);
  }
});
