import type { AttachmentMeta } from './protocol';

export interface ChatItem {
  id: string;
  role: 'user' | 'agent';
  text: string;
  attachments: AttachmentMeta[];
  streaming: boolean;
  error?: string;
  ts: number;
}

export interface ThreadMeta {
  threadId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  lastActiveAt: string;
}

type Listener = () => void;

class ChatStoreImpl {
  private threads = new Map<string, ChatItem[]>();
  private streams = new Map<string, string>();
  private unread = new Set<string>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getItems(threadId: string): ChatItem[] {
    return this.threads.get(threadId) ?? [];
  }

  hasThread(threadId: string): boolean {
    return this.threads.has(threadId);
  }

  isUnread(threadId: string): boolean {
    return this.unread.has(threadId);
  }

  markRead(threadId: string): void {
    if (!this.unread.delete(threadId)) return;
    this.emit();
  }

  seedHistory(threadId: string, messages: Array<{ id: string; role: 'user' | 'assistant'; text: string; ts: string }>): void {
    const existing = this.threads.get(threadId) ?? [];
    if (existing.length > 0) return;
    const items: ChatItem[] = messages.map(msg => ({
      id: msg.id,
      role: msg.role === 'user' ? 'user' : 'agent',
      text: msg.text,
      attachments: [],
      streaming: false,
      ts: new Date(msg.ts).getTime() || Date.now(),
    }));
    if (items.length > 0) {
      this.threads.set(threadId, items);
      this.emit();
    }
  }

  addUserMessage(threadId: string, id: string, text: string): void {
    this.append(threadId, { id, role: 'user', text, attachments: [], streaming: false, ts: Date.now() });
  }

  startStream(threadId: string, id: string, replyToId?: string): void {
    if (this.streams.has(id)) return;
    this.streams.set(id, '');
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
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
    this.patch(threadId, id, { text: finalText, streaming: false });
  }

  abortStream(threadId: string, id: string, error?: string): void {
    if (!this.streams.has(id)) return;
    this.streams.delete(id);
    this.patch(threadId, id, { streaming: false, error });
  }

  addAgentMessage(threadId: string, id: string, text: string, attachments: AttachmentMeta[], replyToId?: string): void {
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
      id,
      role: 'agent',
      text,
      attachments,
      streaming: false,
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  clearThread(threadId: string): void {
    this.threads.delete(threadId);
    this.unread.delete(threadId);
    this.emit();
  }

  clearAll(): void {
    this.threads.clear();
    this.streams.clear();
    this.unread.clear();
    this.emit();
  }

  private append(threadId: string, item: ChatItem): void {
    const items = this.threads.get(threadId) ?? [];
    this.threads.set(threadId, [...items, item]);
    this.emit();
  }

  private patch(threadId: string, id: string, patch: Partial<ChatItem>): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    this.threads.set(threadId, items.map(item => (item.id === id ? { ...item, ...patch } : item)));
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const chatStore = new ChatStoreImpl();
