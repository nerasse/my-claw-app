import { Platform } from 'react-native';
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
 * Registers with the distributor. Called on every startup (and on every reconnect that brings
 * a fresh VAPID key): the library documents this as the way to verify the connection is still
 * alive, not just a one-time setup call.
 */
export async function registerForPush(vapidPublicKey: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported) return { ok: false, reason: 'unsupported platform' };
  if (!vapidPublicKey) return { ok: false, reason: 'no server key' };

  const granted = (await checkPermissions()) || (await requestPermissions()) === 'granted';
  if (!granted) return { ok: false, reason: 'notification permission denied' };

  if (!autoSelectDistributor()) {
    return { ok: false, reason: 'no UnifiedPush distributor installed (install ntfy)' };
  }

  try {
    await ExpoUnifiedPush.registerDevice(vapidPublicKey);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String((err as Error)?.message ?? err) };
  }
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

export function parseNotificationLink(url: string | null | undefined): NotificationTarget | null {
  if (!url) return null;
  const match = /^myclaw:\/\/(thread|job)\/(.+)$/.exec(url.trim());
  if (!match) return null;
  const id = decodeURIComponent(match[2]!).trim();
  if (!id) return null;
  return match[1] === 'thread' ? { kind: 'thread', threadId: id } : { kind: 'job', jobId: id };
}
