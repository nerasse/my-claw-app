import { useCallback, useSyncExternalStore } from 'react';
import type { AttachmentMeta, HistoryEntry, ToolCallPayload } from './protocol';

export interface TextItem {
  kind: 'text';
  id: string;
  role: 'user' | 'agent';
  text: string;
  attachments: AttachmentMeta[];
  streaming: boolean;
  error?: string;
  /** What the server heard, per recording id, rendered inside each recording's own bubble. */
  transcripts?: Record<string, string>;
  ts: number;
}

export interface ToolItem extends ToolCallPayload {
  kind: 'tool';
  ts: number;
}

export type ChatItem = TextItem | ToolItem;

type Listener = () => void;

/** Frozen so every empty-thread snapshot is the same reference (useSyncExternalStore requirement). */
const EMPTY_ITEMS: ChatItem[] = [];
const EMPTY_THREADS: string[] = [];
Object.freeze(EMPTY_ITEMS);
Object.freeze(EMPTY_THREADS);

function textOf(entry: HistoryEntry): string {
  return entry.role === 'tool' ? '' : entry.text;
}

class ChatStoreImpl {
  private threads = new Map<string, ChatItem[]>();
  private streams = new Map<string, string>();
  private unread = new Set<string>();
  private unreadSnapshot: string[] = EMPTY_THREADS;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getItems(threadId: string): ChatItem[] {
    return this.threads.get(threadId) ?? EMPTY_ITEMS;
  }

  getUnreadThreads(): string[] {
    return this.unreadSnapshot;
  }

  hasThread(threadId: string): boolean {
    return this.threads.has(threadId);
  }

  isUnread(threadId: string): boolean {
    return this.unread.has(threadId);
  }

  markUnread(threadId: string): void {
    if (this.unread.has(threadId)) return;
    this.unread.add(threadId);
    this.refreshUnread();
  }

  markRead(threadId: string): void {
    if (!this.unread.delete(threadId)) return;
    this.refreshUnread();
  }

  /**
   * Server history replaces what is on screen: a bubble rendered by an older build must not
   * survive a reopen. Local items win only while a run streams into the thread, or when the
   * server has nothing yet (turn not persisted).
   */
  seedHistory(threadId: string, entries: HistoryEntry[]): void {
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    if (existing.some(item => item.kind === 'text' && item.streaming)) return;
    if (entries.length === 0) return;

    const items: ChatItem[] = entries.map((entry, index) => {
      const ts = new Date(entry.ts).getTime() || Date.now() + index;
      if (entry.role === 'tool') {
        return {
          kind: 'tool',
          id: entry.id,
          name: entry.name,
          args: entry.args,
          durationMs: entry.durationMs,
          ok: entry.ok,
          output: entry.output,
          truncated: entry.truncated,
          ts,
        };
      }
      return {
        kind: 'text',
        id: entry.id,
        role: entry.role === 'user' ? 'user' : 'agent',
        text: textOf(entry),
        attachments: entry.attachments ?? [],
        streaming: false,
        ...(entry.transcripts ? { transcripts: entry.transcripts } : {}),
        ts,
      };
    });
    this.threads.set(threadId, items);
    this.emit();
  }

  addUserMessage(threadId: string, id: string, text: string, attachments: AttachmentMeta[] = []): void {
    this.append(threadId, { kind: 'text', id, role: 'user', text, attachments, streaming: false, ts: Date.now() });
  }

  /**
   * Lands the transcript on the bubble that carried the recording. Ignored when the bubble is
   * gone (thread cleared, app restarted mid-run): the words belong to that turn or to nothing.
   */
  setTranscripts(threadId: string, id: string, items: Array<{ id: string; text: string }>): void {
    const current = this.getItems(threadId).find(item => item.id === id);
    if (!current || current.kind !== 'text') return;
    const transcripts = { ...current.transcripts };
    for (const item of items) transcripts[item.id] = item.text;
    this.patch(threadId, id, { transcripts });
  }

  /** The native outbox could neither send nor queue the frame: say so on the bubble. */
  markSendFailed(threadId: string, id: string, error = 'not sent'): void {
    this.patch(threadId, id, { error });
  }

  startStream(threadId: string, id: string, replyToId?: string): void {
    if (this.streams.has(id)) return;
    this.streams.set(id, '');
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'agent',
      text: '',
      attachments: [],
      streaming: true,
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  appendDelta(threadId: string, id: string, text: string): void {
    const current = this.streams.get(id);
    if (current === undefined) return;
    this.streams.set(id, current + text);
    this.patch(threadId, id, { text: current + text });
  }

  endStream(threadId: string, id: string): void {
    if (!this.streams.has(id)) return;
    const finalText = this.streams.get(id) ?? '';
    this.streams.delete(id);
    if (!finalText.trim()) {
      this.removeItem(threadId, id);
      return;
    }
    this.patch(threadId, id, { text: finalText, streaming: false });
  }

  abortStream(threadId: string, id: string, error?: string): void {
    if (!this.streams.has(id)) {
      this.append(threadId, {
        kind: 'text',
        id,
        role: 'agent',
        text: '',
        attachments: [],
        streaming: false,
        error: error ?? 'interrupted',
        ts: Date.now(),
      });
      return;
    }
    this.streams.delete(id);
    this.patch(threadId, id, { streaming: false, error });
  }

  addAgentMessage(threadId: string, id: string, text: string, attachments: AttachmentMeta[], replyToId?: string): void {
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'agent',
      text,
      attachments,
      streaming: false,
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  addToolCall(threadId: string, payload: ToolCallPayload): void {
    if (this.getItems(threadId).some(item => item.id === payload.id)) return;
    this.append(threadId, { kind: 'tool', ...payload, ts: Date.now() });
  }

  clearThread(threadId: string): void {
    this.threads.delete(threadId);
    if (this.unread.delete(threadId)) this.refreshUnread();
    this.emit();
  }

  clearAll(): void {
    this.threads.clear();
    this.streams.clear();
    this.unread.clear();
    this.unreadSnapshot = EMPTY_THREADS;
    this.emit();
  }

  private refreshUnread(): void {
    this.unreadSnapshot = this.unread.size === 0 ? EMPTY_THREADS : [...this.unread];
    this.emit();
  }

  private append(threadId: string, item: ChatItem): void {
    const items = this.threads.get(threadId) ?? EMPTY_ITEMS;
    this.threads.set(threadId, [...items, item]);
    this.emit();
  }

  private patch(threadId: string, id: string, patch: Partial<TextItem>): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    this.threads.set(
      threadId,
      items.map(item => (item.id === id && item.kind === 'text' ? { ...item, ...patch } : item)),
    );
    this.emit();
  }

  private removeItem(threadId: string, id: string): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    this.threads.set(
      threadId,
      items.filter(item => item.id !== id),
    );
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const chatStore = new ChatStoreImpl();

const subscribeToChat = (listener: Listener): (() => void) => chatStore.subscribe(listener);

export function useChatItems(threadId: string | null): ChatItem[] {
  const snapshot = useCallback(() => (threadId ? chatStore.getItems(threadId) : EMPTY_ITEMS), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

export function useUnreadThreads(): string[] {
  return useSyncExternalStore(subscribeToChat, () => chatStore.getUnreadThreads());
}
