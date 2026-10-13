/**
 * @format
 *
 * Several servers on one phone (docs/servers.md): a profile per server, one active, a switch that
 * puts the current one away and restarts the app on the other, and the notifications of a server
 * the app is not on still arriving, and opening on it.
 */

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { OS: 'android', select: (spec: Record<string, unknown>) => spec.android ?? spec.default },
  OS: 'android',
  select: (spec: Record<string, unknown>) => spec.android ?? spec.default,
}));

const mockLinkHandlers: Array<(event: { url: string }) => void> = [];
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: {
    getInitialURL: jest.fn(() => Promise.resolve(null)),
    addEventListener: jest.fn((_type: string, handler: (event: { url: string }) => void) => {
      mockLinkHandlers.push(handler);
      return { remove: () => mockLinkHandlers.splice(mockLinkHandlers.indexOf(handler), 1) };
    }),
    openURL: jest.fn(() => Promise.resolve()),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
  },
}));

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { prefs } from '../src/core/prefs';
import { serversStore, serverName } from '../src/core/servers';
import { parseNotificationLink, registerForPush, resetPushRegistration, subscribeToPushRegistration } from '../src/core/notifications';
import React from 'react';
import App from '../src/App';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const unifiedPush = require('expo-unified-push');

const HOME = 'ws://10.0.0.5:8080/my-claw-app';
const PAPA = 'wss://papa.example.fr/my-claw-app';

/** The native prefs, as a map the bridge reads and writes. */
let stored: Record<string, string> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockLinkHandlers.length = 0;
  serversStore.reset();
  resetPushRegistration();
  stored = { serverUrl: HOME, themeMode: 'dark', lastThreadId: 't-default' };
  bridge.prefsGetAll.mockImplementation(() => Promise.resolve({ ...stored }));
  bridge.prefsSet.mockImplementation((key: string, value: string | null) => {
    if (value === null) delete stored[key];
    else stored[key] = value;
    return Promise.resolve();
  });
});

async function boot(): Promise<void> {
  await prefs.hydrate();
  await serversStore.hydrate();
}

describe('the profiles', () => {
  test('a phone from a single-server build has one profile, `default`, on its address', async () => {
    await boot();
    expect(serversStore.get()).toEqual({ active: 'default', list: [{ id: 'default', name: '', url: HOME, lastThreadId: 't-default', setupSkipped: [] }] });
    expect(bridge.setActiveServer).toHaveBeenCalledWith('default');
    expect(serverName(serversStore.get().list[0]!)).toBe('10.0.0.5:8080');
  });

  test('adding a server switches to an empty profile: the app restarts with no address, on Join', async () => {
    await boot();
    await serversStore.add();
    const { list, active } = serversStore.get();
    expect(active).toMatch(/^s-/);
    expect(list.map(profile => profile.id)).toEqual(['default', active]);
    expect(prefs.get().serverUrl).toBe('');
    expect(bridge.setActiveServer).toHaveBeenLastCalledWith(active);
    expect(bridge.disconnect).toHaveBeenCalled();
    expect(bridge.reloadApp).toHaveBeenCalledTimes(1);
    // Written before the restart: the app comes back on the same profile.
    expect(JSON.parse(stored.servers!)).toHaveLength(2);
    expect(stored.activeServer).toBe(active);
  });

  test('a switch keeps where each server was, and connects to the other', async () => {
    stored.servers = JSON.stringify([
      { id: 'default', name: 'Home', url: HOME, lastThreadId: null },
      { id: 's-papa', name: '', url: PAPA, lastThreadId: 't-papa' },
    ]);
    await boot();
    prefs.set('lastThreadId', 't-home');
    await serversStore.switchTo('s-papa');
    expect(prefs.get()).toMatchObject({ serverUrl: PAPA, lastThreadId: 't-papa' });
    expect(bridge.connect).toHaveBeenLastCalledWith(PAPA);
    expect(bridge.reloadApp).toHaveBeenCalled();
    expect(JSON.parse(stored.servers!)[0]).toMatchObject({ id: 'default', url: HOME, lastThreadId: 't-home' });
  });

  test('the active profile follows an edited address: the same server reached another way', async () => {
    await boot();
    const off = prefs.subscribe(current => serversStore.syncActive(current));
    prefs.set('serverUrl', 'ws://100.64.0.7:8080/my-claw-app');
    off();
    expect(serversStore.get().list).toEqual([{ id: 'default', name: '', url: 'ws://100.64.0.7:8080/my-claw-app', lastThreadId: 't-default', setupSkipped: [] }]);
  });

  // A model skipped on the owner's server says nothing about a relative's, which has none yet:
  // the get started of a new server must still open.
  test('the get-started steps skipped are kept per server', async () => {
    stored.setupSkipped = 'model,voice';
    stored.servers = JSON.stringify([
      { id: 'default', name: 'Home', url: HOME, lastThreadId: null },
      { id: 's-papa', name: 'Papa', url: PAPA, lastThreadId: null, setupSkipped: ['location'] },
    ]);
    await boot();
    // A list written by 0.6.151 has no skipped steps: the active one takes what prefs held.
    expect(serversStore.active()?.setupSkipped).toEqual(['model', 'voice']);
    await serversStore.switchTo('s-papa');
    expect(prefs.get().setupSkipped).toEqual(['location']);
    expect(JSON.parse(stored.servers!)[0]).toMatchObject({ id: 'default', setupSkipped: ['model', 'voice'] });
    await serversStore.add();
    expect(prefs.get().setupSkipped).toEqual([]);
  });

  test('forgetting a server takes its credential and its queue, and never the active one', async () => {
    stored.servers = JSON.stringify([
      { id: 'default', name: 'Home', url: HOME, lastThreadId: null },
      { id: 's-papa', name: 'Papa', url: PAPA, lastThreadId: null },
    ]);
    await boot();
    serversStore.forget('default');
    expect(serversStore.get().list).toHaveLength(2);
    serversStore.forget('s-papa');
    expect(serversStore.get().list.map(profile => profile.id)).toEqual(['default']);
    expect(bridge.forgetServer).toHaveBeenCalledWith('s-papa');
    expect(bridge.forgetServer).not.toHaveBeenCalledWith('default');
  });
});

