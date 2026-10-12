import { useSyncExternalStore } from 'react';
import { deviceBridge, deviceEvents, type APNsNativeState } from './nativeBridge';
import { connection } from './connection';
import { encodeAPNsRegister, type APNsResultFrame } from './protocol';

let state: APNsNativeState = { permission: 'unavailable', status: 'notConfigured' };
const listeners = new Set<() => void>();
const update = (value: APNsNativeState): void => {
  const serverStatus = value.serverStatus ?? (value.status === 'registered' && value.registrationId === state.registrationId ? state.serverStatus : undefined);
  state = { permission: value.permission, status: value.status, reason: value.reason, registrationId: value.registrationId, serverStatus };
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function apnsSnapshot(): APNsNativeState { return state; }
export function useAPNsState(): APNsNativeState { return useSyncExternalStore(subscribe, () => state); }
export async function refreshAPNsState(): Promise<void> { update(await deviceBridge.getAPNsState()); }
export async function configureAPNs(relay?: string): Promise<void> {
  if (!relay) { invalidateAPNs(); return; }
  update(await deviceBridge.configureAPNs(relay));
}
export async function enableAPNs(): Promise<void> { update(await deviceBridge.requestAPNs()); }
export function handleAPNsResult(frame: APNsResultFrame): void {
  if (frame.registrationId && frame.registrationId !== state.registrationId) return;
  if (frame.ok && frame.registrationId === state.registrationId) update({ ...state, serverStatus: 'ready' });
  else if (!frame.ok) update({ ...state, serverStatus: 'failed', reason: frame.error ?? 'The server refused notification registration.' });
}
export function subscribeAPNs(): () => void {
  const subscription = deviceEvents.addListener('claw:push:registration', (event: APNsNativeState) => {
    update(event.status === 'registered' ? { ...event, serverStatus: 'pending' } : event);
    if (event.status === 'registered' && event.registrationId && event.secret) {
      const registrationId = event.registrationId;
      connection.send(encodeAPNsRegister(registrationId, event.secret)).then(accepted => {
        if (!accepted && state.registrationId === registrationId) {
          update({ ...state, serverStatus: 'failed', reason: 'Notification registration could not enter the send queue. Retry when connected.' });
        }
      }).catch(() => {
        if (state.registrationId === registrationId) update({ ...state, serverStatus: 'failed', reason: 'Notification registration could not reach the server.' });
      });
    }
  });
  return () => subscription.remove();
}
export function subscribeNotificationOpen(handle: (link: string | null) => void): () => void {
  let stopped = false;
  const drain = (): void => { deviceBridge.drainNotificationOpen().then(link => { if (!stopped && link) handle(link); }).catch(() => {}); };
  const subscription = deviceEvents.addListener('claw:push:open', drain);
  drain();
  return () => { stopped = true; subscription.remove(); };
}
export function setVisiblePushThread(thread: string | null): void { deviceBridge.setVisibleNotificationThread(thread); }
export function invalidateAPNs(): void { deviceBridge.invalidateAPNs(); update({ permission: state.permission, status: 'notConfigured' }); }
