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
  bridge.prefsGetAll.mockResolvedValue({ serverUrl: URL, themeMode: 'dark', lastThreadId: 't-default' });
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

function updateButton(tree: Tree) {
  return tree.root.find(node => node.props.accessibilityLabel === 'Update the server now');
}

function labelOfUpdateButton(tree: Tree): string {
  const texts: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    if (typeof node.props.children === 'string') texts.push(node.props.children);
    node.children.forEach(child => {
      if (child && typeof child === 'object' && 'props' in (child as object)) {
        walk(child as ReactTestRenderer.ReactTestInstance);
      }
    });
  };
  walk(updateButton(tree));
  return texts.join(' ');
}

async function openGeneral(tree: Tree): Promise<void> {
  await press(tree, 'Open conversations');
  await press(tree, 'More');
  await press(tree, 'Settings');
  await press(tree, 'Open general');
  await waitFor(() => labelsOf(tree).includes('Update the server now'));
}

test('a started update walks from asking to restarting to the version it landed on', async () => {
  const tree = await renderApp();
  await announce('connected');
  await deliver({ type: 'hello', version: '0.4.2' });
  await openGeneral(tree);

  await press(tree, 'Update the server now');
  expect(sentTypes()).toContain('update.run');

  await deliver({ type: 'update.result', started: true, version: '0.4.2' });
  // Nothing has restarted yet, and the screen says exactly that instead of guessing.
  await waitFor(() => hints(tree).some(t => t.includes('waiting to see whether it restarts')));
  expect(labelOfUpdateButton(tree)).toContain('Updating');

  await announce('disconnected');
  await waitFor(() => hints(tree).some(t => t.includes('the server is restarting')));

  await announce('connected');
  await deliver({ type: 'hello', version: '0.4.3' });
  await waitFor(() => hints(tree).some(t => t.includes('updated 0.4.2 → 0.4.3')));
  // The verdict frees the button again.
  expect(updateButton(tree).props.disabled).toBe(false);

  await unmount(tree);
});

test('mashing the button sends one request, even with no version ever announced', async () => {
  const tree = await renderApp();
  await announce('connected');
  await openGeneral(tree);

  await press(tree, 'Update the server now');
  await deliver({ type: 'update.result', started: true, version: '0.4.2' });

  // The bug this replaces: the lock was derived from a version comparison, so a client that had
  // never seen a hello re-armed the button after every answer. Five presses, five systemd jobs.
  for (let i = 0; i < 4; i += 1) {
    const button = updateButton(tree);
    expect(button.props.disabled).toBe(true);
    if (button.props.disabled !== true) {
      await ReactTestRenderer.act(async () => button.props.onPress());
    }
  }
  expect(sentTypes().filter(type => type === 'update.run')).toHaveLength(1);

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
  expect(updateButton(tree).props.disabled).toBe(false);

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

  await waitFor(() => updateButton(tree).props.disabled === true);
  expect(hints(tree).some(t => t.includes('connect to the server to run an update'))).toBe(true);

  await unmount(tree);
});
