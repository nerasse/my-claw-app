/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const KEPT = 'thread-kept';
const FILED = 'thread-filed';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

function summary(threadId: string, title: string, archived?: boolean) {
  return {
    threadId,
    title,
    messageCount: 2,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
    ...(archived ? { archived: true } : {}),
  };
}

/** The server always answers archive and unarchive with the refreshed listing. */
function listSessions(sessions: object[]): Promise<void> {
  return emit({ type: 'session.list.result', sessions });
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

/** The chat screen's 40ms scroll timer must fire before unmount, or the next test crashes. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

async function openThreadMenu(tree: Tree, title: string): Promise<void> {
  await pressLabel(tree, `Actions for conversation ${title}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: KEPT });
});

test('a conversation can be filed away, found again and put back', async () => {
  const tree = await renderApp();
  await listSessions([summary(KEPT, 'Infra maison'), summary(FILED, 'Vieux projet')]);
  await pressLabel(tree, 'Open conversations');

  // The entry is there before anything is filed away, or nobody would ever find it.
  await waitFor(() => textsOf(tree).includes('Vieux projet'));
  expect(labelsOf(tree)).toContain('Open archived conversations');

  await openThreadMenu(tree, 'Vieux projet');
  await pressLabel(tree, 'Archive');
  expect(sentFrames()).toContainEqual({ type: 'session.archive', threadId: FILED });

  await listSessions([summary(KEPT, 'Infra maison'), summary(FILED, 'Vieux projet', true)]);
  // Gone from the drawer, still very much alive.
  await waitFor(() => !textsOf(tree).includes('Vieux projet'));

  await pressLabel(tree, 'Open archived conversations');
  await waitFor(() => textsOf(tree).includes('Archived'));
  expect(textsOf(tree)).toContain('Vieux projet');

  await openThreadMenu(tree, 'Vieux projet');
  await pressLabel(tree, 'Unarchive');
  expect(sentFrames()).toContainEqual({ type: 'session.unarchive', threadId: FILED });

  await listSessions([summary(KEPT, 'Infra maison'), summary(FILED, 'Vieux projet')]);
  await pressLabel(tree, 'Back to chat');
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('Vieux projet'));

  await settleAndUnmount(tree);
});

test('archiving the open conversation lands on home instead of an empty chat', async () => {
  const tree = await renderApp();
  await listSessions([summary(KEPT, 'Infra maison'), summary(FILED, 'Vieux projet')]);
  await pressLabel(tree, 'Open conversations');
  await openThreadMenu(tree, 'Infra maison');
  await pressLabel(tree, 'Archive');

  await listSessions([summary(KEPT, 'Infra maison', true), summary(FILED, 'Vieux projet')]);

  // The archived active thread is cleared immediately. A listing refresh must leave the owner on
  // home, not silently choose another conversation.
  await waitFor(() =>
    tree.root.findAll(
      node => node.props.testID === 'home-screen' && node.parent?.props.home === true,
      { deep: true },
    ).length > 0,
  );
  expect(sentFrames().filter(frame => frame.type === 'session.sync' && frame.threadId === FILED)).toEqual([]);

  await settleAndUnmount(tree);
});

test('archiving never sends a delete, and the archived list offers no stale actions', async () => {
  const tree = await renderApp();
  await listSessions([summary(FILED, 'Vieux projet', true)]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open archived conversations');
  await waitFor(() => textsOf(tree).includes('Vieux projet'));

  await openThreadMenu(tree, 'Vieux projet');
  await waitFor(() => labelsOf(tree).includes('Unarchive'));
  // An archived conversation is filed, not reset: Archive must not show up again here.
  expect(labelsOf(tree)).not.toContain('Archive');
  expect(labelsOf(tree)).toContain('Delete');
  expect(sentFrames()).not.toContainEqual(
    expect.objectContaining({ type: 'session.delete' }),
  );

  await settleAndUnmount(tree);
});

test('the hardware back button returns from an archived conversation to the list', async () => {
  const tree = await renderApp();
  await listSessions([summary(KEPT, 'Infra maison'), summary(FILED, 'Vieux projet', true)]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open archived conversations');
  await waitFor(() => textsOf(tree).includes('Vieux projet'));

  await pressLabel(tree, 'Conversation Vieux projet');
  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'session.sync' && frame.threadId === FILED),
  );

  // The Android layer calls the last registered handler and stops when it returns true.
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;

  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  // Back from the archives goes to the archives list, never out of the app.
  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Back to chat'));
  expect(textsOf(tree)).toContain('Vieux projet');
  expect(back.default.exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('the hardware back button with the drawer open only closes the menu', async () => {
  const tree = await renderApp();
  await listSessions([summary(KEPT, 'Infra maison')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).includes('Open archived conversations'));

  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;

  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  expect(handled).toBe(true);
  // The panel is always mounted (it animates both ways), but the back press must take it
  // out of the touch tree again.
  await waitFor(
    () => tree.root.findAll(node => node.props.pointerEvents === 'none', { deep: true }).length > 0,
  );
  expect(back.default.exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});
