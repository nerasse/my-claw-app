import { useSyncExternalStore } from 'react';
import type { JobEntry, JobsListResultFrame } from './protocol';

type Listener = () => void;

const EMPTY: JobsListResultFrame = { type: 'jobs.list.result', jobs: [] };
Object.freeze(EMPTY);

/**
 * The scheduled tasks of the server. The server owns the truth; this store only mirrors what
 * `jobs.list.result` frames say, so the page never shows a job the server did not store, and a
 * refused mutation cannot masquerade as a saved one.
 */
class JobsStoreImpl {
  private snapshot: JobsListResultFrame = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): JobsListResultFrame {
    return this.snapshot;
  }

  replace(frame: JobsListResultFrame): void {
    this.snapshot = frame;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Test seam: the store is module-level and outlives one test. */
  reset(): void {
    this.snapshot = EMPTY;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const jobsStore = new JobsStoreImpl();

const subscribeToJobs = (listener: Listener): (() => void) => jobsStore.subscribe(listener);

export function useJobs(): JobEntry[] {
  return useSyncExternalStore(subscribeToJobs, () => jobsStore.getSnapshot()).jobs;
}
