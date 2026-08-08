import { useSyncExternalStore } from 'react';
import type { TagInfo } from './protocol';

type Listener = () => void;

export type TagsStatus = 'unknown' | 'ready' | 'unsupported';

interface TagsState {
  status: TagsStatus;
  tags: TagInfo[] | null;
  error: string | null;
}

const EMPTY: TagsState = { status: 'unknown', tags: null, error: null };

/**
 * The tag catalog (docs/tags.md on the server), mirrored like the agents store: the server owns
 * the truth, this store only renders what `tags.result` frames say. `unsupported` means the
 * server never answered (a server that predates the tags frames drops them silently).
 */
class TagsStoreImpl {
  private state: TagsState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): TagsState {
    return this.state;
  }

  /** Drops everything. Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  request(): void {
    this.state = { ...this.state, status: 'unknown', error: null };
    this.emit();
  }

  receive(tags: TagInfo[]): void {
    this.state = { status: 'ready', tags, error: null };
    this.emit();
  }

  markUnsupported(): void {
    if (this.state.status === 'ready') return;
    this.state = { status: 'unsupported', tags: null, error: null };
    this.emit();
  }

  fail(message: string): void {
    this.state = { ...this.state, error: message };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const tagsStore = new TagsStoreImpl();

const subscribeToTags = (listener: Listener): (() => void) => tagsStore.subscribe(listener);

export function useTags(): TagsState {
  return useSyncExternalStore(subscribeToTags, () => tagsStore.getSnapshot());
}
