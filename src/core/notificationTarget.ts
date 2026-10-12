/**
 * A deep link carried by a notification tap: myclaw://thread/<id> or myclaw://job/<id>. The same
 * union as the server's `src/notifications/target.ts`, which builds every link from it: a cron run
 * is a thread (`cron-<job>-<ts>`), opened as the chat it is.
 */
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

export function parseNotificationLink(url: string | null | undefined): NotificationTarget | null {
  if (!url) return null;
  const match = /^myclaw:\/\/(thread|job)\/(.+)$/.exec(url.trim());
  if (!match) return null;
  const id = decodeURIComponent(match[2]!).trim();
  if (!id) return null;
  return match[1] === 'thread' ? { kind: 'thread', threadId: id } : { kind: 'job', jobId: id };
}
