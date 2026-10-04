/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { renderApp, labelsOf, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-diag';

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  bridge.sendMessage.mockClear();
  (Clipboard.setString as jest.Mock).mockClear();
});

function sent(): string[] {
  return bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
}

function receive(frame: object): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    (targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label)).props.onPress();
  });
}

async function openDiagnostics(tree: Tree): Promise<void> {
  // Settings are reached from the drawer: connected shows no status control in the header.
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open advanced');
  await waitFor(() => labelsOf(tree).includes('Open diagnostics'));
  await pressLabel(tree, 'Open diagnostics');
  await waitFor(() => labelsOf(tree).includes('Refresh snapshot'));
}

test('opening diagnostics asks the server for a snapshot and shows it', async () => {
  const tree = await renderApp();

  await openDiagnostics(tree);
  expect(sent().some(f => f.includes('"diag.snapshot"'))).toBe(true);

  await receive({ type: 'diag.snapshot.result', text: 'my-claw 0.1.146\nchannels up: my-claw-app' });
  await waitFor(() => textsOf(tree).some(t => t.includes('my-claw 0.1.146')));

  await unmount(tree);
});

test('the log tail is filtered by level and scope, and the result can be copied', async () => {
  const tree = await renderApp();
  await openDiagnostics(tree);

  await pressLabel(tree, 'Level error');
  await pressLabel(tree, 'Scope my-claw-app');
  await pressLabel(tree, 'Fetch logs');

  const query = JSON.parse(sent().filter(f => f.includes('"logs.tail"')).at(-1)!) as {
    level: string;
    scope: string;
    limit: number;
  };
  expect(query.level).toBe('error');
  expect(query.scope).toBe('my-claw-app');
  expect(query.limit).toBe(200);

  await receive({ type: 'logs.tail.result', text: 'boom', lines: 1, query: {} });
  await waitFor(() => textsOf(tree).includes('boom'));

  await pressLabel(tree, 'Copy logs');
  expect(Clipboard.setString).toHaveBeenCalledWith('boom');

  await unmount(tree);
});

test('an empty tail says so instead of leaving the previous lines on screen', async () => {
  const tree = await renderApp();
  await openDiagnostics(tree);

  await receive({ type: 'logs.tail.result', text: '', lines: 0, query: {} });
  await waitFor(() => textsOf(tree).includes('no matching lines'));

  await unmount(tree);
});

test('the run id of the last reply becomes a one-tap log filter', async () => {
  const tree = await renderApp();

  // The server stamps the run on the reply; the app keeps it so the user never reads it out.
  await receive({ type: 'chat.stream.start', id: 's1', threadId: THREAD, run: 'a1b2c3d4' });
  await receive({ type: 'chat.stream.done', id: 's1', threadId: THREAD });

  await openDiagnostics(tree);
  await pressLabel(tree, 'Logs for the last run a1b2c3d4');

  const query = JSON.parse(sent().filter(f => f.includes('"logs.tail"')).at(-1)!) as { run: string; level: string };
  expect(query.run).toBe('a1b2c3d4');
  // A targeted run is worth every level: that is the point of asking for one run.
  expect(query.level).toBe('debug');

  await unmount(tree);
});
