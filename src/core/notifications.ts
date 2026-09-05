import { Platform } from 'react-native';
import { deviceBridge } from './nativeBridge';
import ExpoUnifiedPush, {
  checkPermissions,
  requestPermissions,
  subscribeDistributorMessages,
  type CallbackData,
  type Distributor,
} from 'expo-unified-push';

/**
 * Push notifications over UnifiedPush: a distributor app on the device (ntfy) holds the
 * connection to the self-hosted push server, so a run that finishes while this app is killed
 * still raises a system notification — the rendering happens in the module's native service,
 * without JS. Full design in docs/notifications.md.
 *
 * Android only: UnifiedPush is an Android standard. iOS would need APNs and the web the
 * Notification API, so every entry point here degrades to a no-op elsewhere rather than
 * pretending the platform is covered.
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

export const pushSupported = Platform.OS === 'android';

/**
 * There is no permission to ask for here: the distributor owns the registration and the channel
 * is pre-created at boot, so nothing in this build has a grant to report (docs/notifications.md).
 * The web counterpart answers the browser's own verdict, which is what the settings row reads.
 */
export function notificationPermission(): 'granted' | 'denied' | 'default' | 'unavailable' {
  return 'unavailable';
}

/** The distributors installed on the device (ntfy, NextPush, …), for the settings row. */
export function listDistributors(): Distributor[] {
  if (!pushSupported) return [];
  try {
    return ExpoUnifiedPush.getDistributors();
  } catch {
    return [];
  }
}

export function savedDistributor(): string | null {
  if (!pushSupported) return null;
  try {
    return ExpoUnifiedPush.getSavedDistributor();
  } catch {
    return null;
  }
}

export function saveDistributor(id: string | null): void {
  if (!pushSupported) return;
  try {
    ExpoUnifiedPush.saveDistributor(id);
  } catch {
    // A distributor that vanished between the listing and the tap: the next register() fails
    // with a reason the caller surfaces, nothing to salvage here.
  }
}

/**
 * Picks a distributor when none was chosen yet. External distributors (the ntfy app) are the
 * point of the exercise, so the embedded fallbacks are only taken when nothing else exists.
 */
function autoSelectDistributor(): string | null {
  const saved = savedDistributor();
  if (saved) return saved;
  const all = listDistributors();
  const external = all.find(d => !d.isInternal) ?? all[0];
  if (!external) return null;
  saveDistributor(external.id);
  return external.id;
}

/**
 * Registers with the distributor. Called once per app session, on the first VAPID key the
 * server hands out: a reconnect brings the same key and the same registration, and calling
 * registerDevice again would make the distributor rotate the endpoint for nothing (and leak a
 * subscription on every reconnect). The link is re-established only when the distributor
 * itself reports it lost (unregistered / registration failed).
 */
let registeredThisSession = false;

export async function registerForPush(vapidPublicKey: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported) return { ok: false, reason: 'unsupported platform' };
  if (!vapidPublicKey) return { ok: false, reason: 'no server key' };
  if (registeredThisSession) return { ok: true };

  const granted = (await checkPermissions()) || (await requestPermissions()) === 'granted';
  if (!granted) return { ok: false, reason: 'notification permission denied' };

  if (!autoSelectDistributor()) {
    return { ok: false, reason: 'no UnifiedPush distributor installed (install ntfy)' };
  }

  try {
    await ExpoUnifiedPush.registerDevice(vapidPublicKey);
    registeredThisSession = true;
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String((err as Error)?.message ?? err) };
  }
}

/** The distributor reported the registration lost: the next key allows a fresh attempt. */
export function resetPushRegistration(): void {
  registeredThisSession = false;
}

export async function unregisterFromPush(): Promise<void> {
  if (!pushSupported) return;
  try {
    await ExpoUnifiedPush.unregisterDevice();
  } catch {
    // Already gone on the distributor side; the server-side endpoint is cleared by the caller.
  }
}

/**
 * The distributor's own events. `registered` carries the subscription the server needs to
 * publish; it can arrive long after registerForPush resolved, and again on its own when the
 * distributor rotates the endpoint — which is exactly why the endpoint is pushed to the server
 * from here rather than from the register call site.
 */
export function subscribeToPushRegistration(
  onEvent: (event: PushRegistrationEvent) => void,
): () => void {
  if (!pushSupported) return () => {};
  return subscribeDistributorMessages(({ action, data }: CallbackData) => {
    if (action === 'registered') {
      const payload = data as { url?: string; pubKey?: string; auth?: string };
      if (payload.url) {
        onEvent({
          kind: 'registered',
          subscription: { endpoint: payload.url, pubKey: payload.pubKey, auth: payload.auth },
        });
      }
      return;
    }
    if (action === 'unregistered') {
      onEvent({ kind: 'unregistered' });
      return;
    }
    if (action === 'registrationFailed') {
      onEvent({ kind: 'failed', reason: String((data as { reason?: string }).reason ?? 'unknown') });
    }
  });
}

/** A deep link carried by a notification tap: myclaw://thread/<id> or myclaw://job/<id>. */
export type NotificationTarget =
  | { kind: 'thread'; threadId: string }
  | { kind: 'job'; jobId: string };

/**
 * The id a notification was posted with, derived from its deep link.
 *
 * The push lands while the app is usually killed, so nothing on this side ever saw the
 * notification: the only way to address it later is to recompute the id the server used. Same
 * FNV-1a, folded into a positive 31-bit int because Android takes a signed Int. This is a wire
 * contract with `notificationIdFor` in the server's src/notifications/push.ts, and changing one
 * without the other silently stops dismissing anything.
 */
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
 * Clears the notification a thread raised, whichever way the owner got to the conversation: a
 * tap already dismisses its own notification, opening the thread from the drawer used to leave
 * it sitting in the tray describing a run the owner is now reading.
 */
export function dismissThreadNotification(threadId: string): void {
  if (!pushSupported || !threadId) return;
  deviceBridge.cancelNotification(notificationIdFor(`myclaw://thread/${threadId}`)).catch(() => {});
}

export function parseNotificationLink(url: string | null | undefined): NotificationTarget | null {
  if (!url) return null;
  const match = /^myclaw:\/\/(thread|job)\/(.+)$/.exec(url.trim());
  if (!match) return null;
  const id = decodeURIComponent(match[2]!).trim();
  if (!id) return null;
  return match[1] === 'thread' ? { kind: 'thread', threadId: id } : { kind: 'job', jobId: id };
}
