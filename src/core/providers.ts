import { useSyncExternalStore } from 'react';
import type { ProviderRenamePreviewResultFrame, ProviderRenameRefs, ProvidersEnvResultFrame } from './protocol';

type Listener = () => void;

export type ProvidersEnvStatus = 'unknown' | 'ready' | 'unsupported';

interface ProvidersEnvState {
  status: ProvidersEnvStatus;
  /** The names in .env and who reads each, or null before the first answer. */
  env: Omit<ProvidersEnvResultFrame, 'type'> | null;
  error: string | null;
}

const EMPTY: ProvidersEnvState = { status: 'unknown', env: null, error: null };

/** True when the name holds a value on the server, whether from .env or the process env. */
export function envNamePresent(env: Omit<ProvidersEnvResultFrame, 'type'> | null, name: string): boolean {
  return env !== null && env.present.includes(name);
}

/**
 * The environment variable names the server knows about, mirrored like the tags store. Names
 * only: the values never leave the server. `unsupported` means the server never answered (a
 * server that predates the providers frames drops them silently).
 */
class ProvidersEnvStoreImpl {
  private state: ProvidersEnvState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ProvidersEnvState {
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

  receive(env: Omit<ProvidersEnvResultFrame, 'type'>): void {
    this.state = { status: 'ready', env, error: null };
    this.emit();
  }

  markUnsupported(): void {
    if (this.state.status === 'ready') return;
    this.state = { status: 'unsupported', env: null, error: null };
    this.emit();
  }

  fail(message: string): void {
    this.state = { ...this.state, error: message };
    this.emit();
  }

  /**
   * Drops the last refusal. A retry has to start from a clean banner: the previous complaint is
   * about an attempt that is over, and leaving it up would show it against the new one.
   */
  clearError(): void {
    if (this.state.error === null) return;
    this.state = { ...this.state, error: null };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const providersEnvStore = new ProvidersEnvStoreImpl();

const subscribe = (listener: Listener): (() => void) => providersEnvStore.subscribe(listener);

export function useProvidersEnv(): ProvidersEnvState {
  return useSyncExternalStore(subscribe, () => providersEnvStore.getSnapshot());
}

/**
 * The read-only answer a key rename asks for before it runs (server 0.7.118+).
 *
 * The app cannot count these references itself: sessions, cron jobs and agent files live on the
 * server, and counting only what this device holds would promise a smaller cascade than the one
 * the rename performs. `expect()` names the pair being asked about, so a late answer to an
 * abandoned attempt cannot open a sheet for a rename that is no longer staged.
 */
interface RenamePreviewState {
  pending: { from: string; to: string } | null;
  refs: { from: string; to: string; refs: ProviderRenameRefs } | null;
}

const RENAME_EMPTY: RenamePreviewState = { pending: null, refs: null };

class ProviderRenameStoreImpl {
  private state: RenamePreviewState = RENAME_EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): RenamePreviewState {
    return this.state;
  }

  /** Drops everything. Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = RENAME_EMPTY;
    this.emit();
  }

  expect(from: string, to: string): void {
    this.state = { pending: { from, to }, refs: null };
    this.emit();
  }

  receive(frame: ProviderRenamePreviewResultFrame): void {
    if (!this.state.pending || this.state.pending.from !== frame.from || this.state.pending.to !== frame.to) {
      return;
    }
    this.state = { pending: this.state.pending, refs: { from: frame.from, to: frame.to, refs: frame.refs } };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const providerRenameStore = new ProviderRenameStoreImpl();

const subscribeRename = (listener: Listener): (() => void) => providerRenameStore.subscribe(listener);

export function useProviderRenamePreview(): RenamePreviewState {
  return useSyncExternalStore(subscribeRename, () => providerRenameStore.getSnapshot());
}
