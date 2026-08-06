/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { renderApp, labelsOf, textsOf, press, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const OLD_URL = 'ws://10.10.20.10:8080/my-claw-app';
const NEW_URL = 'ws://192.168.1.50:8080/my-claw-app';

beforeEach(() => {
  bridge.prefsGetAll.mockResolvedValue({ serverUrl: OLD_URL });
  bridge.connect.mockClear();
});

function announce(state: string, url: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state, url });
  });
}

async function openSettings(tree: Tree): Promise<void> {
  const statusLabel = labelsOf(tree).find(l => l.startsWith('Connection status'))!;
  await press(tree, statusLabel);
  await waitFor(() => labelsOf(tree).includes('Server address'));
}

function typeUrl(tree: Tree, next: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    tree.root.find(node => node.props.accessibilityLabel === 'Server address').props.onChangeText(next);
  });
}

test('changing the address while connected says the app is still on the old server', async () => {
  const tree = await renderApp();
  await announce('connected', OLD_URL);
  await openSettings(tree);

  // Connected and in agreement: nothing to warn about, and no reconnect offered.
  expect(labelsOf(tree)).not.toContain('Live server differs');
  expect(labelsOf(tree)).toContain('Connect');

  await typeUrl(tree, NEW_URL);

  await waitFor(() => labelsOf(tree).includes('Live server differs'));
  expect(textsOf(tree).some(t => t.includes(OLD_URL))).toBe(true);

  await press(tree, 'Reconnect to the new server');
  expect(bridge.connect).toHaveBeenCalledWith(NEW_URL);

  await unmount(tree);
});

test('once the socket reports the new address the warning goes away', async () => {
  const tree = await renderApp();
  await announce('connected', OLD_URL);
  await openSettings(tree);
  await typeUrl(tree, NEW_URL);
  await waitFor(() => labelsOf(tree).includes('Live server differs'));

  await announce('connected', NEW_URL);

  await waitFor(() => !labelsOf(tree).includes('Live server differs'));
  await unmount(tree);
});

test('a disconnected app never claims to be talking to another server', async () => {
  const tree = await renderApp();
  await announce('disconnected', OLD_URL);
  await openSettings(tree);
  await typeUrl(tree, NEW_URL);

  expect(labelsOf(tree)).not.toContain('Live server differs');
  await unmount(tree);
});
