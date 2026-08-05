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
  threadId: string;
  attachments: AttachmentMeta[];
  replyToId?: string;
  ts?: string;
}

export interface StreamStartFrame {
  type: 'chat.stream.start';
  id: string;
  threadId: string;
  replyToId?: string;
  ts?: string;
}

export interface StreamDeltaFrame {
  type: 'chat.stream.delta';
  id: string;
  threadId: string;
  text: string;
}

export interface StreamDoneFrame {
  type: 'chat.stream.done';
  id: string;
  threadId: string;
}

export interface StreamAbortFrame {
  type: 'chat.stream.abort';
  id: string;
  threadId: string;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}

export interface ChatHistoryFrame {
  type: 'chat.history';
  threadId: string;
  messages: HistoryEntry[];
}

export interface SessionSummary {
  threadId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  lastActiveAt: string;
}

export interface SessionListResultFrame {
  type: 'session.list.result';
  sessions: SessionSummary[];
}

export interface ApprovalRequestFrame {
  type: 'approval.request';
  id: string;
  threadId: string;
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
  | ChatHistoryFrame
  | SessionListResultFrame
  | ApprovalRequestFrame
  | ErrorFrame;

const FRAME_TYPES = new Set([
  'chat.message',
  'chat.stream.start',
  'chat.stream.delta',
  'chat.stream.done',
  'chat.stream.abort',
  'chat.history',
  'session.list.result',
  'approval.request',
  'error',
]);

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

export function encodeChatSend(id: string, text: string, threadId: string): string {
  return JSON.stringify({ type: 'chat.send', id, text, threadId });
}

export function encodeSessionList(): string {
  return JSON.stringify({ type: 'session.list' });
}

export function encodeSessionHistory(threadId: string, limit = 50): string {
  return JSON.stringify({ type: 'session.history', threadId, limit });
}

export function encodeSessionArchive(threadId: string): string {
  return JSON.stringify({ type: 'session.archive', threadId });
}

export function encodeSessionDelete(threadId: string): string {
  return JSON.stringify({ type: 'session.delete', threadId });
}

export function encodeApprovalResponse(id: string, accepted: boolean): string {
  return JSON.stringify({ type: 'approval.response', id, accepted });
}
