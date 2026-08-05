import { deviceBridge } from './nativeBridge';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Prefs {
  themeMode: ThemeMode;
  serverUrl: string;
  lastThreadId: string | null;
}

export const DEFAULT_SERVER_URL = 'ws://10.10.20.10:8080/mobile';

const DEFAULTS: Prefs = {
  themeMode: 'system',
  serverUrl: DEFAULT_SERVER_URL,
  lastThreadId: null,
};

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

type Listener = (prefs: Prefs) => void;

/**
 * Small settings bag backed by Android SharedPreferences through the device bridge. Only what
 * the app cannot rebuild from the server lives here: theme choice, server address, last thread.
 * Chat content is never stored locally, the session history is the source of truth.
 */
class PrefsStore {
  private current: Prefs = DEFAULTS;
  private hydrated = false;
  private listeners = new Set<Listener>();

  get(): Prefs {
    return this.current;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async hydrate(): Promise<Prefs> {
    try {
      const raw = await deviceBridge.prefsGetAll();
      const themeMode = THEME_MODES.includes(raw.themeMode as ThemeMode) ? (raw.themeMode as ThemeMode) : DEFAULTS.themeMode;
      this.current = {
        themeMode,
        serverUrl: raw.serverUrl?.trim() ? raw.serverUrl : DEFAULTS.serverUrl,
        lastThreadId: raw.lastThreadId?.trim() ? raw.lastThreadId : null,
      };
    } catch {
      this.current = DEFAULTS;
    }
    this.hydrated = true;
    this.emit();
    return this.current;
  }

  set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    if (this.current[key] === value) return;
    this.current = { ...this.current, [key]: value };
    this.emit();
    // Fire and forget: a failed write only costs the setting on the next cold start.
    deviceBridge.prefsSet(key, value === null ? null : String(value)).catch(() => {});
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }
}

export const prefs = new PrefsStore();
