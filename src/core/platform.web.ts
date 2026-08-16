/// <reference lib="dom" />

/** Web counterpart of platform.ts: every flag is a real capability check, not a platform guess. */

export const secureContext = typeof window !== 'undefined' && window.isSecureContext === true;

/** `mediaDevices` is undefined outside a secure context, which is the honest test. */
export const micSupported =
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

export const locationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator && secureContext;

export const scannerSupported = false;

/** Asked of the device, not of the window: a touchscreen laptop reports both, and coarse wins. */
export const pointerFine =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: fine)').matches
    : false;
