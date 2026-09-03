/**
 * The questions waiting for an answer, and the answers being composed.
 *
 * Outside React on purpose. The form is drawn inside the conversation, so its rows are unmounted
 * by the list as soon as they scroll off, and the whole point of asking in the chat is that the
 * owner goes and reads something before answering -- another thread, a file, the tool output
 * above. State held by the card would be lost by exactly the navigation the card exists to allow.
 *
 * The pending set is replaced wholesale by `question.pending` at every connect (the server's
 * authoritative list) and patched by the live `question.ask` / `question.resolved` frames. Drafts
 * survive that replacement for the questions that are still pending: a reconnect must not throw
 * away half a typed answer.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { QuestionAskFrame } from './protocol';

/** What the owner has picked so far for one ask, before it is sent. */
export interface QuestionDraft {
  /** Selected labels per question, indexed like `questions`. */
  answers: string[][];
  /** Free-form text per question, whether or not it has been picked. */
  custom: string[];
  /** Which questions have their custom field open. */
  editing: boolean[];
  /**
   * The page of the form being shown: question `n`, then the recap at `questions.length`.
   *
   * Here rather than in the card for the same reason as the answers. The list unmounts a row
   * that scrolls off, and going to read something before answering is the whole point of asking
   * in the conversation: a page held in the component sends the owner back to question 1 every
   * time he looks away.
   */
  page: number;
  /** A reply is in flight: the card is read-only until the resolve lands. */
  submitting: boolean;
}

type Listener = () => void;

const EMPTY_ASKS: QuestionAskFrame[] = [];
const EMPTY_THREADS: string[] = [];

/**
 * The draft of an ask nothing has been picked for yet. One frozen instance, never rebuilt:
 * `getSnapshot` must return the same reference until something changes, and a fresh object per
 * call is an infinite render loop in useSyncExternalStore.
 */
export const EMPTY_DRAFT: QuestionDraft = Object.freeze({
  answers: Object.freeze([]) as unknown as string[][],
  custom: Object.freeze([]) as unknown as string[],
  editing: Object.freeze([]) as unknown as boolean[],
  page: 0,
  submitting: false,
}) as QuestionDraft;

class QuestionStoreImpl {
  /** Pending asks in arrival order; one per blocked tool call. */
  private asks: QuestionAskFrame[] = [];
  private drafts = new Map<string, QuestionDraft>();
  /** Rebuilt on change only, so a subscriber keyed on it does not re-render on every frame. */
  private threadsSnapshot: string[] = EMPTY_THREADS;
  private byThread = new Map<string, QuestionAskFrame[]>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A question arrived. The same id twice is the journal replaying it: keep the first. */
  ask(frame: QuestionAskFrame): void {
    if (this.asks.some(entry => entry.id === frame.id)) return;
    this.asks = [...this.asks, frame];
    this.reindex();
  }

  /**
   * The server's whole pending list, which wins over what this client believes: an ask pushed
   * while the socket was down is gained here, and a question the client kept from a dead run is
   * dropped. Drafts of the surviving ids are kept.
   */
  reset(entries: Omit<QuestionAskFrame, 'type'>[]): void {
    this.asks = entries.map(entry => ({ type: 'question.ask' as const, ...entry }));
    const alive = new Set(this.asks.map(entry => entry.id));
    for (const id of [...this.drafts.keys()]) if (!alive.has(id)) this.drafts.delete(id);
    this.reindex();
  }

  /** Answered here, answered on another surface, canceled, or the run went away. */
  resolve(id: string): void {
    if (!this.asks.some(entry => entry.id === id)) return;
    this.asks = this.asks.filter(entry => entry.id !== id);
    this.drafts.delete(id);
    this.reindex();
  }

  clear(): void {
    if (this.asks.length === 0 && this.drafts.size === 0) return;
    this.asks = [];
    this.drafts.clear();
    this.reindex();
  }

  all(): QuestionAskFrame[] {
    return this.asks;
  }

  /** The asks of one conversation, same identity as long as nothing changed. */
  forThread(threadId: string): QuestionAskFrame[] {
    return this.byThread.get(threadId) ?? EMPTY_ASKS;
  }

  /** Conversations holding at least one pending question, for the badge in the thread list. */
  threads(): string[] {
    return this.threadsSnapshot;
  }

  draft(id: string): QuestionDraft {
    return this.drafts.get(id) ?? EMPTY_DRAFT;
  }

  /** Applies a pure transition to one ask's draft. A no-op transition emits nothing. */
  patch(id: string, next: (draft: QuestionDraft) => QuestionDraft): void {
    if (!this.asks.some(entry => entry.id === id)) return;
    const current = this.draft(id);
    const updated = next(current);
    if (updated === current) return;
    this.drafts.set(id, updated);
    this.emit();
  }

  private reindex(): void {
    const byThread = new Map<string, QuestionAskFrame[]>();
    for (const ask of this.asks) {
      const list = byThread.get(ask.threadId);
      if (list) list.push(ask);
      else byThread.set(ask.threadId, [ask]);
    }
    this.byThread = byThread;
    this.threadsSnapshot = byThread.size === 0 ? EMPTY_THREADS : [...byThread.keys()];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const questionStore = new QuestionStoreImpl();

const subscribeToQuestions = (listener: Listener): (() => void) => questionStore.subscribe(listener);

/** The pending asks of one conversation. */
export function useThreadQuestions(threadId: string | null): QuestionAskFrame[] {
  const snapshot = useCallback(
    () => (threadId ? questionStore.forThread(threadId) : EMPTY_ASKS),
    [threadId],
  );
  return useSyncExternalStore(subscribeToQuestions, snapshot);
}

/** Conversations with a question waiting, for the thread list badge. */
export function useQuestionThreads(): string[] {
  return useSyncExternalStore(subscribeToQuestions, () => questionStore.threads());
}

/** The answers being composed for one ask. */
export function useQuestionDraft(id: string): QuestionDraft {
  const snapshot = useCallback(() => questionStore.draft(id), [id]);
  return useSyncExternalStore(subscribeToQuestions, snapshot);
}
