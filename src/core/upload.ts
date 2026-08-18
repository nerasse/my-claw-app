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
