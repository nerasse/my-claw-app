/**
 * @format
 *
 * Updating the server from Settings > General.
 *
 * The button sends one frame and reads one answer. What is tested here is the wording of each
 * outcome, because that wording is the whole feature: the socket dies mid-update, so the screen is
 * the only thing that can tell the owner whether anything happened, and a screen that says
 * "updated" on a no-op would make the button useless.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { renderApp, labelsOf, textsOf, press, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const URL = 'ws://10.10.20.10:8080/my-claw-app';

beforeEach(() => {
  bridge.prefsGetAll.mockResolvedValue({ serverUrl: URL });
  bridge.sendMessage.mockClear();
});

function deliver(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function announce(state: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state, url: URL });
  });
}

function sentTypes(): string[] {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => (JSON.parse(String(frame)) as { type: string }).type,
  );
}

function hints(tree: Tree): string[] {
  return textsOf(tree);
}

async function openGeneral(tree: Tree): Promise<void> {
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open general');
  await waitFor(() => labelsOf(tree).includes('Update the server now'));
}

test('a started update says the server is restarting, then names the version it landed on', async () => {
  const tree = await renderApp();
  await announce('connected');
  await deliver({ type: 'hello', version: '0.4.2' });
  await openGeneral(tree);

  await press(tree, 'Update the server now');
  expect(sentTypes()).toContain('update.run');

  await deliver({ type: 'update.result', started: true, version: '0.4.2' });
  // Still connected and still on the same version: the swap has not happened yet, and the screen
  // must not claim it has.
  await waitFor(() => hints(tree).some(t => t.includes('nothing newer in the registry')));

  await announce('disconnected');
  await waitFor(() => hints(tree).some(t => t.includes('the server is restarting')));

  // The verdict: a different version in the hello of the reconnected socket.
  await announce('connected');
  await deliver({ type: 'hello', version: '0.4.3' });
  await waitFor(() => hints(tree).some(t => t.includes('updated 0.4.2 → 0.4.3')));

  await unmount(tree);
});

test('a run in flight refuses the update instead of interrupting it', async () => {
  const tree = await renderApp();
  await announce('connected');
  await deliver({ type: 'hello', version: '0.4.2' });
  await openGeneral(tree);

  await press(tree, 'Update the server now');
  await deliver({ type: 'update.result', started: false, version: '0.4.2', reason: 'busy' });

  await waitFor(() => hints(tree).some(t => t.includes('a run is in flight')));
  // A refusal is not a swap window: the button comes straight back.
  const button = tree.root.find(node => node.props.accessibilityLabel === 'Update the server now');
  expect(button.props.disabled).toBe(false);

  await unmount(tree);
});

test('a missing privilege names the drop-in and shows what sudo said', async () => {
  const tree = await renderApp();
  await announce('connected');
  await deliver({ type: 'hello', version: '0.4.2' });
  await openGeneral(tree);

  await press(tree, 'Update the server now');
  await deliver({
    type: 'update.result',
    started: false,
    version: '0.4.2',
    reason: 'denied',
    detail: 'sudo: a password is required',
  });

  await waitFor(() => hints(tree).some(t => t.includes('sudoers drop-in missing')));
  expect(hints(tree)).toContain('sudo: a password is required');

  await unmount(tree);
});

test('the button is out of reach while disconnected', async () => {
  const tree = await renderApp();
  await announce('connected');
  await openGeneral(tree);
  await announce('disconnected');

  await waitFor(() => {
    const button = tree.root.find(node => node.props.accessibilityLabel === 'Update the server now');
    return button.props.disabled === true;
  });
  expect(hints(tree).some(t => t.includes('connect to the server to run an update'))).toBe(true);

  await unmount(tree);
});
