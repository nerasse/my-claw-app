import { useCallback, useSyncExternalStore } from 'react';
import type { ContextState, EffortState, ModelListResultFrame, ModelResultFrame } from './protocol';

type Listener = () => void;

const EMPTY: ModelListResultFrame = { type: 'model.list.result', models: [], defaultModel: '' };
Object.freeze(EMPTY);

const NO_EFFORT: EffortState = { level: '', levels: [], supported: false };

interface ThreadModel {
  /** What runs on the thread now: the override, or the configured default. */
  model: string;
  defaultModel: string;
  effort: EffortState;
  /** Absent on a server that predates the context step: the picker then skips it. */
  context?: ContextState;
}

/**
 * Model state of the open threads. The server owns the truth; this store only mirrors what
 * `model.list.result` and `model.result` frames say, so the picker never shows a choice that
 * disagrees with what the server will actually run.
 */
class ModelStoreImpl {
  private catalog: ModelListResultFrame = EMPTY;
  private perThread = new Map<string, ThreadModel>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ModelListResultFrame {
    return this.catalog;
  }

  catalogModel(id: string): string {
    return this.catalog.models.find(model => model.id === id)?.label ?? id;
  }

  threadModel(threadId: string | null): ThreadModel | null {
    if (!threadId) return null;
    return this.perThread.get(threadId) ?? null;
  }

  labelOf(threadId: string | null): string | undefined {
    const entry = this.threadModel(threadId);
    if (!entry) return undefined;
    return this.catalogModel(entry.model);
  }

  replaceCatalog(frame: ModelListResultFrame): void {
    this.catalog = frame;
    this.emit();
  }

  replaceThread(frame: ModelResultFrame): void {
    this.perThread.set(frame.threadId, {
      model: frame.model,
      defaultModel: frame.defaultModel,
      effort: frame.effort ?? NO_EFFORT,
      ...(frame.context === undefined ? {} : { context: frame.context }),
    });
    this.emit();
  }

  dropThread(threadId: string): void {
    if (!this.perThread.delete(threadId)) return;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const modelStore = new ModelStoreImpl();

const subscribeToModels = (listener: Listener): (() => void) => modelStore.subscribe(listener);

export function useModelCatalog(): ModelListResultFrame {
  return useSyncExternalStore(subscribeToModels, () => modelStore.getSnapshot());
}

export function useThreadModel(threadId: string | null): ThreadModel | null {
  const snapshot = useCallback(() => modelStore.threadModel(threadId), [threadId]);
  return useSyncExternalStore(subscribeToModels, snapshot);
}
