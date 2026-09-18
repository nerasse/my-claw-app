import type { ChatItem, TextItem } from './chat';

/**
 * Retrying a send the server never got.
 *
 * The socket can die under a NAT timeout or a VPN switch and still look open, so a message leaves
 * and nothing comes back. The frame is the app's to hold: the bubble keeps its text and its chips,
 * the same id goes out again, and the server takes a repeated id once. So the retry is the send
 * path itself, and the only proof of arrival is the receipt.
 */

/** The sends still waiting to get out, oldest first. */
export function sendsToRetry(items: readonly ChatItem[]): TextItem[] {
  return items.filter(
    (item): item is TextItem => item.kind === 'text' && item.queuedReason === 'undelivered',
  );
}

/**
 * How long to wait before trying again, from how long the send has been waiting.
 *
 * The first attempts are close together, because most failures are one bad moment on the socket;
 * then the wait opens up, because a device that has been offline this long is offline for a
 * reason -- a tunnel coming back, a plane, a dead network -- and hammering it costs battery and
 * nothing else. It never stops: a message the owner typed is not dropped because the link was
 * slow, and the receipt is what ends the wait.
 */
export function retryDelayAfter(waitedMs: number): number {
  if (waitedMs < 15_000) return 5_000;
  if (waitedMs < 60_000) return 15_000;
  return 30_000;
}
