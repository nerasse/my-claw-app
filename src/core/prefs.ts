import { deviceBridge } from './nativeBridge';
import { DEFAULT_SERVER_URL } from './serverUrl';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId, type ThemeMode } from '../theme/themes';
import { EMPTY_CUSTOM, parseHex, SOURCE_FIELDS, type CustomTheme } from '../theme/customPalette';
import type { PaletteSource } from '../theme/themes.generated';

export type { ThemeMode };

export interface Prefs {
  /** Which palette. Device-local: a theme is a display choice, not a property of the account. */
  themeId: ThemeId;
  /** The colours of the `custom` palette, when one is written. Sparse: unset fields derive. */
  customTheme: CustomTheme;
  /** Light, dark, AMOLED, or follow the phone. */
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
  /**
   * Close the keyboard once a message is sent, so the answer gets the room it was covering.
   * Mobile only, on by default: the composer is the last thing touched before reading.
   */
  dismissKeyboardOnSend: boolean;
  /** Audio playback speed, one of PLAYBACK_RATES: kept from one note to the next, like a podcast app. */
  playbackRate: number;
  /**
   * Zoom of the document readers (a .md file, a skill), one of DOC_SCALE_STEPS. Local, and shared
   * by every reader: a page read at two steps up is a preference about the reader, not about the
   * file, so opening the next one starts where the last was left.
   */
  docFontScale: number;
  /**
   * The desktop columns as they were left, as JSON (`core/panes.ts` reads it back). A dragged
   * width and a folded list are furniture, and furniture does not move back by itself.
   */
  panes: string;
  /**
   * The right-hand pane as it was left: which page, which settings page, which file. JSON, read by
   * `core/rightPane.ts`. Local on purpose -- a phone shows one thing at a time, and a reload on the
   * desk should come back to the file that was open.
   */
  rightPane: string;
}

export { DEFAULT_SERVER_URL };

const DEFAULTS: Prefs = {
  themeId: DEFAULT_THEME_ID,
  customTheme: EMPTY_CUSTOM,
  themeMode: 'system',
  serverUrl: DEFAULT_SERVER_URL,
  lastThreadId: null,
  updateOnMobileData: false,
  chatFontScale: 1,
  collapsedFolders: [],
  setupSkipped: [],
  dismissKeyboardOnSend: true,
  playbackRate: 1,
  docFontScale: 1,
  panes: '',
  rightPane: '',
};

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark', 'amoled'];

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

/**
 * Zoom steps of the document readers, and the two rules around them.
 *
 * Even steps near the base keep the text recognisable; the ends are where the buttons stop, not
 * where they wrap -- a zoom control that jumped from the smallest to the largest on one tap would
 * lose the reader's place.
 */
export const DOC_SCALE_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

export function parseDocScale(raw: string | undefined): number {
  const value = Number(raw);
  return DOC_SCALE_STEPS.some(step => step === value) ? value : DEFAULTS.docFontScale;
}

/** The step next to `current`, or `current` again at either end. */
export function stepDocScale(current: number, direction: 1 | -1): number {
  const index = DOC_SCALE_STEPS.findIndex(step => step === current);
  const at = index < 0 ? DOC_SCALE_STEPS.indexOf(1) : index;
  return DOC_SCALE_STEPS[Math.min(DOC_SCALE_STEPS.length - 1, Math.max(0, at + direction))];
}

export function clampChatScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.chatFontScale;
  return Math.min(CHAT_SCALE_MAX, Math.max(CHAT_SCALE_MIN, value));
}

/**
 * A stored custom theme, or nothing.
 *
 * Every colour is validated on the way in: this string is what the app paints itself with, and a
 * value that is not a hex would produce a palette whose fields are `undefined` and a StyleSheet
 * full of holes. A key that does not exist any more is dropped rather than carried.
 */
export function parseCustomTheme(raw: string | undefined): CustomTheme {
  if (!raw) return EMPTY_CUSTOM;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomTheme>;
    const clean = (seed: Partial<PaletteSource> | undefined): Partial<PaletteSource> => {
      const out: Partial<PaletteSource> = {};
      for (const { key } of SOURCE_FIELDS) {
        const value = typeof seed?.[key] === 'string' ? parseHex(String(seed[key])) : null;
        if (value) out[key] = value;
      }
      return out;
    };
    return { light: clean(parsed.light), dark: clean(parsed.dark) };
  } catch {
    return EMPTY_CUSTOM;
  }
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
        themeId: isThemeId(raw.themeId) ? raw.themeId : DEFAULTS.themeId,
        customTheme: parseCustomTheme(raw.customTheme),
        themeMode,
        serverUrl: raw.serverUrl?.trim() ? raw.serverUrl : DEFAULTS.serverUrl,
        lastThreadId: raw.lastThreadId?.trim() ? raw.lastThreadId : null,
        updateOnMobileData: raw.updateOnMobileData === 'true',
        chatFontScale: clampChatScale(Number(raw.chatFontScale)),
        collapsedFolders: parseCollapsedFolders(raw.collapsedFolders),
        setupSkipped: parseCollapsedFolders(raw.setupSkipped),
        // Absent means on: the setting arrived with the behaviour, and a device that never saw it
        // must still get what its owner asked for.
        dismissKeyboardOnSend: raw.dismissKeyboardOnSend !== 'false',
        playbackRate: parsePlaybackRate(raw.playbackRate),
        docFontScale: parseDocScale(raw.docFontScale),
        panes: raw.panes ?? '',
        rightPane: raw.rightPane ?? '',
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
    // A list keeps its comma form (an id carries no comma, and the file stays legible); only a
    // real object is JSON. `typeof [] === 'object'` is the trap this line avoids.
    const stored =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? JSON.stringify(value)
        : value === null
          ? null
          : String(value);
    deviceBridge.prefsSet(key, stored).catch(() => {});
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }
}

export const prefs = new PrefsStore();
