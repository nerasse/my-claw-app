/**
 * @format
 *
 * Push notifications (docs/notifications.md): the server hands its VAPID key on connect, the
 * distributor answers with a subscription that goes straight back to the server, the app keeps
 * the server informed of what is on screen so the run it is already watching stays silent, and
 * a notification tap opens the thread or the jobs page it came from.
 */

// The RN jest preset resolves platform files to 'ios'; the app only ever runs on Android, and
// every push entry point is a no-op elsewhere by design, so the suite would test nothing.
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { OS: 'android', select: (spec: Record<string, unknown>) => spec.android ?? spec.default },
  OS: 'android',
  select: (spec: Record<string, unknown>) => spec.android ?? spec.default,
}));

// Linking and AppState are native event sources: keep the registered handlers reachable so a
// test can play the notification tap and the background switch.
const mockLinkHandlers: Array<(event: { url: string }) => void> = [];
const mockAppStateHandlers: Array<(state: string) => void> = [];
let mockInitialUrl: string | null = null;

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: {
    getInitialURL: jest.fn(() => Promise.resolve(mockInitialUrl)),
    addEventListener: jest.fn((_type: string, handler: (event: { url: string }) => void) => {
      mockLinkHandlers.push(handler);
      return { remove: () => mockLinkHandlers.splice(mockLinkHandlers.indexOf(handler), 1) };
    }),
    openURL: jest.fn(() => Promise.resolve()),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
  },
}));

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    currentState: 'active',
    addEventListener: jest.fn((_type: string, handler: (state: string) => void) => {
      mockAppStateHandlers.push(handler);
      return { remove: () => mockAppStateHandlers.splice(mockAppStateHandlers.indexOf(handler), 1) };
    }),
  },
}));

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import {
  notificationIdFor,
  parseNotificationLink,
  resetPushRegistration,
} from '../src/core/notifications';
import { labelsOf, renderApp, unmount, waitFor } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const unifiedPush = require('expo-unified-push');

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentOfType(type: string): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls
    .map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>)
    .filter(frame => frame.type === type);
}

/** Replays what the distributor broadcasts once it has an endpoint for us. */
function emitDistributor(message: {
  action: string;
  data: Record<string, unknown>;
}): Promise<void> {
  return ReactTestRenderer.act(async () => {
    unifiedPush.__emitDistributorMessage(message);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  bridge.sendMessage.mockResolvedValue(true);
  mockLinkHandlers.length = 0;
  mockAppStateHandlers.length = 0;
  mockInitialUrl = null;
  // The registration guard is module state: a previous test may have already registered.
  resetPushRegistration();
});

describe('parseNotificationLink', () => {
  test('reads the two deep links the server sends, and refuses anything else', () => {
    expect(parseNotificationLink('myclaw://thread/abc')).toEqual({ kind: 'thread', threadId: 'abc' });
    expect(parseNotificationLink('myclaw://job/job-1')).toEqual({ kind: 'job', jobId: 'job-1' });
    expect(parseNotificationLink('myclaw://thread/a%20b')).toEqual({ kind: 'thread', threadId: 'a b' });
    expect(parseNotificationLink('https://evil.example/thread/x')).toBeNull();
    expect(parseNotificationLink('myclaw://thread/')).toBeNull();
    expect(parseNotificationLink(null)).toBeNull();
  });
});

describe('notificationIdFor', () => {
  test('agrees with the server on the id a link was posted with', () => {
    // The same three vectors are asserted server-side (tests/notifications/push.test.ts). The id
    // is never received, only recomputed, so a silent drift would stop every dismissal.
    expect(notificationIdFor('myclaw://thread/abc')).toBe(1185530383);
    expect(notificationIdFor('myclaw://thread/from-notif')).toBe(333754526);
    expect(notificationIdFor('myclaw://job/job-1')).toBe(253371665);
  });
});

test('opening a conversation clears the notification it raised', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    mockLinkHandlers.forEach(handler => handler({ url: 'myclaw://thread/from-notif' }));
  });

  await waitFor(() => bridge.cancelNotification.mock.calls.length > 0);
  expect(bridge.cancelNotification).toHaveBeenCalledWith(
    notificationIdFor('myclaw://thread/from-notif'),
  );
  await unmount(tree);
});

