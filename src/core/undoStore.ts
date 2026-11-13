/**
 * The undo sheet's pending prompt, and the mode the owner picked.
 *
 * Outside React, like questionStore: the sheet can be open while the owner scrolls the
 * conversation, and what decides whether the command runs is a single choice, not UI state.
 * The prompt arrives on `undo.prompt` (from a `/undo` without an argument), the choice is sent
 * back as `undo.choose`, and `undo.resolved` closes the sheet wherever it is displayed.
 */

import { useSyncExternalStore } from 'react';
import type { UndoListFrame, UndoPromptFrame } from './protocol';

export type UndoMode = 'soft' | 'hard';

/**
 * The turn picker's pending prompt, and the row the owner picked on this device.
 *
 * A second array rather than a variant of UndoPrompt: the two sheets can be open on different
 * threads at once (a `/undo list` here, a bare `/undo` there), and folding them into one list
 * would make each one's `all()` have to filter the other's shape out.
 */
export interface UndoPick extends UndoListFrame {
  /** The row this device pressed, sent back at once. */
  picked?: { n: number; mode: UndoMode };
}

export interface UndoPrompt extends UndoPromptFrame {
  /** The mode picked on this device, sent back as soon as the sheet row is pressed. */
  mode?: UndoMode;
}

type Listener = () => void;

const EMPTY: UndoPrompt[] = [];

class UndoStoreImpl {
  private prompts: UndoPrompt[] = [];
  private picks: UndoPick[] = [];
  private byThread = new Map<string, UndoPrompt[]>();
  private picksByThread = new Map<string, UndoPick[]>();
  private threadsSnapshot: string[] = [];
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The server asks which mode. The same id twice is a replay: keep the first. */
  prompt(frame: UndoPromptFrame): void {
    if (this.prompts.some(entry => entry.id === frame.id)) return;
    this.prompts = [...this.prompts, { ...frame }];
    this.reindex();
  }

  /** Answered here, on another surface, or the command gave up (server restart). */
  resolve(id: string): void {
    const hadPrompt = this.prompts.some(entry => entry.id === id);
    const hadPick = this.picks.some(entry => entry.id === id);
    if (!hadPrompt && !hadPick) return;
    this.prompts = this.prompts.filter(entry => entry.id !== id);
    this.picks = this.picks.filter(entry => entry.id !== id);
    this.reindex();
  }

  /** The turn picker is open on this thread: the last turns, each with the mode it allows. */
  list(frame: UndoListFrame): void {
    if (this.picks.some(entry => entry.id === frame.id)) return;
    this.picks = [...this.picks, { ...frame }];
    this.reindex();
  }

  /** The row picked on this device; the sheet waits for `undo.resolved` to close. */
  pick(id: string, n: number, mode: UndoMode): void {
    const entry = this.picks.find(p => p.id === id);
    if (!entry) return;
    entry.picked = { n, mode };
    this.reindex();
  }

  /** The open turn picker of one conversation, if any. */
  pickForThread(threadId: string): UndoPick | undefined {
    return this.picksByThread.get(threadId)?.[0];
  }

  /** The mode chosen on this device; the sheet waits for `undo.resolved` to close. */
  choose(id: string, mode: UndoMode): void {
    const entry = this.prompts.find(p => p.id === id);
    if (!entry) return;
    entry.mode = mode;
    this.reindex();
  }

  all(): UndoPrompt[] {
    return this.prompts;
  }

  /** The prompts of one conversation, same identity as long as nothing changed. */
  forThread(threadId: string): UndoPrompt[] {
    return this.byThread.get(threadId) ?? EMPTY;
  }

  /** Conversations holding an open undo prompt, for the badge in the thread list. */
  threads(): string[] {
    return this.threadsSnapshot;
  }

  /** What the sheet on this device should send back for one prompt, if the owner picked. */
  choice(id: string): UndoMode | undefined {
    return this.prompts.find(p => p.id === id)?.mode;
  }

  clear(): void {
    if (this.prompts.length === 0 && this.picks.length === 0) return;
    this.prompts = [];
    this.picks = [];
    this.reindex();
  }

  private reindex(): void {
    const byThread = new Map<string, UndoPrompt[]>();
    for (const prompt of this.prompts) {
      const list = byThread.get(prompt.threadId) ?? [];
      list.push(prompt);
      byThread.set(prompt.threadId, list);
    }
    const picks = new Map<string, UndoPick[]>();
    for (const pick of this.picks) {
      const list = picks.get(pick.threadId) ?? [];
      list.push(pick);
      picks.set(pick.threadId, list);
    }
    this.byThread = byThread;
    this.picksByThread = picks;
    this.threadsSnapshot = [...new Set([...byThread.keys(), ...picks.keys()])];
    for (const listener of this.listeners) listener();
  }
}

export const undoStore = new UndoStoreImpl();

/** Subscribe to the store from a component: re-renders on every change. */
export function useUndoStore(): UndoStoreImpl {
  return useSyncExternalStore(
    cb => undoStore.subscribe(cb),
    () => undoStore,
    () => undoStore,
  );
}

/** The undo prompts of the thread on screen, for the sheet. */
export function useUndoPrompts(threadId: string | null): UndoPrompt[] {
  return useSyncExternalStore(
    cb => undoStore.subscribe(cb),
    () => (threadId ? undoStore.forThread(threadId) : EMPTY),
    () => (threadId ? undoStore.forThread(threadId) : EMPTY),
  );
}

/** The open turn picker of the thread on screen, for its sheet. */
export function useUndoPick(threadId: string | null): UndoPick | undefined {
  return useSyncExternalStore(
    cb => undoStore.subscribe(cb),
    () => (threadId ? undoStore.pickForThread(threadId) : undefined),
    () => (threadId ? undoStore.pickForThread(threadId) : undefined),
  );
}
