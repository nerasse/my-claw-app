/**
 * A file the browser picker hands over is read back without the network when it is a `data:`
 * URI: the page's CSP has no `data:` in connect-src, and the gallery photo used to fail staging
 * and upload alike with "Failed to fetch". Both bridge doors are pinned here, on the real module.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

interface FakeRequest {
  sent?: Blob;
  status: number;
  responseText: string;
  upload: { onprogress: ((event: { loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
}

function installGlobals(requests: FakeRequest[]): void {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  class Request implements FakeRequest {
    sent?: Blob;
    status = 200;
    responseText = '{"id":"m1"}';
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    withCredentials = false;
    open(): void {}
    setRequestHeader(): void {}
    send(body: Blob): void {
      this.sent = body;
      requests.push(this);
      queueMicrotask(() => this.onload?.());
    }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.localStorage = storage;
  globals.XMLHttpRequest = Request;
  globals.window = { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {}, location: { protocol: 'http:', host: 'localhost' } };
  globals.document = { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function loadBridge(): typeof import('../nativeBridge.web') {
  let loaded: typeof import('../nativeBridge.web') | null = null;
  jest.isolateModules(() => {
    loaded = require('../nativeBridge.web') as typeof import('../nativeBridge.web');
  });
  return loaded as unknown as typeof import('../nativeBridge.web');
}

test('a picked data: URI is staged and uploaded without fetch', async () => {
  const requests: FakeRequest[] = [];
  installGlobals(requests);
  const fetchMock = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const { deviceBridge } = loadBridge();

  await expect(deviceBridge.prepareFile(PNG)).resolves.toMatchObject({ uri: PNG, size: 8 });
  await expect(deviceBridge.uploadFile(PNG, '/media', 'photo.png', 'image/png', 't1', 'up-1')).resolves.toEqual({
    status: 200,
    body: '{"id":"m1"}',
  });
  expect(requests[0]!.sent!.size).toBe(8);
  expect(fetchMock).not.toHaveBeenCalled();
});

export {};
