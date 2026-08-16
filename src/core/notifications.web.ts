/// <reference lib="dom" />

/**
 * Web counterpart of notifications.ts.
 *
 * Android goes through UnifiedPush, where a distributor app holds the connection and the
 * endpoint URL is itself the secret. A browser subscribes to its own push service instead, and
 * the subscription it hands back (endpoint + p256dh + auth) has exactly the shape the server
 * already publishes to: the payload is Web Push encrypted with VAPID either way, so nothing on
 * the server changes.
 *
 * Everything here needs a secure context. On a plain-HTTP origin `serviceWorker` does not exist,
 * `pushSupported` is false, and the settings row hides rather than offering a switch that cannot
 * work.
 *
 * `notificationIdFor` and `parseNotificationLink` are pure and duplicated verbatim from the
 * native file: they are a wire contract with the server, not platform code.
 */

export interface PushSubscription {
  endpoint: string;
  pubKey?: string;
  auth?: string;
}

export type PushRegistrationEvent =
  | { kind: 'registered'; subscription: PushSubscription }
  | { kind: 'unregistered' }
  | { kind: 'failed'; reason: string };

export interface Distributor {
  id: string;
  name: string;
  isInternal: boolean;
  isConnected: boolean;
  isSaved: boolean;
}

export const pushSupported =
  typeof window !== 'undefined' &&
  window.isSecureContext === true &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

/** A browser has one push service and no choice to offer, so the distributor list stays empty. */
export function listDistributors(): Distributor[] {
  return [];
}

export function savedDistributor(): string | null {
  return null;
}

export function saveDistributor(): void {}

const listeners = new Set<(event: PushRegistrationEvent) => void>();
let registered = false;

function emit(event: PushRegistrationEvent): void {
  listeners.forEach(listener => listener(event));
}

/** VAPID keys travel as base64url and `applicationServerKey` wants raw bytes. */
function decodeVapidKey(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, String.fromCharCode(47));
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function encodeKey(
  subscription: globalThis.PushSubscription,
  name: 'p256dh' | 'auth',
): string | undefined {
  const raw = subscription.getKey(name);
  if (!raw) return undefined;
  let binary = '';
  for (const byte of new Uint8Array(raw)) binary += String.fromCharCode(byte);
  // base64 -> base64url, split out so no regex literal starts with a slash (no-div-regex).
  return btoa(binary)
    .split('+')
    .join('-')
    .split('/')
    .join('_')
    .replace(/[=]+$/, '');
}

export async function registerForPush(
  vapidPublicKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported) return { ok: false, reason: 'needs https' };
  if (!vapidPublicKey) return { ok: false, reason: 'no server key' };
  if (registered) return { ok: true };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'notification permission denied' };

  try {
    const worker = await navigator.serviceWorker.ready;
    const existing = await worker.pushManager.getSubscription();
    const subscription =
      existing ??
      (await worker.pushManager.subscribe({
        // Chrome refuses a silent subscription outright, and a push that shows nothing is not
        // what this is for anyway.
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidPublicKey),
      }));

    registered = true;
    emit({
      kind: 'registered',
      subscription: {
        endpoint: subscription.endpoint,
        pubKey: encodeKey(subscription, 'p256dh'),
        auth: encodeKey(subscription, 'auth'),
      },
    });
    return { ok: true };
  } catch (err) {
    const reason = String((err as Error)?.message ?? err);
    emit({ kind: 'failed', reason });
    return { ok: false, reason };
  }
}

export function resetPushRegistration(): void {
  registered = false;
}

export async function unregisterFromPush(): Promise<void> {
  if (!pushSupported) return;
  registered = false;
  try {
    const worker = await navigator.serviceWorker.ready;
    const subscription = await worker.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Already gone on the push service side; the server endpoint is cleared by the caller.
  }
}

export function subscribeToPushRegistration(
  onEvent: (event: PushRegistrationEvent) => void,
): () => void {
  listeners.add(onEvent);
  return () => {
    listeners.delete(onEvent);
  };
}

export type NotificationTarget =
  | { kind: 'thread'; threadId: string }
  | { kind: 'job'; jobId: string };

/* eslint-disable no-bitwise -- FNV-1a is defined in bitwise terms, and the server computes the
   same bits: writing it any other way would be a different hash. */
export function notificationIdFor(url: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & 0x7fffffff;
}
/* eslint-enable no-bitwise */

/**
 * The browser owns its notification tray: a tag replaces the notification of the same thread on
 * its own. Closing one from here would need the worker registration for no visible gain, so this
 * stays a no-op rather than a half-kept promise.
 */
export function dismissThreadNotification(): void {}

export function parseNotificationLink(url: string | null | undefined): NotificationTarget | null {
  if (!url) return null;
  const match = /^myclaw:\/\/(thread|job)\/(.+)$/.exec(url.trim());
  if (!match) return null;
  const id = decodeURIComponent(match[2]!).trim();
  if (!id) return null;
  return match[1] === 'thread' ? { kind: 'thread', threadId: id } : { kind: 'job', jobId: id };
}