test('coming back to the foreground clears the notification of the open conversation', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    mockLinkHandlers.forEach(handler => handler({ url: 'myclaw://thread/from-notif' }));
  });
  await waitFor(() => bridge.cancelNotification.mock.calls.length > 0);
  bridge.cancelNotification.mockClear();

  await ReactTestRenderer.act(async () => {
    mockAppStateHandlers.forEach(handler => handler('background'));
  });
  expect(bridge.cancelNotification).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    mockAppStateHandlers.forEach(handler => handler('active'));
  });
  expect(bridge.cancelNotification).toHaveBeenCalledWith(
    notificationIdFor('myclaw://thread/from-notif'),
  );
  await unmount(tree);
});

test('the VAPID key from the server registers the device with its distributor', async () => {
  const tree = await renderApp();
  await emit({ type: 'notifications.info', vapidPublicKey: 'server-key' });

  await waitFor(() => unifiedPush.default.registerDevice.mock.calls.length === 1);
  expect(unifiedPush.default.registerDevice).toHaveBeenCalledWith('server-key');
  // No distributor was saved yet: the external one is picked rather than left to chance.
  expect(unifiedPush.default.saveDistributor).toHaveBeenCalledWith('io.heckel.ntfy');
  await unmount(tree);
});

test('the subscription the distributor hands out is sent to the server', async () => {
  const tree = await renderApp();
  await emitDistributor({
    action: 'registered',
    data: { url: 'https://ntfy.example/up/secret', pubKey: 'p256', auth: 'auth-secret' },
  });

  const sent = sentOfType('notifications.register');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    endpoint: 'https://ntfy.example/up/secret',
    pubKey: 'p256',
    auth: 'auth-secret',
  });
  await unmount(tree);
});

test('losing the registration clears the endpoint server-side instead of leaving it publishing', async () => {
  const tree = await renderApp();
  await emitDistributor({ action: 'unregistered', data: {} });

  const sent = sentOfType('notifications.register');
  expect(sent).toHaveLength(1);
  expect(sent[0]!.endpoint).toBe('');
  await unmount(tree);
});

test('the app reports its foreground state so the thread on screen stays silent', async () => {
  const tree = await renderApp();

  // Mounting reports the current state; the thread is only carried once one is open.
  await waitFor(() => sentOfType('notifications.state').length >= 1);
  const first = sentOfType('notifications.state')[0]!;
  expect(first.foreground).toBe(true);

  await ReactTestRenderer.act(async () => {
    mockAppStateHandlers.forEach(handler => handler('background'));
  });
  const afterBackground = sentOfType('notifications.state').pop()!;
  expect(afterBackground.foreground).toBe(false);
  await unmount(tree);
});

test('a reconnect with the same key does not re-register: one registration per session', async () => {
  const tree = await renderApp();
  await emit({ type: 'notifications.info', vapidPublicKey: 'server-key' });
  await waitFor(() => unifiedPush.default.registerDevice.mock.calls.length === 1);

  // The socket dropped and came back: the same key arrives again, nothing to do.
  await emit({ type: 'notifications.info', vapidPublicKey: 'server-key' });
  await new Promise<void>(resolve => setTimeout(() => resolve(), 20));
  expect(unifiedPush.default.registerDevice.mock.calls.length).toBe(1);
  await unmount(tree);
});

test('the distributor dropping the registration allows a fresh one', async () => {
  const tree = await renderApp();
  await emit({ type: 'notifications.info', vapidPublicKey: 'server-key' });
  await waitFor(() => unifiedPush.default.registerDevice.mock.calls.length === 1);

  await emitDistributor({ action: 'unregistered', data: {} });
  await emit({ type: 'notifications.info', vapidPublicKey: 'server-key' });
  await waitFor(() => unifiedPush.default.registerDevice.mock.calls.length === 2);
  await unmount(tree);
});

test('a notification tap opens the thread it came from, cold start included', async () => {
  mockInitialUrl = 'myclaw://thread/from-notif';
  const tree = await renderApp();

  // Opening a thread asks the server for its history: that is the observable effect.
  await waitFor(() =>
    bridge.sendMessage.mock.calls.some(([frame]) => {
      const parsed = JSON.parse(String(frame)) as Record<string, unknown>;
      return parsed.type === 'session.sync' && parsed.threadId === 'from-notif';
    }),
  );
  await unmount(tree);
});

test('a job notification tap opens the jobs page', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    mockLinkHandlers.forEach(handler => handler({ url: 'myclaw://job/job-42' }));
  });

  await waitFor(() => labelsOf(tree).includes('Add job'));
  expect(sentOfType('jobs.list').length).toBeGreaterThan(0);
  await unmount(tree);
});
