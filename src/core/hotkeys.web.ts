/// <reference lib="dom" />
import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, () => void>;

/** `Ctrl`, or `Cmd` on a Mac, where Ctrl+K is a terminal habit and Cmd+K the platform one. */
function comboOf(event: KeyboardEvent): string {
  const mod = event.ctrlKey || event.metaKey ? 'mod+' : '';
  const alt = event.altKey ? 'alt+' : '';
  const shift = event.shiftKey ? 'shift+' : '';
  return `${mod}${alt}${shift}${event.key.toLowerCase()}`;
}

export function useHotkeys(handlers: HotkeyMap): void {
  // The map is rebuilt on every render of the shell; the listener is bound once and reads the
  // latest one through the ref, so a shortcut never fires a closure from three frames ago.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // A dead key or a Japanese IME is mid-word: those keystrokes belong to the field.
      if (event.isComposing) return;
      const run = latest.current[comboOf(event)];
      if (!run) return;
      // Ctrl+K is Firefox's search bar and Ctrl+N is a new window: taking the key is the point.
      event.preventDefault();
      event.stopPropagation();
      run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
