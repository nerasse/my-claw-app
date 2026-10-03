import { useSyncExternalStore } from 'react';
import type { ServicesResultFrame } from './protocol';

type Listener = () => void;

export interface ServicesState {
  /** The server's last description; null until it answers. */
  frame: ServicesResultFrame | null;
  /** The last refusal (a URL missing, an old server), cleared by the next answer. */
  error: string | null;
  /** A set is on its way: the row that asked shows it, and asks nothing twice. */
  busy: boolean;
}

/**
 * The Services page's state, outside the shell: an answer to a set lands on every window of the
 * owner, page open or not, and reopening it shows the last known state.
 */
class ServicesStoreImpl {
  private state: ServicesState = { frame: null, error: null, busy: false };
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get(): ServicesState {
    return this.state;
  }

  private set(next: Partial<ServicesState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  replace(frame: ServicesResultFrame): void {
    this.set({ frame, error: null, busy: false });
  }

  fail(message: string): void {
    this.set({ error: message, busy: false });
  }

  sending(): void {
    this.set({ busy: true, error: null });
  }

  reset(): void {
    this.set({ frame: null, error: null, busy: false });
  }
}

export const servicesStore = new ServicesStoreImpl();

const subscribe = (listener: Listener): (() => void) => servicesStore.subscribe(listener);

export function useServices(): ServicesState {
  return useSyncExternalStore(subscribe, () => servicesStore.get());
}

/** The words the page uses, one place: an id is never shown. */
export const SERVICE_LABELS: Record<ServicesResultFrame['services'][number]['id'], { title: string; hint: string }> = {
  stt: { title: 'Speech-to-text', hint: 'your voice notes, as text' },
  tts: { title: 'Text-to-speech', hint: 'the agent answering out loud' },
  location: { title: 'Location', hint: 'a shared GPS position, read as an address' },
  embeddings: { title: 'Embeddings', hint: 'memory recall by meaning, not only by words' },
  search: { title: 'Web search', hint: 'a SearXNG instance' },
  browser: { title: 'Browser', hint: 'the agent opening pages and filling forms' },
};

export const SOURCE_LABELS: Record<ServicesResultFrame['services'][number]['source'], string> = {
  off: 'Off',
  cloud: 'Cloud',
  'self-hosted': 'This server',
  url: 'My URL',
};

/** Where a key the page asks for is obtained: one line under its field. */
export const KEY_HELP: Record<string, string> = {
  GROQ_API_KEY: 'free key at console.groq.com > API Keys',
  GEOAPIFY_API_KEY: 'free key at myprojects.geoapify.com',
  OPENAI_API_KEY: 'platform.openai.com > API keys',
};
