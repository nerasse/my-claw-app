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

type Listener = () => void;

class ChatStoreImpl {
  private items: ChatItem[] = [];
  private listeners = new Set<Listener>();
  private streams = new Map<string, string>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getItems(): ChatItem[] {
    return this.items;
  }

  addUserMessage(id: string, text: string): void {
    this.items = [...this.items, { id, role: 'user', text, attachments: [], streaming: false, ts: Date.now() }];
    this.emit();
  }

  startStream(id: string, replyToId?: string): void {
    if (this.streams.has(id)) return;
    this.streams.set(id, '');
    const parent = replyToId ? this.items.find(item => item.id === replyToId) : undefined;
    const agentItem: ChatItem = {
      id,
      role: 'agent',
      text: '',
      attachments: [],
      streaming: true,
      ts: parent ? parent.ts + 1 : Date.now(),
    };
    this.items = [...this.items, agentItem];
    this.emit();
  }

  appendDelta(id: string, text: string): void {
    const current = this.streams.get(id);
    if (current === undefined) return;
    this.streams.set(id, current + text);
    this.patch(id, { text: current + text });
  }

  endStream(id: string): void {
    if (!this.streams.has(id)) return;
    const finalText = this.streams.get(id) ?? '';
    this.streams.delete(id);
    this.patch(id, { text: finalText, streaming: false });
  }

  abortStream(id: string, error?: string): void {
    if (!this.streams.has(id)) return;
    this.streams.delete(id);
    this.patch(id, { streaming: false, error });
  }

  addAgentMessage(id: string, text: string, attachments: AttachmentMeta[], replyToId?: string): void {
    const parent = replyToId ? this.items.find(item => item.id === replyToId) : undefined;
    this.items = [
      ...this.items,
      {
        id,
        role: 'agent',
        text,
        attachments,
        streaming: false,
        ts: parent ? parent.ts + 1 : Date.now(),
      },
    ];
    this.emit();
  }

  clear(): void {
    this.items = [];
    this.streams.clear();
    this.emit();
  }

  private patch(id: string, patch: Partial<ChatItem>): void {
    this.items = this.items.map(item => (item.id === id ? { ...item, ...patch } : item));
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const chatStore = new ChatStoreImpl();
