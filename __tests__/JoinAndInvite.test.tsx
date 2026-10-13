/**
 * @format
 *
 * The two ways a device joins a server (docs/web-pairing.md in the server repo), and the one thing
 * that left a relative stuck: an app the server does not know, with nothing to scan and a Connect
 * button that could only ever answer "unauthorized".
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { prefs } from '../src/core/prefs';
import { connection } from '../src/core/connection';
import { devicesStore } from '../src/core/devices';
import { PairingScreen } from '../src/app/PairingScreen';
import { DevicesScreen } from '../src/app/DevicesScreen';
import { pairingStatus, requestAccess, resetPairingClient, cancelPairing } from '../src/core/pairingClient';
import { parseServerFrame } from '../src/core/protocol';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, press, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

class Socket {
  static all: Socket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    Socket.all.push(this);
  }
  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }
  close(): void {}
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: Record<string, unknown>): Promise<void> {
    return ReactTestRenderer.act(async () => {
      await this.onmessage?.({ data: JSON.stringify(frame) });
    });
  }
}

beforeEach(() => {
  resetPairingClient();
  devicesStore.reset();
  Socket.all = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = Socket;
});

describe('asking for access', () => {
  test('shows the code and the digits, says when a device looks, and adopts what is granted', async () => {
    bridge.adoptCredentials.mockResolvedValue(true);
    const connect = jest.spyOn(connection, 'connect').mockImplementation(async () => {});
    requestAccess('ws://10.0.0.5:8080/my-claw-app');
    const socket = Socket.all[0]!;
    expect(socket.url).toBe('ws://10.0.0.5:8080/my-claw-app/pair');
    socket.open();
    // A hello and no claim: the server answers a challenge, as it does for a browser.
    expect(socket.sent).toEqual([{ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app' }]);

    await socket.receive({ type: 'pair.challenge', code: 'K7QW3M2P', verification: '418', expiresAt: Date.now() + 600_000, resumeToken: 'rt' });
    expect(pairingStatus()).toMatchObject({ phase: 'asking', code: 'K7QW3M2P', verification: '418', seen: false });
    await socket.receive({ type: 'pair.pending', approver: 'web-1' });
    expect(pairingStatus()).toMatchObject({ phase: 'asking', seen: true });

    await socket.receive({ type: 'pair.granted', deviceId: 'app-123', token: 'tok', owner: 'neras', name: 'phone' });
    expect(bridge.adoptCredentials).toHaveBeenCalledWith('app-123', 'tok', 'http://10.0.0.5:8080');
    expect(pairingStatus()).toEqual({ phase: 'granted', deviceId: 'app-123', url: 'ws://10.0.0.5:8080/my-claw-app' });
    expect(connect).toHaveBeenCalledWith('ws://10.0.0.5:8080/my-claw-app');
    connect.mockRestore();
  });

  // Typed as `http://host:port` or read from a QR, the address becomes the socket the app talks to.
  test('after joining, the address setting holds the socket address', async () => {
    bridge.prefsGetAll.mockResolvedValue({ serverUrl: 'ws://10.0.0.5:8080/my-claw-app', themeMode: 'dark' });
    const tree = await renderAppHome();
    const connect = jest.spyOn(connection, 'connect').mockImplementation(async () => {});
    ReactTestRenderer.act(() => requestAccess('http://10.0.0.9:8080'));
    const socket = Socket.all.at(-1)!;
    ReactTestRenderer.act(() => socket.open());
    await socket.receive({ type: 'pair.challenge', code: 'K7QW3M2P', verification: '418', expiresAt: Date.now() + 600_000, resumeToken: 'rt' });
    await socket.receive({ type: 'pair.granted', deviceId: 'app-9', token: 'tok', owner: 'neras', name: 'phone' });
    await waitFor(() => prefs.get().serverUrl === 'ws://10.0.0.9:8080/my-claw-app');
    connect.mockRestore();
    await unmount(tree);
  });

  test('a refused request says so instead of waiting forever', async () => {
    requestAccess('http://10.0.0.5:8080');
    const socket = Socket.all[0]!;
    socket.open();
    await socket.receive({ type: 'pair.challenge', code: 'K7QW3M2P', verification: '418', expiresAt: Date.now() + 600_000, resumeToken: 'rt' });
    await socket.receive({ type: 'pair.denied', reason: 'denied' });
    expect(pairingStatus()).toEqual({ phase: 'error', reason: 'the request was refused' });
  });

  // A phone loses its socket (sleep, a network switch): the server keeps the request, the app picks
  // it up again with the token only it was given, and the code on screen stays valid.
  test('a lost socket picks the same request up again', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      requestAccess('http://10.0.0.5:8080');
      const first = Socket.all[0]!;
      first.open();
      await first.receive({ type: 'pair.challenge', code: 'K7QW3M2P', verification: '418', expiresAt: Date.now() + 600_000, resumeToken: 'rt' });
      ReactTestRenderer.act(() => first.onclose?.());
      expect(pairingStatus().phase).toBe('asking');
      ReactTestRenderer.act(() => {
        jest.advanceTimersByTime(2000);
      });
      const second = Socket.all[1]!;
      second.open();
      expect(second.sent[0]).toEqual({ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app', resume: { code: 'K7QW3M2P', token: 'rt' } });
    } finally {
      cancelPairing();
      jest.useRealTimers();
    }
  });
});

describe('the Join screen', () => {
  function screen(pairing = pairingStatus(), unknownDevice = false) {
    return <PairingScreen serverUrl="ws://10.0.0.5:8080/my-claw-app" onUrlChange={() => {}} pairing={pairing} onClose={() => {}} unknownDevice={unknownDevice} />;
  }

  test('says the server does not know this device, and offers both ways in', async () => {
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(screen(undefined, true));
    });
    expect(labelsOf(tree)).toEqual(expect.arrayContaining(['Device unknown to the server', 'Submit this pairing code', 'Ask for access']));
    await press(tree, 'Ask for access');
    expect(Socket.all[0]!.url).toBe('ws://10.0.0.5:8080/my-claw-app/pair');
    await unmount(tree);
  });

  test('while asking, the code and digits replace the form', async () => {
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(screen({ phase: 'asking', code: 'K7QW3M2P', verification: '418', expiresAt: Date.now() + 1000, seen: false }));
    });
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['K7QW-3M2P', '418']));
    expect(labelsOf(tree)).not.toContain('Submit this pairing code');
    expect(labelsOf(tree)).toContain('Cancel the request');
    await unmount(tree);
  });
});

describe('the Devices page', () => {
  const sent = (): Array<Record<string, unknown>> =>
    (connection.send as unknown as jest.SpyInstance).mock.calls.map(call => JSON.parse(call[0] as string) as Record<string, unknown>);

  test('an invitation names the address the new device will use, and shows its QR and code', async () => {
    const spy = jest.spyOn(connection, 'send').mockResolvedValue(true);
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<DevicesScreen onBack={() => {}} connected serverOrigin="http://10.0.0.5:8080" />);
    });
    await press(tree, 'Add a device');
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Name of the new device' }).props.onChangeText('Papa');
    });
    await press(tree, 'Create the invitation');
    expect(sent().at(-1)).toEqual({ type: 'device.invite', origin: 'http://10.0.0.5:8080', name: 'Papa' });

    await ReactTestRenderer.act(async () => {
      devicesStore.onInvite({ type: 'device.invite.result', ok: true, code: 'K7QW3M2P', expiresAt: Date.now() + 600_000, url: 'http://10.0.0.5:8080/pair#K7QW3M2P', qrSvg: '<svg/>' });
    });
    expect(labelsOf(tree)).toEqual(expect.arrayContaining(['Invitation QR code', 'Copy the invitation link']));
    expect(textsOf(tree)).toContain('K7QW-3M2P');

    // The new device claimed it: the card has done its job.
    await ReactTestRenderer.act(async () => {
      devicesStore.onPairResult({ type: 'device.pair.result', ok: true, deviceId: 'app-9' });
    });
    expect(labelsOf(tree)).not.toContain('Invitation QR code');
    expect(textsOf(tree)).toContain('device added');
    // Opened again, it makes a new invitation: the one claimed is spent.
    await press(tree, 'Add a device');
    expect(labelsOf(tree)).toContain('Create the invitation');
    expect(labelsOf(tree)).not.toContain('Invitation QR code');
    spy.mockRestore();
    await unmount(tree);
  });

  test('a request from a phone is approved as a phone', async () => {
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<DevicesScreen onBack={() => {}} connected serverOrigin="http://10.0.0.5:8080" />);
    });
    await ReactTestRenderer.act(async () => {
      devicesStore.onPairInfo({ type: 'device.pair.info', code: 'K7QW3M2P', verification: '418', expiresAt: 1, kind: 'native' });
    });
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Approve this phone?', 'the phone must show', '418']));
    await unmount(tree);
  });
});

// The relative's case: an old install, the server answers 401, the Join screen was offered once
// and closed, and Connect could never get past it.
test('every refusal after a Connect opens the Join screen again', async () => {
  bridge.prefsGetAll.mockResolvedValue({ serverUrl: 'ws://10.0.0.5:8080/my-claw-app', themeMode: 'dark' });
  const tree = await renderAppHome();
  const refuse = () =>
    ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('claw:ws:state', { state: 'disconnected', url: 'ws://10.0.0.5:8080/my-claw-app', reason: 'unauthorized' });
    });
  await refuse();
  await waitFor(() => textsOf(tree).includes('Join a server'));
  expect(labelsOf(tree)).toContain('Device unknown to the server');

  // Closed: it lands on the Server page, which says why and offers Join in place of Connect.
  await press(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Join this server'));
  expect(labelsOf(tree)).not.toContain('Connect');

  // Another refusal with no new attempt does not throw the screen back at the owner.
  await refuse();
  expect(textsOf(tree)).not.toContain('Join a server');

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state: 'connecting', url: 'ws://10.0.0.5:8080/my-claw-app' });
  });
  await waitFor(() => labelsOf(tree).includes('Connect'));
  await press(tree, 'Connect');
  await refuse();
  await waitFor(() => textsOf(tree).includes('Join a server'));
  await unmount(tree);
});

// The parser is a whitelist: a frame it does not list never reaches the store (AGENTS.md).
test('an invitation answer gets through the parser', () => {
  expect(parseServerFrame(JSON.stringify({ type: 'device.invite.result', ok: true, code: 'K7QW3M2P', url: 'http://h/pair#K7QW3M2P' }))).toMatchObject({ type: 'device.invite.result' });
});
