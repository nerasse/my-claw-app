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
  const url = `${mediaBase}/media?device=${encodeURIComponent(deviceInfo.deviceId)}&token=${encodeURIComponent(deviceInfo.token)}`;
  const transferId = `upload-${attachment.id}`;
  let unsubscribe: (() => void) | undefined;
  if (onProgress) {
    unsubscribe = onTransferProgress(p => {
      if (p.id === transferId && p.total > 0) onProgress(p.bytes, p.total);
    });
  }
  try {
    const response = await deviceBridge.uploadFile(
      attachment.uri,
      url,
      attachment.filename,
      attachment.type,
      threadId,
      transferId,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`upload failed: ${response.body || `HTTP ${response.status}`}`);
    }
    const meta = JSON.parse(response.body) as { id: string };
    return { id: meta.id, type: attachment.type };
  } finally {
    unsubscribe?.();
  }
}
