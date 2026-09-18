/**
 * @format
 *
 * The notification sounds (docs/notifications.md): the settings page where the owner picks the
 * ordinary sound and the ring, the exact `notifications.channels` frames that tell the server
 * which Android channels to publish on, and the in-app ding following the ordinary choice.
 *
 * The channel names are a wire contract with a frozen platform object (a channel's sound cannot
 * change after creation), so the frames are asserted byte for byte: a name that stops travelling
 * does not fail loudly, it just sends every push to a channel nobody picked.
 */

// The RN jest preset resolves platform files to 'ios'; the app only ever runs on Android, and
// notification sounds are an Android setting by design, so the suite would test nothing.
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { OS: 'android', select: (spec: Record<string, unknown>) => spec.android ?? spec.default },
  OS: 'android',
  select: (spec: Record<string, unknown>) => spec.android ?? spec.default,
}));

// AppState is a native event source; read through a getter so the ring's "is the app on screen"
// condition is real under test, and the registered handlers stay out of the way.
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    get currentState() {
      return 'active';
    },
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge, type NotificationSoundsNative } from '../src/core/nativeBridge';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const DEFAULTS: NotificationSoundsNative = {
  ordinary: { kind: 'default' },
  ring: { kind: 'default' },
  channels: { ordinary: 'runs', ring: 'ring' },
};

const CHIME_URI = 'content://media/internal/audio/media/71';
const CHIME: NotificationSoundsNative = {
  ordinary: { kind: 'uri', uri: CHIME_URI, name: 'Chime' },
  ring: { kind: 'default' },
  // The derived name of the choice above, as NotificationSounds.kt computes it. Opaque on
  // purpose: the test pins that whatever the device derived is what travels, unchanged.
  channels: { ordinary: 'runs-7c9ef1a2', ring: 'ring' },
};

const IMPORTED_URI = 'content://com.myclawapp.fileprovider/notification-sounds/chime.mp3';
const IMPORTED: NotificationSoundsNative = {
  ordinary: { kind: 'uri', uri: IMPORTED_URI, name: 'chime.mp3' },
  ring: { kind: 'default' },
  channels: { ordinary: 'runs-1f2e3d4c', ring: 'ring' },
};

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function wsState(state: string, reason?: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state, ...(reason ? { reason } : {}) });
  });
}

function sentOfType(type: string): string[] {
  return bridge.sendMessage.mock.calls
    .map(([frame]) => String(frame))
    .filter(text => (JSON.parse(text) as { type?: string }).type === type);
}

function frames(): string[] {
  return sentOfType('notifications.channels');
}

function expectedFrame(channels: { ordinary: string; ring: string }): string {
  return JSON.stringify({ type: 'notifications.channels', deviceId: 'dev-test', channels });
}

async function openSounds(tree: Tree): Promise<void> {
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open notifications');
  await waitFor(() => labelsOf(tree).includes('Sound for notifications'));
}

