import { deviceBridge } from './nativeBridge';
import { apnsSnapshot } from './apns.ios';
import type { Distributor } from 'expo-unified-push';
export { notificationIdFor, parseNotificationLink } from './notificationTarget';
export type { NotificationTarget } from './notificationTarget';
export type { PushSubscription, PushRegistrationEvent } from './notifications';
import type { PushRegistrationEvent } from './notifications';

export const pushSupported = true;
export function notificationPermission(): 'granted' | 'denied' | 'default' | 'unavailable' {
  const permission = apnsSnapshot().permission;
  return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default';
}
export function listDistributors(): Distributor[] { return []; }
export function savedDistributor(): string | null { return null; }
export function saveDistributor(_id: string | null): void {}
export async function registerForPush(_serverKey: string): Promise<{ ok: boolean; reason?: string }> {
  const state = await deviceBridge.getAPNsState();
  return { ok: state.status === 'registered', reason: state.reason };
}
export function resetPushRegistration(): void {}
export async function unregisterFromPush(): Promise<void> {}
export function subscribeToPushRegistration(_onEvent: (event: PushRegistrationEvent) => void): () => void {
  return () => {};
}
export function dismissThreadNotification(_threadId: string): void {}
