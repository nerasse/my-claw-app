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
  bridge.prefsGetAll.mockResolvedValue({ serverUrl: OLD_URL, themeMode: 'dark', lastThreadId: 't-default' });
  bridge.connect.mockClear();
});

function announce(state: string, url: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state, url });
  });
}

async function openSettings(tree: Tree): Promise<void> {
  // Settings are reached from the drawer: connected shows no status control in the header.
  await press(tree, 'Open conversations');
  await press(tree, 'More');
  await press(tree, 'Settings');
  await press(tree, 'Open general');
  await waitFor(() => labelsOf(tree).includes('Server address'));
}

async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
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

test('an address without a scheme never reaches the socket', async () => {
  const tree = await renderApp();
  await announce('connected', OLD_URL);
  await openSettings(tree);
  bridge.connect.mockClear();

  // OkHttp answers this by throwing out of a service callback, which kills the process. The
  // address is persisted as it is typed, so the next launch used to kill it again.
  await typeUrl(tree, '10.10.20.10:8080/my-claw-app');
  await waitFor(() => labelsOf(tree).includes('Reconnect to the new server'));
  await press(tree, 'Reconnect to the new server');
  expect(bridge.connect).not.toHaveBeenCalled();

  // Refused, and said so: the app reports itself disconnected rather than pretending.
  await waitFor(() => labelsOf(tree).includes('Connect'));

  await typeUrl(tree, NEW_URL);
  await press(tree, 'Connect');
  expect(bridge.connect).toHaveBeenCalledWith(NEW_URL);

  await settleAndUnmount(tree);
});

describe('the connection indicator in the header', () => {
  it('is absent while connected, and a dropped connection shows an offline badge in its place', async () => {
    const tree = await renderApp();
    // Connected is the normal case: nothing to show, and the label is not there to press.
    expect(labelsOf(tree).filter(label => label.startsWith('Connection status'))).toEqual([]);
    expect(textsOf(tree)).not.toContain('offline');

    await announce('disconnected', OLD_URL);
    await waitFor(() => labelsOf(tree).includes('Connection status: disconnected'));
    expect(textsOf(tree)).toContain('offline');

    // A degraded state is a badge, not a dot: it reads.
    await announce('connecting', OLD_URL);
    await waitFor(() => labelsOf(tree).includes('Connection status: connecting'));
    expect(textsOf(tree)).toContain('connecting');

    await announce('connected', OLD_URL);
    await waitFor(() => labelsOf(tree).filter(label => label.startsWith('Connection status')).length === 0);
    await settleAndUnmount(tree);
  });
});
