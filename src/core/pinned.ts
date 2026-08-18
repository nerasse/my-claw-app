import { connection } from './connection';
import { deviceBridge } from './nativeBridge';
import { encodeSessionPin, encodeSessionPinOrder, type SessionSummary } from './protocol';

/**
 * Which conversations sit at the top of the drawer, and in what order.
 *
 * The order is the server's, carried by `pinRank` on every summary: the owner reaches the same
 * conversations from the phone and from the browser, and a pin is about finding one again. Kept
 * per device, as it was until now, each client had its own private idea of what was pinned, and
 * the pins made on the phone did not exist in the browser at all. Nothing is stored here: the
 * listing IS the state, so a pin set anywhere shows up everywhere the next frame lands.
 */

/** The pref this device used to keep its private pins in. Read once, then dropped. */
const LEGACY_PREFS_KEY = 'pinnedSessions';

/** The pinned conversations of a listing, in the owner's order. */
export function pinnedOf(sessions: SessionSummary[]): SessionSummary[] {
  return sessions
    .filter(session => session.pinRank !== undefined)
    .sort((left, right) => (left.pinRank ?? 0) - (right.pinRank ?? 0));
}

export function isPinned(session: SessionSummary): boolean {
  return session.pinRank !== undefined;
}

export function setPinned(threadId: string, pinned: boolean): void {
  connection.send(encodeSessionPin(threadId, pinned)).catch(() => {});
}

/** The user dropped a row: the new order is authoritative, and the server writes it down. */
export function setOrder(threadIds: string[]): void {
  connection.send(encodeSessionPinOrder(threadIds)).catch(() => {});
}

/**
 * Hands this device's old private pins to the server, once. Without it every pin made before the
 * server owned them would silently vanish on update, which reads as data loss even though it is
 * only a preference. The pref is cleared whatever the server then makes of the ids: it has had
 * its one chance to be heard, and keeping it would replay a stale order over a live one.
 */
export async function migrateLocalPins(): Promise<void> {
  try {
    const stored = await deviceBridge.prefsGetAll();
    const raw = stored[LEGACY_PREFS_KEY];
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    const threadIds = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
    await deviceBridge.prefsSet(LEGACY_PREFS_KEY, null);
    if (threadIds.length === 0) return;
    for (const threadId of threadIds) setPinned(threadId, true);
    setOrder(threadIds);
  } catch {
    // A pref that cannot be read is a pref that never existed: nothing to hand over.
  }
}
