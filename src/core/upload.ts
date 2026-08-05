import type { AttachmentMeta } from './protocol';
import type { DeviceInfo } from './device';

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
 * returns the media id to reference in chat.send. Reads the local uri into a Blob first:
 * RN fetch can fetch file:// uris, and the Blob is the raw payload.
 */
export async function uploadMedia(
  mediaBase: string,
  deviceInfo: DeviceInfo,
  threadId: string,
  attachment: PendingAttachment,
): Promise<UploadedAttachment> {
  const local = await fetch(attachment.uri);
  const blob = await local.blob();
  const url = `${mediaBase}/media?device=${encodeURIComponent(deviceInfo.deviceId)}&token=${encodeURIComponent(deviceInfo.token)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-filename': attachment.filename,
      'x-type': attachment.type,
      'x-thread-id': threadId,
    },
    body: blob,
  });
  if (!response.ok) {
    const reason = (await response.text().catch(() => '')) || `HTTP ${response.status}`;
    throw new Error(`upload failed: ${reason}`);
  }
  const meta = (await response.json()) as { id: string };
  return { id: meta.id, type: attachment.type };
}
