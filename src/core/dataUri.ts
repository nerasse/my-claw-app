/**
 * The bytes of a `data:` URI, without asking the network for them.
 *
 * The gallery picker hands the web build a base64 `data:` URI. Reading it back with `fetch()` is
 * a connection as far as the page's Content-Security-Policy goes, and the server's `connect-src`
 * (rightly) does not list `data:`: every photo picked from the gallery failed with "Failed to
 * fetch" before a byte was sent.
 */
export function blobFromDataUri(uri: string): Blob {
  const match = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(uri);
  if (!match) throw new Error('not a data: URI');
  const [, mime, , base64, payload] = match;
  const text = base64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'text/plain' });
}

/** The media type a `data:` URI declares, or null for any other URI. */
export function dataUriType(uri: string): string | null {
  return /^data:([^;,]+)/.exec(uri)?.[1] ?? null;
}

/** A local URI the browser handed over (`blob:` or `data:`), read as bytes. */
export async function readLocalUri(uri: string): Promise<Blob> {
  return uri.startsWith('data:') ? blobFromDataUri(uri) : fetch(uri).then(response => response.blob());
}
