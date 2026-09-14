/**
 * The two transfer halves of the files page.
 *
 * They are HTTP, not frames, and the credential is the one `/app-update/apk` presents: the
 * `device`/`token` query pair a native client carries, or nothing at all for a browser whose
 * session cookie speaks. What this suite pins is exactly that shape of the URL -- a route that
 * authenticates like the APK route has to be built like it -- plus the two behaviours copied
 * from `uploadMedia`: a refusal is sent once, a transport failure is retried once.
 */

import { deviceBridge } from '../nativeBridge';
import { downloadFsFile, uploadToFs } from '../upload';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const device = { deviceId: 'dev-test', token: 'token-test' };
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
  test('posts multipart to the directory, authenticated like the APK route', async () => {
    const result = await uploadToFs('http://server:8080', device, '/home/neras', files);

    expect(fetchUrls()).toEqual([
      'http://server:8080/fs/upload?path=%2Fhome%2Fneras&device=dev-test&token=token-test',
    ]);
    const init = fetchMock.mock.calls[0][1] as { method?: string; body?: unknown };
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ path: '/home/neras', files: [{ name: 'notes.md', size: 3 }] });
  });

  test('a browser identity leaves the query off and lets the session cookie speak', async () => {
    await uploadToFs('http://server:8080', null, '/', files);
    expect(fetchUrls()).toEqual(['http://server:8080/fs/upload?path=%2F']);
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

describe('downloadFsFile', () => {
  test('streams the file through the native downloader with the same credential', async () => {
    const saved = await downloadFsFile('http://server:8080', device, '/var/log/app.log', 'app.log');

    expect(bridge.downloadFile).toHaveBeenCalledTimes(1);
    const [url, filename, toGallery, transferId] = bridge.downloadFile.mock.calls[0];
    expect(url).toBe('http://server:8080/fs/download?path=%2Fvar%2Flog%2Fapp.log&device=dev-test&token=token-test');
    expect(filename).toBe('app.log');
    // Never the gallery: this page saves files, not photos.
    expect(toGallery).toBe(false);
    expect(String(transferId)).toMatch(/^fs-/);
    expect(saved).toBe('/storage/Pictures/my-claw/file');
  });

  test('a browser trips the same route with no query at all', async () => {
    await downloadFsFile('http://server:8080', null, '/etc/hosts', 'hosts');
    expect(bridge.downloadFile.mock.calls[0][0]).toBe('http://server:8080/fs/download?path=%2Fetc%2Fhosts');
  });
});
