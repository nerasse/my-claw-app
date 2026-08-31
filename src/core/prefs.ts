import { deviceBridge } from './nativeBridge';
import { DEFAULT_SERVER_URL } from './serverUrl';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Prefs {
  themeMode: ThemeMode;
  serverUrl: string;
  lastThreadId: string | null;
  /** Auto-download the app update on mobile data; off by default (wifi only). */
  updateOnMobileData: boolean;
  /**
   * Thread typography scale. 1 = the design sizes (font.body 14, aside 11, meta 12...). What the
   * chat reads at, and every element of a bubble moves with it: the reasoning stays one step
   * under the answer whatever this is set to.
   */
  chatFontScale: number;
}

export { DEFAULT_SERVER_URL };

const DEFAULTS: Prefs = {
  themeMode: 'system',
  serverUrl: DEFAULT_SERVER_URL,
  lastThreadId: null,
  updateOnMobileData: false,
  chatFontScale: 1,
};

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

/** The scale range offered in settings, and what a stored value is clamped to on load. */
export const CHAT_SCALE_MIN = 0.85;
export const CHAT_SCALE_MAX = 1.3;

export function clampChatScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.chatFontScale;
  return Math.min(CHAT_SCALE_MAX, Math.max(CHAT_SCALE_MIN, value));
}

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
        updateOnMobileData: raw.updateOnMobileData === 'true',
        chatFontScale: clampChatScale(Number(raw.chatFontScale)),
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