/** The chat screen's scroll timer must fire before the tree goes away. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

beforeEach(() => {
  jest.clearAllMocks();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.getNotificationSounds.mockResolvedValue(DEFAULTS);
  bridge.listImportedSounds.mockResolvedValue([]);
  bridge.pickNotificationSound.mockResolvedValue(null);
  bridge.resetNotificationSound.mockResolvedValue(null);
  bridge.deleteImportedSound.mockResolvedValue(null);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

test('the page names both sounds and what each one is now', async () => {
  bridge.getNotificationSounds.mockResolvedValue(CHIME);
  const tree = await renderApp();
  await openSounds(tree);

  const labels = labelsOf(tree);
  expect(labels).toContain('Sound for notifications');
  expect(labels).toContain('Sound for the ring');
  const texts = textsOf(tree);
  expect(texts).toContain('Chime');
  expect(texts).toContain('System default');

  await settleAndUnmount(tree);
});

test('the ordinary line opens the sources, Silent included', async () => {
  const tree = await renderApp();
  await openSounds(tree);

  await press(tree, 'Sound for notifications');
  await waitFor(() => labelsOf(tree).includes('System sound'));
  expect(labelsOf(tree)).toContain('Import a file');
  expect(labelsOf(tree)).toContain('Silent');

  await settleAndUnmount(tree);
});

test('the ring line opens the same sources without Silent', async () => {
  const tree = await renderApp();
  await openSounds(tree);

  await press(tree, 'Sound for the ring');
  await waitFor(() => labelsOf(tree).includes('System sound'));
  expect(labelsOf(tree)).toContain('Import a file');
  expect(labelsOf(tree)).not.toContain('Silent');

  await settleAndUnmount(tree);
});

test('the channel names the device derived go out on every connection, byte for byte', async () => {
  bridge.getNotificationSounds.mockResolvedValue(CHIME);
  const tree = await renderApp();

  await waitFor(() => frames().length >= 1);
  expect(frames()[0]).toBe(expectedFrame(CHIME.channels));

  // A reconnect re-asserts them: a name that changed while the socket was down is otherwise
  // missing server-side until the next sound change. Two separate states, like two socket
  // events -- one act emitting both would batch and never leave and re-enter "connected".
  await wsState('disconnected', 'probe');
  await wsState('connected');
  await waitFor(() => frames().length >= 2);
  expect(frames().at(-1)).toBe(expectedFrame(CHIME.channels));

  await settleAndUnmount(tree);
});

test('a choice lands on the line and its channel names travel, exactly', async () => {
  bridge.pickNotificationSound.mockResolvedValue(CHIME);
  const tree = await renderApp();
  await openSounds(tree);

  // Boot reported the defaults; the change must replace them.
  await waitFor(() => frames().length >= 1);
  expect(frames()[0]).toBe(expectedFrame(DEFAULTS.channels));

  await press(tree, 'Sound for notifications');
  await waitFor(() => labelsOf(tree).includes('System sound'));
  await press(tree, 'System sound');

  await waitFor(() => bridge.pickNotificationSound.mock.calls.length === 1);
  expect(bridge.pickNotificationSound).toHaveBeenCalledWith('ordinary', 'system');
  await waitFor(() => textsOf(tree).includes('Chime'));
  await waitFor(() => frames().length >= 2);
  expect(frames().at(-1)).toBe(expectedFrame(CHIME.channels));

  await settleAndUnmount(tree);
});

test('Back to default drops the choice and the server hears the default names again', async () => {
  bridge.getNotificationSounds.mockResolvedValue(CHIME);
  bridge.resetNotificationSound.mockResolvedValue(DEFAULTS);
  const tree = await renderApp();
  await openSounds(tree);

  await press(tree, 'Reset the notification sound to default');
  await waitFor(() => bridge.resetNotificationSound.mock.calls.length === 1);
  expect(bridge.resetNotificationSound).toHaveBeenCalledWith('ordinary');

  await waitFor(() => !textsOf(tree).includes('Chime'));
  await waitFor(() => frames().at(-1) === expectedFrame(DEFAULTS.channels));
  expect(frames().at(-1)).toBe(expectedFrame(DEFAULTS.channels));

  await settleAndUnmount(tree);
});

test('an imported sound is listed, and deleting it goes through the bridge', async () => {
  let files = [{ uri: IMPORTED_URI, name: 'chime.mp3', size: 20480 }];
  bridge.getNotificationSounds.mockResolvedValue(IMPORTED);
  bridge.listImportedSounds.mockImplementation(() => Promise.resolve(files));
  bridge.deleteImportedSound.mockImplementation(() => {
    // The delete is what empties the folder; the page re-reads it from disk.
    files = [];
    return Promise.resolve(DEFAULTS);
  });
  const tree = await renderApp();
  await openSounds(tree);

  await waitFor(() => labelsOf(tree).includes('Delete chime.mp3'));
  await press(tree, 'Delete chime.mp3');
  await waitFor(() => bridge.deleteImportedSound.mock.calls.length === 1);
  expect(bridge.deleteImportedSound).toHaveBeenCalledWith(IMPORTED_URI);

  await waitFor(() => !labelsOf(tree).includes('Delete chime.mp3'));
  expect(labelsOf(tree)).not.toContain('Delete chime.mp3');

  await settleAndUnmount(tree);
});

test('a finished run rings with the chosen ordinary sound', async () => {
  bridge.getNotificationSounds.mockResolvedValue(CHIME);
  const tree = await renderApp();

  await emit({ type: 'chat.run.start', threadId: 't-default' });
  await emit({ type: 'chat.run.end', threadId: 't-default', reason: 'done' });

  await waitFor(() => bridge.playAlertSound.mock.calls.length >= 1);
  expect(bridge.playAlertSound).toHaveBeenCalledWith(CHIME_URI);
  await settleAndUnmount(tree);
});

test('the silent choice rings nothing, the default rings the system sound', async () => {
  bridge.getNotificationSounds.mockResolvedValue({
    ...DEFAULTS,
    ordinary: { kind: 'silent' },
  });
  const silent = await renderApp();
  await emit({ type: 'chat.run.start', threadId: 't-default' });
  await emit({ type: 'chat.run.end', threadId: 't-default', reason: 'done' });
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  expect(bridge.playAlertSound).not.toHaveBeenCalled();
  await settleAndUnmount(silent);

  bridge.getNotificationSounds.mockResolvedValue(DEFAULTS);
  const fallback = await renderApp();
  await emit({ type: 'chat.run.start', threadId: 't-default' });
  await emit({ type: 'chat.run.end', threadId: 't-default', reason: 'done' });
  await waitFor(() => bridge.playAlertSound.mock.calls.length >= 1);
  expect(bridge.playAlertSound).toHaveBeenCalledWith(null);
  await settleAndUnmount(fallback);
});
