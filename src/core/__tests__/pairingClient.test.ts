import {
  startPairing,
  pairingStatus,
  cancelPairing,
  resetPairingClient,
} from '../pairingClient';
import { deviceBridge } from '../nativeBridge';
import { connection } from '../connection';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

jest.mock('../connection', () => ({
  connection: { connect: jest.fn(), disconnect: jest.fn() },
}));

/** A minimal WebSocket double: the client only uses onopen/onmessage/onerror/onclose/send/close. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  server(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

describe('pairingClient', () => {
  beforeEach(() => {
    resetPairingClient();
    FakeWebSocket.instances = [];
    jest.clearAllMocks();
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    (connection as unknown as { connect: jest.Mock }).connect.mockClear();
  });

  test('an invalid code is refused before any socket opens', () => {
    startPairing('http://10.0.0.5:8080', 'nope');
    expect(pairingStatus()).toMatchObject({ phase: 'error' });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test('the app\'s own server setting (the socket URL) pairs on the same origin', () => {
    startPairing('ws://10.0.0.5:8080/my-claw-app', 'gw6e-73pk');
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://10.0.0.5:8080/my-claw-app/pair');
  });

  test('the claim is sent after the hello, on the pairing path', () => {
    startPairing('http://10.0.0.5:8080', 'gw6e-73pk');
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe('ws://10.0.0.5:8080/my-claw-app/pair');
    ws.open();
    expect(ws.sent).toContain(JSON.stringify({ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app' }));
    expect(ws.sent).toContain(JSON.stringify({ type: 'pair.claim', code: 'GW6E73PK' }));
  });

  test('a granted pair adopts the credentials and reconnects the chat socket', async () => {
    startPairing('http://10.0.0.5:8080', 'GW6E73PK');
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.server({ type: 'pair.granted', deviceId: 'app-abc1', owner: 'neras', name: 'Phone', token: 'the-token' });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(bridge.adoptCredentials).toHaveBeenCalledWith('app-abc1', 'the-token');
    expect((connection as unknown as { connect: jest.Mock }).connect).toHaveBeenCalledWith('ws://10.0.0.5:8080/my-claw-app');
    expect(pairingStatus()).toMatchObject({ phase: 'granted', deviceId: 'app-abc1' });

    cancelPairing();
    expect(pairingStatus()).toEqual({ phase: 'idle' });
  });

  test('a grant without a token is not adopted: the device stays unpaired', async () => {
    startPairing('http://10.0.0.5:8080', 'GW6E73PK');
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.server({ type: 'pair.granted', deviceId: 'app-abc1', grant: 'not-a-token' });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(bridge.adoptCredentials).not.toHaveBeenCalled();
    expect(pairingStatus()).toMatchObject({ phase: 'waiting' });
  });
});
