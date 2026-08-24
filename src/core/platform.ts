/**
 * What this build can physically do, decided once instead of guessed at each call site.
 *
 * The web replaces this file. A browser gates the microphone, geolocation, notifications and
 * service workers behind a secure context, and `http://<host>:8080` is not one: a button that
 * silently does nothing is worse than no button, so the UI reads these flags and hides what it
 * cannot deliver.
 */

export const micSupported = true;

export const locationSupported = true;

export const secureContext = true;

/** The QR scanner is Android only: a browser pairing a browser has both codes on one screen. */
export const scannerSupported = true;

/**
 * A pointing device accurate enough for hover states and small targets. A finger is not one, so
 * the app keeps its tap-sized rows and never shows something that only appears under a cursor.
 */
export const pointerFine = false;

/**
 * Whether a selection started inside the chat list can be finished by the platform itself.
 *
 * False here, and docs/text-selection.md says why: a selection never leaves the `Text` node it
 * began in, and a selectable view inside the inverted list throws the scroll to the other end. A
 * long press on a bubble therefore opens the message menu, where copying works, instead of
 * starting a gesture the platform cannot honour.
 */
export const chatSelectable = false;

/**
 * Whether a block of text inside the thread needs its own copy/select buttons.
 *
 * True here for the same reason as `chatSelectable` being false: the platform cannot lift text
 * out of the chat list, so the buttons are the only way. A browser does it natively, and there
 * the buttons are noise stacked on every argument and every output.
 */
export const blockActionsSupported = true;

