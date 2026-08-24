import { connection } from './connection';
import { encodeToolFull } from './protocol';

/**
 * Asking the server for a tool output the card only holds clipped.
 *
 * A card is pushed with at most TOOL_OUTPUT_LIMIT characters, because every reconnect replays a
 * page of history and the bytes of every tool that ever ran would be paid for by every device,
 * every time. The reader who actually opens one gets the rest through here, and the answer lands
 * on `chat.tool.full.result` -> `chatStore.setToolOutput`.
 *
 * Asked once per card. The ask is cheap, but a card re-rendering on every streaming delta would
 * otherwise send one frame per frame, and a failed answer must not turn into a retry loop against
 * a session that no longer holds the call.
 */
const asked = new Set<string>();

export function requestToolOutput(threadId: string, id: string): void {
  const key = `${threadId}\u0000${id}`;
  if (asked.has(key)) return;
  asked.add(key);
  // Fire and forget, like every other read this app makes: the card keeps its clipped text until
  // the answer arrives, and a socket that was down replays nothing.
  connection.send(encodeToolFull(threadId, id)).catch(() => {
    // The ask never landed: let the next open try again.
    asked.delete(key);
  });
}

/** Test seam: the memo is process-wide, and a suite would otherwise leak asks between cases. */
export function resetToolOutputAsks(): void {
  asked.clear();
}
