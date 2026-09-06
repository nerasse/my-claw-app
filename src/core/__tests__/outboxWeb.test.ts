/**
 * The browser outbox: what survives a reload, what it refuses to grow past, and what has gone
 * stale by the time the socket comes back.
 *
 * The module reads browser globals at import time, so each case installs its own fakes and loads
 * a fresh copy of it.
 */

interface FakeSocket {
  readyState: number;
  sent: string[];
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: (text: string) => void;
  close: () => void;
  bufferedAmount: number;
}

const sockets: FakeSocket[] = [];

function installGlobals(stored?: unknown): Storage {
  const store = new Map<string, string>();
  if (stored !== undefined) store.set('claw:outbox', JSON.stringify(stored));
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;

  class Socket {
    static readonly OPEN = 1;
    readyState = 0;
    sent: string[] = [];
    bufferedAmount = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      sockets.push(this as unknown as FakeSocket);
    }
    send(text: string): void {
      this.sent.push(text);
    }
    close(): void {
      this.readyState = 3;
    }
  }

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.localStorage = storage;
  globals.WebSocket = Socket;
  globals.window = {
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { protocol: 'http:', host: 'localhost' },
  };
  globals.document = { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
  return storage;
}

let current: typeof import('../nativeBridge.web') | null = null;

function loadBridge(): typeof import('../nativeBridge.web') {
  let loaded: typeof import('../nativeBridge.web') | null = null;
  jest.isolateModules(() => {
    loaded = require('../nativeBridge.web') as typeof import('../nativeBridge.web');
  });
  current = loaded as unknown as typeof import('../nativeBridge.web');
  return current;
}

function openLast(): void {
  const socket = sockets[sockets.length - 1]!;
  socket.readyState = 1;
  socket.onopen?.();
}

beforeEach(() => {
  sockets.length = 0;
});

// The bridge keeps a reconnect timer and a heartbeat alive; left running they hold the worker open
// long after the assertions are done.
afterEach(() => {
  current?.deviceBridge.disconnect();
  current = null;
});

describe('the web outbox', () => {
  it('does not queue the same frame twice when connect runs again', () => {
    // restoreOutbox used to run on every connect(), and connect() runs again on a server address
    // change or a re-login: the stored frames were prepended to a queue that already held them,
    // so one message was sent once per reconnect the tab had made.
    installGlobals([{ text: '{"type":"chat.send","id":"m1"}', at: Date.now() }]);
    const bridge = loadBridge();

    bridge.deviceBridge.connect('ws://localhost:8080/my-claw-app');
    bridge.deviceBridge.connect('ws://localhost:8080/my-claw-app');
    openLast();

    const sent = sockets[sockets.length - 1]!.sent.filter(text => text.includes('chat.send'));
    expect(sent).toHaveLength(1);
  });

  it('refuses a frame past the ceiling instead of growing until the quota fails', async () => {
    installGlobals();
    const bridge = loadBridge();
    bridge.deviceBridge.connect('ws://localhost:8080/my-claw-app');

    for (let i = 0; i < 200; i += 1) {
      await expect(bridge.deviceBridge.sendMessage(`{"type":"chat.send","id":"m${i}"}`)).resolves.toBe(true);
    }
    // 201st: the composer has to hear no, or it marks a bubble sent that nothing will ever carry.
    await expect(bridge.deviceBridge.sendMessage('{"type":"chat.send","id":"over"}')).resolves.toBe(false);
    await expect(bridge.deviceBridge.pendingCount()).resolves.toBe(200);
  });

  it('drops a stop that has gone stale, and keeps the message typed beside it', () => {
    // A stop names the run that was live when it was typed. Sent on a reconnect an hour later it
    // lands on whatever is running then, and kills an answer nobody asked to stop.
    const old = Date.now() - 3_600_000;
    installGlobals([
      { text: '{"type":"chat.stop","threadId":"t1"}', at: old },
      { text: '{"type":"chat.send","id":"m1","text":"bonjour"}', at: old },
    ]);
    const bridge = loadBridge();

    bridge.deviceBridge.connect('ws://localhost:8080/my-claw-app');
    openLast();

    const sent = sockets[sockets.length - 1]!.sent;
    expect(sent.some(text => text.includes('chat.stop'))).toBe(false);
    expect(sent.some(text => text.includes('bonjour'))).toBe(true);
  });

  it('keeps a stop that was typed a moment ago', () => {
    installGlobals([{ text: '{"type":"chat.stop","threadId":"t1"}', at: Date.now() }]);
    const bridge = loadBridge();

    bridge.deviceBridge.connect('ws://localhost:8080/my-claw-app');
    openLast();

    expect(sockets[sockets.length - 1]!.sent.some(text => text.includes('chat.stop'))).toBe(true);
  });

  it('reads a queue written before frames were stamped, and treats it as old', () => {
    // Bare strings: written by the version before this one. Undated means old, which is the right
    // reading -- the message is still worth sending, the stop beside it is not.
    installGlobals(['{"type":"chat.stop","threadId":"t1"}', '{"type":"chat.send","id":"m1","text":"bonjour"}']);
    const bridge = loadBridge();

    bridge.deviceBridge.connect('ws://localhost:8080/my-claw-app');
    openLast();

    const sent = sockets[sockets.length - 1]!.sent;
    expect(sent.some(text => text.includes('chat.stop'))).toBe(false);
    expect(sent.some(text => text.includes('bonjour'))).toBe(true);
  });
});
