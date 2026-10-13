/**
 * @format
 *
 * A surface with nothing to type into drops the keyboard on its way in. Left up, it covers the
 * lower half of a menu (the model list was unreadable behind it) and on Android it swallows the
 * first back press, which reads as the back key doing nothing.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, Keyboard } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-kb';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function summary(threadId: string, title: string) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
  };
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

async function boot(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  return tree;
}

let dismiss: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  dismiss = jest.spyOn(Keyboard, 'dismiss');
});

afterEach(() => {
  dismiss.mockRestore();
});

test('the model picker drops the keyboard instead of hiding behind it', async () => {
  const tree = await boot();
  await emit({
    type: 'model.list.result',
    models: [{ id: 'fast-1', label: 'Fast' }],
    defaultModel: 'fast-1',
  });

  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'));
  dismiss.mockClear();
  await pressLabel(tree, 'Model…');

  await waitFor(() => labelsOf(tree).includes('Fast'));
  expect(dismiss).toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test.each([
  ['Open conversations', 'Search conversations'],
])('%s drops the keyboard', async (open, landmark) => {
  const tree = await boot();
  dismiss.mockClear();
  await pressLabel(tree, open);

  await waitFor(() => labelsOf(tree).includes(landmark));
  expect(dismiss).toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('Session files, now reached through the Commands menu, still drops the keyboard', async () => {
  const tree = await boot();
  dismiss.mockClear();
  await pressLabel(tree, 'Commands');
  await pressLabel(tree, 'Session files');

  await waitFor(() => labelsOf(tree).includes('Back to chat'));
  expect(dismiss).toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('the settings index and every page under it drop the keyboard', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open conversations');
  dismiss.mockClear();
  await pressLabel(tree, 'Open settings');
  await waitFor(() => labelsOf(tree).includes('Open appearance'));
  expect(dismiss).toHaveBeenCalled();

  dismiss.mockClear();
  await pressLabel(tree, 'Open skills');
  await waitFor(() => labelsOf(tree).includes('Back to settings'));
  expect(dismiss).toHaveBeenCalled();

  dismiss.mockClear();
  await pressLabel(tree, 'Back to settings');
  // The server field has a page of its own, under "connection".
  await pressLabel(tree, 'Open server');
  await waitFor(() => labelsOf(tree).includes('Server address'));
  expect(dismiss).toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('the rename sheet keeps the keyboard: it is the one that asks for typing', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Rename…'));
  dismiss.mockClear();
  await pressLabel(tree, 'Rename…');

  await waitFor(() => labelsOf(tree).includes('Name this conversation'));
  expect(dismiss).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});
