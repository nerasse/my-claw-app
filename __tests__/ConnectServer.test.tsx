/**
 * @format
 *
 * A new install has no server address built in: it asks for one before anything connects, and the
 * QR of `myclaw setup` gives it (the claim URL names the server). A phone that already ran on the
 * old built-in address keeps it (prefs.test.ts).
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { deviceBridge } from '../src/core/nativeBridge';
import { prefs } from '../src/core/prefs';
import { connection } from '../src/core/connection';
import { PairingScreen } from '../src/app/PairingScreen';
import { pairingStatus, resetPairingClient } from '../src/core/pairingClient';
import App from '../src/App';
import { labelsOf, textsOf, unmount, waitFor } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

let mockScanned = 'https://claw.example.fr/pair#K7QW3M2P';
jest.mock('../src/components/PairScanner', () => ({
  PairScanner: ({ onCode }: { onCode: (code: string, server: string | null) => void }) => {
    const { serverFromClaimUrl } = jest.requireActual('../src/core/serverUrl');
    const { codeFromScan } = jest.requireActual('../src/components/PairScanner.web');
    const ReactActual = jest.requireActual('react');
    ReactActual.useEffect(() => {
      onCode(codeFromScan(mockScanned), serverFromClaimUrl(mockScanned));
    }, [onCode]);
    return null;
  },
}));

class Socket {
  static urls: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    Socket.urls.push(url);
  }
  send(): void {}
  close(): void {}
}

beforeEach(() => {
  jest.clearAllMocks();
  resetPairingClient();
  Socket.urls = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = Socket;
});

test('a new install asks for its server before connecting anywhere', async () => {
  bridge.prefsGetAll.mockResolvedValue({});
  const connect = jest.spyOn(connection, 'connect');
  // A cold start: nothing is connected yet, so only the missing address can hold the app back.
  bridge.getConnectionState.mockResolvedValue('disconnected');
  await prefs.hydrate();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await waitFor(() => textsOf(tree).includes('Connect to your server'));
  expect(textsOf(tree)).toContain('Connect this app to your my-claw');
  // Not even asked: an empty address would only be refused one layer down, as an error.
  expect(connect).not.toHaveBeenCalled();
  expect(bridge.connect).not.toHaveBeenCalled();
  connect.mockRestore();
  bridge.getConnectionState.mockResolvedValue('connected');
  await unmount(tree);
});

function screen(serverUrl: string, onUrlChange: (url: string) => void = () => {}) {
  return (
    <PairingScreen serverUrl={serverUrl} onUrlChange={onUrlChange} pairing={pairingStatus()} onClose={() => {}} />
  );
}

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string): Promise<void> {
  const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  await ReactTestRenderer.act(async () => {
    node.props.onPress();
  });
}

test('scanning the QR takes the server address from it, and pairs there', async () => {
  const changed: string[] = [];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(screen('', url => changed.push(url)));
  });
  await press(tree, 'Scan a pairing code');
  expect(changed).toEqual(['wss://claw.example.fr/my-claw-app']);
  expect(Socket.urls).toEqual(['wss://claw.example.fr/my-claw-app/pair']);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('a bare code in the QR keeps the typed address', async () => {
  mockScanned = 'K7QW3M2P';
  const changed: string[] = [];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(screen('ws://192.168.1.20:8080/my-claw-app', url => changed.push(url)));
  });
  await press(tree, 'Scan a pairing code');
  expect(changed).toEqual([]);
  expect(Socket.urls).toEqual(['ws://192.168.1.20:8080/my-claw-app/pair']);
  mockScanned = 'https://claw.example.fr/pair#K7QW3M2P';
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('without an address, a typed code cannot be sent', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(screen(''));
  });
  const input = tree.root.find(n => n.props.placeholder === 'XXXX-XXXX' && typeof n.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => input.props.onChangeText('K7QW3M2P'));
  const pair = tree.root.find(n => n.props.accessibilityLabel === 'Submit this pairing code' && n.props.disabled !== undefined);
  expect(pair.props.disabled).toBe(true);
  expect(labelsOf(tree)).toContain('Server address');
  expect(Socket.urls).toEqual([]);
  await ReactTestRenderer.act(async () => tree.unmount());
});


test('an incomplete code cannot start a request', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(screen('https://claw.example.fr')); });
  const input = tree.root.find(n => n.props.placeholder === 'XXXX-XXXX' && typeof n.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => input.props.onChangeText('K7'));
  const pair = tree.root.find(n => n.props.accessibilityLabel === 'Submit this pairing code' && n.props.disabled !== undefined);
  expect(pair.props.disabled).toBe(true);
  expect(Socket.urls).toEqual([]);
  await unmount(tree);
});

test('an expired code can be replaced and submitted without leaving the screen', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(screen('https://claw.example.fr')); });
  const input = () => tree.root.find(n => n.props.placeholder === 'XXXX-XXXX' && typeof n.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => input().props.onChangeText('K7QW3M2P'));
  await press(tree, 'Submit this pairing code');
  await ReactTestRenderer.act(async () => {
    tree.update(<PairingScreen serverUrl="https://claw.example.fr" onUrlChange={() => {}}
      pairing={{ phase: 'error', reason: 'Code expired' }} onClose={() => {}} />);
  });
  await ReactTestRenderer.act(async () => input().props.onChangeText('P2M3WQ7K'));
  await press(tree, 'Submit this pairing code');
  expect(Socket.urls).toHaveLength(2);
  await unmount(tree);
});

test('pairing can be cancelled while it waits for the server', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(screen('https://claw.example.fr')); });
  const input = tree.root.find(n => n.props.placeholder === 'XXXX-XXXX' && typeof n.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => input.props.onChangeText('K7QW3M2P'));
  await press(tree, 'Submit this pairing code');
  await ReactTestRenderer.act(async () => {
    tree.update(<PairingScreen serverUrl="https://claw.example.fr" onUrlChange={() => {}}
      pairing={{ phase: 'waiting', code: 'K7QW3M2P' }} onClose={() => {}} />);
  });
  expect(labelsOf(tree)).toContain('Cancel pairing');
  await unmount(tree);
});
