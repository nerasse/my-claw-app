import { useSyncExternalStore } from 'react';
import type { FolderSummary, SessionSummary } from './protocol';

type Listener = () => void;

const EMPTY: SessionSummary[] = [];
Object.freeze(EMPTY);

const NO_FOLDERS: FolderSummary[] = [];
Object.freeze(NO_FOLDERS);

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
  private folders: FolderSummary[] = NO_FOLDERS;
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

  getFoldersSnapshot(): FolderSummary[] {
    return this.folders;
  }

  titleOf(threadId: string): string | undefined {
    return this.list.find(summary => summary.threadId === threadId)?.title;
  }

  has(threadId: string): boolean {
    return this.list.some(summary => summary.threadId === threadId);
  }

  /**
   * The listing, both halves at once: the server sends the folders with the conversations, and two
   * separate stores would let a drawer render rows into a folder that no longer exists.
   */
  replace(sessions: SessionSummary[], folders: FolderSummary[] = NO_FOLDERS): void {
    this.list = sessions.length === 0 ? EMPTY : sessions;
    this.folders = folders.length === 0 ? NO_FOLDERS : folders;
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

  /**
   * A message was just sent into this thread, from here or mirrored from another window: it goes to
   * the top of the list, which is the order the server sorts on. Listed if it was not yet.
   */
  touch(threadId: string, sampleText: string): void {
    const now = new Date().toISOString();
    const existing = this.list.find(summary => summary.threadId === threadId);
    const touched: SessionSummary = existing
      ? { ...existing, lastMessageAt: now }
      : { threadId, title: titleFromText(sampleText), messageCount: 0, createdAt: now, lastActiveAt: now, lastMessageAt: now };
    this.list = [touched, ...this.list.filter(summary => summary.threadId !== threadId)];
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

  /**
   * Local echo of folder.order until the listing lands with the server's own ranks: the folders
   * move under the finger, and a folder that waits for a round trip reads as dropped on the floor.
   * Renumbered densely, which is what the server stores.
   */
  setFolderOrder(order: string[]): void {
    const rank = new Map(order.map((id, index) => [id, index]));
    const sorted = [...this.folders].sort(
      (left, right) => (rank.get(left.id) ?? left.rank) - (rank.get(right.id) ?? right.rank),
    );
    this.folders = sorted.map((folder, index) => ({ ...folder, rank: index }));
    this.emit();
  }

  /** Local echo of session.folder until the server's listing lands and brings the real one. */
  setFolder(threadId: string, folderId: string | null): void {
    const existing = this.list.find(summary => summary.threadId === threadId);
    if (!existing || (existing.folderId ?? null) === folderId) return;
    this.list = this.list.map(summary => {
      if (summary.threadId !== threadId) return summary;
      // Cleared, not set to a value: an unfiled conversation carries no folder at all, which is
      // what the listing sends, and a key holding `undefined` reads the same to the sections.
      return { ...summary, folderId: folderId ?? undefined };
    });
    this.emit();
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

export function useFolders(): FolderSummary[] {
  return useSyncExternalStore(subscribeToSessions, () => sessionStore.getFoldersSnapshot());
}