describe('notifications of several servers', () => {
  test('a link names the server it came from', () => {
    expect(parseNotificationLink('myclaw://thread/abc?server=s-papa')).toEqual({ kind: 'thread', threadId: 'abc', server: 's-papa' });
    expect(parseNotificationLink('myclaw://job/j1?server=default')).toEqual({ kind: 'job', jobId: 'j1', server: 'default' });
  });

  test('each server registers its own instance, and another one\'s endpoint is not sent here', async () => {
    stored.activeServer = 's-papa';
    const events: string[] = [];
    const off = subscribeToPushRegistration(event => events.push(event.kind === 'registered' ? event.subscription.endpoint : event.kind));
    await registerForPush('vapid-key');
    expect(unifiedPush.default.registerDevice).toHaveBeenCalledWith('vapid-key', 's-papa');
    unifiedPush.__emitDistributorMessage({ action: 'registered', data: { url: 'https://ntfy/home', instance: 'default' } });
    unifiedPush.__emitDistributorMessage({ action: 'registered', data: { url: 'https://ntfy/papa', instance: 's-papa' } });
    off();
    expect(events).toEqual(['https://ntfy/papa']);
  });

  test('a tap on another server\'s notification restarts the app there, and opens it once there', async () => {
    stored.servers = JSON.stringify([
      { id: 'default', name: 'Home', url: HOME, lastThreadId: null },
      { id: 's-papa', name: 'Papa', url: PAPA, lastThreadId: null },
    ]);
    const tree = await renderApp();
    await waitFor(() => serversStore.get().list.length === 2);
    await ReactTestRenderer.act(async () => {
      mockLinkHandlers.forEach(handler => handler({ url: 'myclaw://thread/t-papa-run?server=s-papa' }));
    });
    expect(stored.pendingLink).toBe('myclaw://thread/t-papa-run?server=s-papa');
    expect(bridge.setActiveServer).toHaveBeenLastCalledWith('s-papa');
    expect(bridge.reloadApp).toHaveBeenCalled();
    await unmount(tree);

    // The restart, on Papa's server: the link is opened and spent.
    serversStore.reset();
    await prefs.hydrate();
    let again!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      again = ReactTestRenderer.create(<App />);
    });
    await waitFor(() => stored.pendingLink === undefined);
    await waitFor(() => labelsOf(again).includes('Message to send'));
    await unmount(again);
  });
});

test('the Servers page lists the others and switches on a press', async () => {
  stored.servers = JSON.stringify([
    { id: 'default', name: 'Home', url: HOME, lastThreadId: null },
    { id: 's-papa', name: 'Papa', url: PAPA, lastThreadId: null },
  ]);
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  // Two servers: the list says which one it shows.
  await waitFor(() => labelsOf(tree).includes('Switch server'));
  await press(tree, 'Open settings');
  await press(tree, 'Open servers');
  await waitFor(() => labelsOf(tree).includes('Server Papa'));
  expect(textsOf(tree)).toContain('Home');
  await press(tree, 'Server Papa');
  await press(tree, 'Switch to this server');
  expect(bridge.setActiveServer).toHaveBeenLastCalledWith('s-papa');
  expect(bridge.reloadApp).toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state: 'connected', url: PAPA });
  });
  await unmount(tree);
});
