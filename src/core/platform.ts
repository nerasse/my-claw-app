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
