import { Platform } from 'react-native';

/**
 * The app's keyboard shortcuts, one table: the shell binds them, the help sheet lists them and the
 * menus print them beside their entries, so the three can never disagree -- docs/keyboard.md.
 *
 * A bare letter (with Shift) names what it opens, in English: New, Sessions, Browser, Files,
 * Attachments, Jobs, Model. Those act only outside a text field, where they would otherwise type a
 * capital; Escape leaves the field first. Ctrl (Cmd on a Mac) combos work everywhere.
 */
export type ShortcutId =
  | 'new'
  | 'sessions'
  | 'browser'
  | 'files'
  | 'attachments'
  | 'jobs'
  | 'model'
  | 'compose'
  | 'commands'
  | 'settings'
  | 'sidebar'
  | 'closeAll'
  | 'help';

export interface Shortcut {
  id: ShortcutId;
  /** Hotkey combos (hotkeys.web.ts): the first is the one shown. Layouts differ: AZERTY types `/` with Shift. */
  combos: string[];
  label: string;
  hint: string;
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'new', combos: ['shift+n', 'mod+n'], label: 'New conversation', hint: 'start one, on the composer' },
  { id: 'sessions', combos: ['shift+s', 'mod+k'], label: 'Search conversations', hint: 'the list, its search focused' },
  { id: 'compose', combos: ['/', 'shift+/'], label: 'Write a message', hint: 'focus the composer' },
  { id: 'model', combos: ['shift+m'], label: 'Model', hint: 'the model of this conversation' },
  { id: 'attachments', combos: ['shift+a'], label: 'Session files', hint: "this conversation's files" },
  { id: 'files', combos: ['shift+f'], label: 'Files', hint: 'every file on this machine' },
  { id: 'browser', combos: ['shift+b'], label: 'Browser', hint: 'the live windows, VNC' },
  { id: 'jobs', combos: ['shift+j'], label: 'Jobs', hint: 'scheduled tasks' },
  { id: 'commands', combos: ['mod+/', 'mod+shift+/'], label: 'Commands', hint: 'the slash commands' },
  { id: 'settings', combos: ['mod+,'], label: 'Settings', hint: '' },
  { id: 'sidebar', combos: ['mod+b'], label: 'Fold the conversation list', hint: 'wide windows' },
  { id: 'closeAll', combos: ['shift+escape'], label: 'Close everything', hint: 'back to the conversation' },
  { id: 'help', combos: ['?', 'shift+?'], label: 'Keyboard shortcuts', hint: 'this list' },
];

const mac = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** How a combo reads: `⇧B`, `Ctrl ,`, `⌘ ,`, `Esc`, `/`. */
export function comboLabel(combo: string): string {
  const parts = combo.split('+');
  const key = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1);
  const keyText = key === 'escape' ? 'Esc' : key.length === 1 ? key.toUpperCase() : key;
  if (mods.includes('mod')) return `${mac ? '⌘' : 'Ctrl'} ${mods.includes('shift') ? '⇧' : ''}${keyText}`;
  if (mods.includes('shift')) return key === '?' ? '?' : `⇧${keyText}`;
  return keyText;
}

export function shortcutLabel(id: ShortcutId): string {
  const shortcut = SHORTCUTS.find(s => s.id === id)!;
  return comboLabel(shortcut.combos[0]!);
}

/** What the menus print beside an entry: nothing where there is no keyboard to press it with. */
export function shortcutHint(id: ShortcutId): string | undefined {
  return Platform.OS === 'web' ? shortcutLabel(id) : undefined;
}

/** The keys that are not shortcuts but the way around: shown at the top of the help sheet. */
export const MOVING_AROUND = '↑ ↓ move · Enter open · Esc back · Tab next area · a letter jumps in a menu';
