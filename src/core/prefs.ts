import { deviceBridge } from './nativeBridge';
import { DEFAULT_SERVER_URL, LEGACY_SERVER_URL } from './serverUrl';

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
  /**
   * Folders the owner folded away in the conversation list, by id. Device-local on purpose: a fold
   * makes room on a small screen, and the same folders unfolded on a wide one are not a
   * contradiction to be resolved but two rooms arranged differently.
   */
  collapsedFolders: string[];
  /** Setup steps the owner skipped on this device, by key: the assistant stops asking about them. */
  setupSkipped: string[];
  /** Audio playback speed, one of PLAYBACK_RATES: kept from one note to the next, like a podcast app. */
  playbackRate: number;
}

export { DEFAULT_SERVER_URL };

const DEFAULTS: Prefs = {
  themeMode: 'system',
  serverUrl: DEFAULT_SERVER_URL,
  lastThreadId: null,
  updateOnMobileData: false,
  chatFontScale: 1,
  collapsedFolders: [],
  setupSkipped: [],
  playbackRate: 1,
};

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

/** The scale range offered in settings, and what a stored value is clamped to on load. */
export const CHAT_SCALE_MIN = 0.85;
export const CHAT_SCALE_MAX = 1.3;

/** Folder ids travel as one comma-separated string: ids carry no comma, and the file stays legible. */
export function parseCollapsedFolders(raw: string | undefined): string[] {
  return raw ? raw.split(',').filter(id => id !== '') : [];
}

/** Small steps first, where a voice still sounds like itself, then the jumps; past 2 it wraps to 1. */
export const PLAYBACK_RATES = [1, 1.1, 1.2, 1.3, 1.5, 2] as const;

export function parsePlaybackRate(raw: string | undefined): number {
  const value = Number(raw);
  return PLAYBACK_RATES.some(rate => rate === value) ? value : DEFAULTS.playbackRate;
}

export function nextPlaybackRate(current: number): number {
  const index = PLAYBACK_RATES.findIndex(rate => rate === current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
}

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
      // A phone that has been used (any setting stored) but holds no address ran on the address
      // older builds had built in: it keeps it, written down now that there is no default. A new
      // install stores nothing at all and is asked for an address instead.
      if (!raw.serverUrl?.trim() && LEGACY_SERVER_URL && Object.keys(raw).length > 0) {
        raw.serverUrl = LEGACY_SERVER_URL;
        deviceBridge.prefsSet('serverUrl', LEGACY_SERVER_URL).catch(() => {});
      }
      const themeMode = THEME_MODES.includes(raw.themeMode as ThemeMode) ? (raw.themeMode as ThemeMode) : DEFAULTS.themeMode;
      this.current = {
        themeMode,
        serverUrl: raw.serverUrl?.trim() ? raw.serverUrl : DEFAULTS.serverUrl,
        lastThreadId: raw.lastThreadId?.trim() ? raw.lastThreadId : null,
        updateOnMobileData: raw.updateOnMobileData === 'true',
        chatFontScale: clampChatScale(Number(raw.chatFontScale)),
        collapsedFolders: parseCollapsedFolders(raw.collapsedFolders),
        setupSkipped: parseCollapsedFolders(raw.setupSkipped),
        playbackRate: parsePlaybackRate(raw.playbackRate),
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
