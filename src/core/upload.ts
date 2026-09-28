import { authQuery } from './serverUrl';
import type { AttachmentMeta } from './protocol';
import type { DeviceInfo } from './device';
import { deviceBridge, onTransferProgress } from './nativeBridge';

export interface PendingAttachment {
  id: string;
  uri: string;
  filename: string;
  type: AttachmentMeta['type'];
  mimeType: string;
  sizeBytes?: number;
  /**
   * The id the server gave it, once the bytes are there. Set at pick time, never cleared: the send
   * references it instead of pushing the same file a second time.
   */
  mediaId?: string;
  /** Set on a held-mic take, and carried through to the wire so the server applies its policy. */
  audioAsVoice?: boolean;
  durationMs?: number;
}

export interface UploadedAttachment {
  id: string;
  type: AttachmentMeta['type'];
}

/** The server answered and said no. Its own type because a refusal is never worth retrying. */
export class UploadRefused extends Error {
  constructor(readonly status: number, body: string) {
    super(`upload failed: ${body || `HTTP ${status}`}`);
    this.name = 'UploadRefused';
  }
}

/** Long enough for a dead connection to be replaced, short enough to feel like one attempt. */
const RETRY_DELAY_MS = 400;

/**
 * A failure with no answer behind it: the request never reached the server.
 *
 * Retrying that one is the whole point. A browser replays an idempotent request on a connection
 * the other end had closed, but never a POST, so the first upload after an idle tab dies with no
 * response at all while everything else looks healthy. An abort is excluded: something cancelled
 * it on purpose (a reload, a navigation), and repeating it would send what the owner just left.
 */
function isTransportFailure(err: unknown): boolean {
  if (err instanceof UploadRefused) return false;
  const message = err instanceof Error ? err.message : String(err);
  return !/abort/i.test(message);
}

/** An uploaded attachment on its way to the wire, plus what only this device knows about it. */
export interface OutgoingAttachment {
  id: string;
  type: AttachmentMeta['type'];
  /** Local file, kept so the bubble renders before the server copy is reachable. */
  uri?: string;
  filename?: string;
  audioAsVoice?: boolean;
  durationMs?: number;
}

/** One local file on its way to the server's filesystem, as the picker handed it over. */
export interface FsLocalFile {
  /** content:// or file:// — read by the native networking module, never by JS fetch(). */
  uri: string;
  name: string;
  type: string;
}

/** What one uploaded file weighs, as the server wrote it. */
export interface FsUploadedFile {
  name: string;
  size: number;
}

/**
 * Pushes files into a directory of the machine my-claw runs on (`POST /fs/upload`).
 *
 * The transfer is HTTP with the same credential `/app-update/apk` uses -- the `device`/`token`
 * query pair, built by the one function that builds it -- because base64 over the WebSocket is a
 * tax on a phone connection and one frame-size limit away from a corrupt file.
 *
 * The body is multipart, and each part is React Native's `{uri, name, type}` shape: the native
 * networking module opens the `content://` uri through the ContentResolver, so the bytes never
 * cross the JS heap and a file the app cannot read as a `file://` url still uploads. `fetch`
 * (whatwg-fetch over the native XMLHttpRequest) is what carries it; the Content-Type is left to
 * the platform, which is the only side that knows the multipart boundary.
 */
export async function uploadToFs(
  mediaBase: string,
  deviceInfo: DeviceInfo | null,
  dir: string,
  files: FsLocalFile[],
): Promise<{ path: string; files: FsUploadedFile[] }> {
  const query = deviceInfo ? authQuery(deviceInfo) : '';
  const url = `${mediaBase}/fs/upload?path=${encodeURIComponent(dir)}${query ? `&${query}` : ''}`;
  const attempt = async (): Promise<{ path: string; files: FsUploadedFile[] }> => {
    const form = new FormData();
    for (const file of files) {
      // The DOM typings have no shape for a native file part; this is the documented RN one and
      // the cast is only saying so. A string part would be read as the text "[object Object]".
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    }
    const response = await fetch(url, { method: 'POST', body: form });
    if (!response.ok) {
      throw new UploadRefused(response.status, await response.text().catch(() => ''));
    }
    return (await response.json()) as { path: string; files: FsUploadedFile[] };
  };
  try {
    return await attempt();
  } catch (err) {
    // Same one retry as `uploadMedia`, for the same reason: a browser never replays a POST on a
    // connection the other end had closed, and the first upload after an idle tab dies silently.
    if (!isTransportFailure(err)) throw err;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return await attempt();
  }
}

/**
 * Where a file of the machine can be fetched from, credentials and all. Exported because the
 * explorer hands this URL to the same download control as every other surface, so a file has one
 * arrow and one sheet wherever it is tapped (2026-09-26).
 */
export function fsDownloadUrl(mediaBase: string, deviceInfo: DeviceInfo | null, path: string): string {
  const query = deviceInfo ? authQuery(deviceInfo) : '';
  return `${mediaBase}/fs/download?path=${encodeURIComponent(path)}${query ? `&${query}` : ''}`;
}

/**
 * Pushes a local file to the server as raw bytes (the endpoint reads the body as-is), then
 * returns the media id to reference in chat.send.
 *
 * The request is made natively: on Android, fetch() is backed by OkHttp, which rejects any
 * non-http(s) url, so reading a file:// or content:// attachment from JS always fails with
 * "Network request failed". The native side streams the file instead of buffering it.
 */
export async function uploadMedia(
  mediaBase: string,
  deviceInfo: DeviceInfo,
  threadId: string,
  attachment: PendingAttachment,
  onProgress?: (bytes: number, total: number) => void,
): Promise<UploadedAttachment> {
  const query = authQuery(deviceInfo);
  const url = `${mediaBase}/media${query ? `?${query}` : ''}`;
  const transferId = `upload-${attachment.id}`;
  let unsubscribe: (() => void) | undefined;
  if (onProgress) {
    unsubscribe = onTransferProgress(p => {
      if (p.id === transferId && p.total > 0) onProgress(p.bytes, p.total);
    });
  }
  const attempt = async (): Promise<UploadedAttachment> => {
    const response = await deviceBridge.uploadFile(
      attachment.uri,
      url,
      attachment.filename,
      attachment.type,
      threadId,
      transferId,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new UploadRefused(response.status, response.body);
    }
    const meta = JSON.parse(response.body) as { id: string };
    return { id: meta.id, type: attachment.type };
  };
  try {
    try {
      return await attempt();
    } catch (err) {
      if (!isTransportFailure(err)) throw err;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return await attempt();
    }
  } finally {
    unsubscribe?.();
  }
}
