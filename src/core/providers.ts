import { useSyncExternalStore } from 'react';
import type { ProvidersEnvResultFrame } from './protocol';

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
