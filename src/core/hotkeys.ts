/**
 * Keyboard shortcuts. A no-op on Android, where there is no keyboard to shortcut.
 *
 * The web counterpart listens on the window in the capture phase, which is not a detail:
 * react-native-web's TextInput calls `stopPropagation()` on every key event, so a listener that
 * waits for the bubble never fires while the composer has focus, i.e. exactly when the shortcut
 * is wanted.
 */

/** Combos are written `mod+k`, `shift+enter`, `escape`. `mod` is Ctrl, or Cmd on a Mac. */
export type HotkeyMap = Record<string, () => void>;

export function useHotkeys(_handlers: HotkeyMap): void {
  // Android: nothing to bind.
}
