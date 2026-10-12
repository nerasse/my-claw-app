/**
 * A photo picked from the gallery reaches the web build as a `data:` URI, and its bytes are read
 * back without `fetch()`, which the page's CSP refuses for `data:` (connect-src).
 */
import { blobFromDataUri, readLocalUri } from '../dataUri';

async function bytesOf(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

describe('blobFromDataUri', () => {
  it('decodes base64 bytes exactly, and keeps the type', async () => {
    const blob = blobFromDataUri('data:image/png;base64,iVBORw0KGgo=');
    expect(blob.type).toBe('image/png');
    expect(await bytesOf(blob)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('reads a percent-encoded payload and a parameter before base64', async () => {
    expect(await blobFromDataUri('data:text/plain,a%20b').text()).toBe('a b');
    expect(await blobFromDataUri('data:text/plain;charset=utf-8;base64,aGk=').text()).toBe('hi');
  });

  it('refuses anything that is not a data: URI', () => {
    expect(() => blobFromDataUri('blob:http://host/1')).toThrow('not a data: URI');
  });
});

describe('readLocalUri', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('never asks the network for a data: URI, and fetches anything else', async () => {
    const fetchMock = jest.fn(async () => ({ blob: async () => new Blob(['x']) }) as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(await (await readLocalUri('data:text/plain,hi')).text()).toBe('hi');
    expect(fetchMock).not.toHaveBeenCalled();
    await readLocalUri('blob:http://host/1');
    expect(fetchMock).toHaveBeenCalledWith('blob:http://host/1');
  });
});
