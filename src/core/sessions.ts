import { useSyncExternalStore } from 'react';
import type { SessionSummary } from './protocol';

type Listener = () => void;

const EMPTY: SessionSummary[] = [];
Object.freeze(EMPTY);

function titleFromText(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean ? clean.slice(0, 60) : '(new conversation)';
}

/**
 * Conversation list, kept apart from the chat items so the drawer re-renders on its own.
 * The server owns the real list; local mutations only bridge the gap until the next refresh.
 */
class SessionStoreImpl {
  private list: SessionSummary[] = EMPTY;
  private active: SessionSummary[] = EMPTY;
  private archived: SessionSummary[] = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Both halves are split once per update, not per render: useSyncExternalStore compares
   * snapshots by identity, so filtering inside the hook would loop forever on a new array.
   */
  getActiveSnapshot(): SessionSummary[] {
    return this.active;
  }

  getArchivedSnapshot(): SessionSummary[] {
    return this.archived;
  }

  titleOf(threadId: string): string | undefined {
    return this.list.find(summary => summary.threadId === threadId)?.title;
  }

  has(threadId: string): boolean {
    return this.list.some(summary => summary.threadId === threadId);
  }

  replace(sessions: SessionSummary[]): void {
    this.list = sessions.length === 0 ? EMPTY : sessions;
    this.emit();
  }

  /** A thread the server has not listed yet (just created, or activity while offline). */
  ensure(threadId: string, sampleText: string): void {
    if (this.list.some(summary => summary.threadId === threadId)) return;
    const now = new Date().toISOString();
    this.list = [
      { threadId, title: titleFromText(sampleText), messageCount: 0, createdAt: now, lastActiveAt: now },
      ...this.list,
    ];
    this.emit();
  }

  remove(threadId: string): void {
    const next = this.list.filter(summary => summary.threadId !== threadId);
    if (next.length === this.list.length) return;
    this.list = next.length === 0 ? EMPTY : next;
    this.emit();
  }

  workspaceOf(threadId: string): string | undefined {
    return this.list.find(summary => summary.threadId === threadId)?.workspace;
  }

  /** Local echo of session.workspace.set until the server's result lands and refreshes. */
  setWorkspace(threadId: string, workspace: string): void {
    const existing = this.list.find(summary => summary.threadId === threadId);
    if (!existing || existing.workspace === workspace) return;
    this.list = this.list.map(summary =>
      summary.threadId === threadId ? { ...summary, workspace } : summary,
    );
    this.emit();
  }

  private emit(): void {
    const active = this.list.filter(summary => !summary.archived);
    const archived = this.list.filter(summary => summary.archived);
    this.active = active.length === 0 ? EMPTY : active;
    this.archived = archived.length === 0 ? EMPTY : archived;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const sessionStore = new SessionStoreImpl();

const subscribeToSessions = (listener: Listener): (() => void) => sessionStore.subscribe(listener);

export function useSessions(): SessionSummary[] {
  return useSyncExternalStore(subscribeToSessions, () => sessionStore.getActiveSnapshot());
}

export function useArchivedSessions(): SessionSummary[] {
  return useSyncExternalStore(subscribeToSessions, () => sessionStore.getArchivedSnapshot());
}
