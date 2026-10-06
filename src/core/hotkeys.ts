import { useEffect, useRef } from 'react';
import { deviceBridge, deviceEvents } from './nativeBridge';

/**
 * Keyboard shortcuts from a physical keyboard on Android (Bluetooth, DeX) -- docs/keyboard.md.
 *
 * React Native hands the page no key events: the activity catches the keys (HardwareKeys.kt) and
 * sends the bound ones here as `claw:hotkey`. It has to decide on the spot whether a key is taken,
 * so the combos bound here are registered with it each time they change. Same map, same spelling
 * as the web's (`hotkeys.web.ts`).
 */

/** Combos are written `mod+k`, `shift+enter`, `escape`. `mod` is Ctrl, or Cmd on a Mac. */
export type HotkeyMap = Record<string, () => void>;

export function useHotkeys(handlers: HotkeyMap): void {
  // Rebuilt on every render of the shell: the listener reads the latest map through the ref.
  const latest = useRef(handlers);
  latest.current = handlers;
  const combos = Object.keys(handlers).sort().join('\n');

  useEffect(() => {
    deviceBridge.setHotkeys(combos ? combos.split('\n') : []);
  }, [combos]);

  useEffect(() => {
    const subscription = deviceEvents.addListener('claw:hotkey', (event: { combo?: string }) => {
      if (event?.combo) latest.current[event.combo]?.();
    });
    return () => {
      subscription.remove();
      deviceBridge.setHotkeys([]);
    };
  }, []);
}
