export interface AttachmentMeta {
  id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  mimeType?: string;
  filename?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  audioAsVoice?: boolean;
}

export interface ChatMessageFrame {
  type: 'chat.message';
  id: string;
  text: string;
  attachments: AttachmentMeta[];
  replyToId?: string;
  ts?: string;
}

export interface StreamStartFrame {
  type: 'chat.stream.start';
  id: string;
  replyToId?: string;
  ts?: string;
}

export interface StreamDeltaFrame {
  type: 'chat.stream.delta';
  id: string;
  text: string;
}

export interface StreamDoneFrame {
  type: 'chat.stream.done';
  id: string;
}

export interface StreamAbortFrame {
  type: 'chat.stream.abort';
  id: string;
  error?: string;
}

export interface ApprovalRequestFrame {
  type: 'approval.request';
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  replyToId?: string;
  expiresAt: number;
}

export interface ErrorFrame {
  type: 'error';
  message: string;
}

export type ServerFrame =
  | ChatMessageFrame
  | StreamStartFrame
  | StreamDeltaFrame
  | StreamDoneFrame
  | StreamAbortFrame
  | ApprovalRequestFrame
  | ErrorFrame;

const FRAME_TYPES = new Set(['chat.message', 'chat.stream.start', 'chat.stream.delta', 'chat.stream.done', 'chat.stream.abort', 'approval.request', 'error']);

export function parseServerFrame(raw: string): ServerFrame | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    if (!FRAME_TYPES.has(parsed.type)) {
      return null;
    }
    return parsed as ServerFrame;
  } catch {
    return null;
  }
}

export function encodeChatSend(id: string, text: string): string {
  return JSON.stringify({ type: 'chat.send', id, text });
}

export function encodeApprovalResponse(id: string, accepted: boolean): string {
  return JSON.stringify({ type: 'approval.response', id, accepted });
}
