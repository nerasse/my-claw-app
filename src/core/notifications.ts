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

/**
 * The UnifiedPush instance of the active server profile, named after it (docs/servers.md): each
 * server has its own endpoint, so one the app is not on still notifies, and the notification link
 * says which. `default` is the instance a single-server build registered, kept as it was. Read
 * from the stored profile at registration, which a switch of server writes before the app restarts.
 */
let pushInstance = 'default';

export async function registerForPush(vapidPublicKey: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported) return { ok: false, reason: 'unsupported platform' };
  if (!vapidPublicKey) return { ok: false, reason: 'no server key' };
  if (registeredThisSession) return { ok: true };
  const stored = await deviceBridge.prefsGetAll().catch((): Record<string, string> => ({}));
  pushInstance = stored.activeServer?.trim() || 'default';

  const granted = (await checkPermissions()) || (await requestPermissions()) === 'granted';
  if (!granted) return { ok: false, reason: 'notification permission denied' };

  if (!autoSelectDistributor()) {
    return { ok: false, reason: 'no UnifiedPush distributor installed (install ntfy)' };
  }

  try {
    await ExpoUnifiedPush.registerDevice(vapidPublicKey, pushInstance);
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
    await ExpoUnifiedPush.unregisterDevice(pushInstance);
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
    // Another server's registration: it is that server's to hear, on the next visit to it.
    const instance = (data as { instance?: string }).instance;
    if (instance && instance !== pushInstance) return;
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

export { notificationIdFor, parseNotificationLink } from './notificationTarget';
export type { NotificationTarget } from './notificationTarget';
import { notificationIdFor } from './notificationTarget';

/**
 * Clears the notification a thread raised, whichever way the owner got to the conversation: a
 * tap already dismisses its own notification, opening the thread from the drawer used to leave
 * it sitting in the tray describing a run the owner is now reading.
 */
export function dismissThreadNotification(threadId: string): void {
  if (!pushSupported || !threadId) return;
  deviceBridge.cancelNotification(notificationIdFor(`myclaw://thread/${threadId}`)).catch(() => {});
}
