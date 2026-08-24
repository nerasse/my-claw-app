/// <reference lib="dom" />

/** Web counterpart of platform.ts: every flag is a real capability check, not a platform guess. */

export const secureContext = typeof window !== 'undefined' && window.isSecureContext === true;

/** `mediaDevices` is undefined outside a secure context, which is the honest test. */
export const micSupported =
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

export const locationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator && secureContext;

export const scannerSupported = false;

/**
 * A browser selects text across nodes on its own, and the chat list opts back into `user-select`
 * (webTheme.web.ts, `[data-claw-select="text"]`), so a drag over several bubbles works. The long
 * press that opens the message menu on Android is then only in the way: it fires while the reader
 * is holding to select. Right-click and the row's own button keep the menu one gesture away.
 */
export const chatSelectable = true;

/**
 * False: the browser already selects and copies across nodes, and Ctrl+C is one key away. A
 * `copy`/`select` pair over every argument list and every tool output would only repeat, twice
 * per card, what the pointer does for free.
 */
export const blockActionsSupported = false;


/** Asked of the device, not of the window: a touchscreen laptop reports both, and coarse wins. */
export const pointerFine =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: fine)').matches
    : false;
