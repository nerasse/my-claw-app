import type { AttachmentMeta } from './protocol';
import type { DeviceInfo } from './device';
import { deviceBridge } from './nativeBridge';

export interface PendingAttachment {
  id: string;
  uri: string;
  filename: string;
  type: AttachmentMeta['type'];
  mimeType: string;
  sizeBytes?: number;
}

export interface UploadedAttachment {
  id: string;
  type: AttachmentMeta['type'];
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
): Promise<UploadedAttachment> {
  const url = `${mediaBase}/media?device=${encodeURIComponent(deviceInfo.deviceId)}&token=${encodeURIComponent(deviceInfo.token)}`;
  const response = await deviceBridge.uploadFile(
    attachment.uri,
    url,
    attachment.filename,
    attachment.type,
    threadId,
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`upload failed: ${response.body || `HTTP ${response.status}`}`);
  }
  const meta = JSON.parse(response.body) as { id: string };
  return { id: meta.id, type: attachment.type };
}
