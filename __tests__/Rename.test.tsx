/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import {
  renderApp,
  labelsOf,
  press,
  textsOf,
  unmount,
  waitFor,
  type Tree,
} from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-rename';

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

function listSessions(title: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'session.list.result',
        sessions: [
          {
            threadId: THREAD,
            title,
            messageCount: 2,
            createdAt: '2026-08-06T10:00:00.000Z',
            lastActiveAt: '2026-08-06T10:05:00.000Z',
          },
        ],
      }),
    });
  });
}

/** Opens the drawer and the per-conversation menu. */
async function openThreadMenu(tree: Tree, title: string): Promise<void> {
  await listSessions(title);
  await press(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).some(label => label.startsWith('Actions for conversation')));
  const label = labelsOf(tree).find(entry => entry.startsWith('Actions for conversation'))!;
  await press(tree, label);
}

function typeInto(tree: Tree, label: string, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const input = tree.root.find(
      node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === label,
    );
    input.props.onChangeText(text);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('a conversation can be named, and the list shows the name the server stored', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree, 'comment je configure le dns');

  await press(tree, 'Rename');
  await waitFor(() => labelsOf(tree).includes('Name this conversation'));

  await typeInto(tree, 'Name this conversation', 'Infra maison');
  await press(tree, 'Save');

  expect(sentFrames()).toContainEqual({
    type: 'session.rename',
    threadId: THREAD,
    title: 'Infra maison',
  });

  // The drawer renders the server's answer, not the typed value.
  await listSessions('Infra maison');
  await waitFor(() => textsOf(tree).includes('Infra maison'));
  expect(textsOf(tree)).not.toContain('comment je configure le dns');

  await unmount(tree);
});

test('an empty name is sent as such, which hands the conversation back to its first message', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree, 'Infra maison');

  await press(tree, 'Rename');
  await typeInto(tree, 'Name this conversation', '');
  await press(tree, 'Save');

  expect(sentFrames()).toContainEqual({
    type: 'session.rename',
    threadId: THREAD,
    title: '',
  });

  await unmount(tree);
});

test('cancelling the rename sends nothing', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree, 'Infra maison');

  await press(tree, 'Rename');
  await typeInto(tree, 'Name this conversation', 'jamais envoye');
  await press(tree, 'Cancel');

  await waitFor(() => !labelsOf(tree).includes('Name this conversation'));
  expect(sentFrames().some(frame => frame.type === 'session.rename')).toBe(false);

  await unmount(tree);
});
