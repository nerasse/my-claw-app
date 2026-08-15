/**
 * Web counterpart of notifications.ts.
 *
 * UnifiedPush is an Android standard, so nothing of it survives here. The browser equivalent is
 * a real Web Push subscription from a service worker, which needs a secure context and is not
 * part of phase 0: every entry point degrades to a no-op that says why, and the UI hides the
 * push settings when `pushSupported` is false.
 *
 * `notificationIdFor` and `parseNotificationLink` are pure and duplicated verbatim: they are a
 * wire contract with the server (src/notifications/push.ts), not platform code.
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

export const pushSupported = false;

export function listDistributors(): Distributor[] {
  return [];
}

export function savedDistributor(): string | null {
  return null;
}

export function saveDistributor(): void {}

export async function registerForPush(): Promise<{ ok: boolean; reason?: string }> {
  return { ok: false, reason: 'web push not implemented yet' };
}

export function resetPushRegistration(): void {}

export async function unregisterFromPush(): Promise<void> {}

export function subscribeToPushRegistration(): () => void {
  return () => {};
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

export function dismissThreadNotification(): void {}

export function parseNotificationLink(url: string | null | undefined): NotificationTarget | null {
  if (!url) return null;
  const match = /^myclaw:\/\/(thread|job)\/(.+)$/.exec(url.trim());
  if (!match) return null;
  const id = decodeURIComponent(match[2]!).trim();
  if (!id) return null;
  return match[1] === 'thread' ? { kind: 'thread', threadId: id } : { kind: 'job', jobId: id };
}
