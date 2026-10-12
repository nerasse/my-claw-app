/**
 * The two transfer halves of the files page.
 *
 * They are HTTP, not frames. The upload is a request the app makes itself: the device credential
 * goes in its headers, never in the URL, where every proxy on the way logs it. The download link
 * is handed to a downloader that cannot set headers: it carries the server's media ticket, and
 * there is no link before the ticket. A browser's session cookie speaks on its own (the web twin
 * of serverUrl). Plus the two behaviours copied from `uploadMedia`: a refusal is sent once, a
 * transport failure is retried once.
 */

import { fsDownloadUrl, uploadToFs } from '../upload';


const device = { deviceId: 'dev-test', token: 'token-test', ticket: 'ticket-test' };
const files = [
  { uri: 'content://docs/1', name: 'notes.md', type: 'text/markdown' },
  { uri: 'content://docs/2', name: 'photo.jpg', type: 'image/jpeg' },
];

const realFetch = globalThis.fetch;
const fetchMock = jest.fn();

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function refused(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

function fetchUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(ok({ path: '/home/neras', files: [{ name: 'notes.md', size: 3 }] }));
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('uploadToFs', () => {
  test('posts multipart to the directory, the credential in the headers and not the URL', async () => {
    const result = await uploadToFs('http://server:8080', device, '/home/neras', files);

    expect(fetchUrls()).toEqual(['http://server:8080/fs/upload?path=%2Fhome%2Fneras']);
    const init = fetchMock.mock.calls[0][1] as { method?: string; body?: unknown; headers?: Record<string, string> };
    expect(init.headers).toEqual({ 'X-My-Claw-Device': 'dev-test', Authorization: 'Bearer token-test' });
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ path: '/home/neras', files: [{ name: 'notes.md', size: 3 }] });
  });

  test('with no identity, nothing is attached and the session cookie speaks', async () => {
    await uploadToFs('http://server:8080', null, '/', files);
    expect(fetchUrls()).toEqual(['http://server:8080/fs/upload?path=%2F']);
    expect((fetchMock.mock.calls[0][1] as { headers?: unknown }).headers).toEqual({});
  });

  test('a refusal from the server is final: one attempt, and the reason is kept', async () => {
    fetchMock.mockResolvedValue(refused(413, 'Payload Too Large'));

    await expect(uploadToFs('http://server:8080', device, '/home', files)).rejects.toThrow(
      'upload failed: Payload Too Large',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a request that never reached the server is retried once', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(ok({ path: '/home', files: [] }));

    await expect(uploadToFs('http://server:8080', device, '/home', files)).resolves.toEqual({
      path: '/home',
      files: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('an aborted upload is not retried: something cancelled it on purpose', async () => {
    fetchMock.mockRejectedValue(new Error('upload aborted'));

    await expect(uploadToFs('http://server:8080', device, '/home', files)).rejects.toThrow('upload aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fsDownloadUrl', () => {
  test('carries the media ticket, never the device token', () => {
    const url = fsDownloadUrl('http://server:8080', device, '/var/log/app.log');
    expect(url).toBe('http://server:8080/fs/download?path=%2Fvar%2Flog%2Fapp.log&ticket=ticket-test');
    expect(url).not.toContain('token-test');
  });

  test('has no link to give before the identity or the ticket', () => {
    expect(fsDownloadUrl('http://server:8080', null, '/etc/hosts')).toBe('');
    expect(fsDownloadUrl('http://server:8080', { deviceId: 'dev-test', token: 'token-test' }, '/etc/hosts')).toBe('');
  });
});
