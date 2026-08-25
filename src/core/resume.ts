import {
  encodeCommandsList,
  encodeJobsList,
  encodeModelGet,
  encodeModelList,
  encodeSessionSync,
  encodeSessionList,
  encodeSubAgentsList,
} from './protocol';
import { chatStore } from './chat';

/**
 * What a socket asks for the moment it comes up, in order.
 *
 * Nothing the server pushed while this window was down is replayed: a mirrored prompt, an answer,
 * a command result all went to the windows that were connected and to nowhere else. So the
 * conversation on screen is refetched here, not only the catalogs: a device that dropped, crashed
 * or slept otherwise comes back to its own stale copy and stays there, silently, for as long as
 * the owner does not switch threads.
 *
 * The thread is synced via session.sync, which asks for a delta since the last known entry.
 * If the cursor is stale (unknown-cursor) or the branch diverged (branch-switch), the server
 * responds with a full page instead, and the client replaces its view.
 */
export function resumeFrames(activeThreadId: string | null): string[] {
  const frames = [encodeSessionList(), encodeCommandsList(), encodeModelList(), encodeJobsList()];
  if (!activeThreadId) return frames;
  // Ask for entries since the last one we have, on the branch we're showing.
  const { since, leaf } = chatStore.getSyncState(activeThreadId);
  return [
    ...frames,
    encodeSessionSync(activeThreadId, since, leaf ?? undefined),
    encodeSubAgentsList(activeThreadId),
    encodeModelGet(activeThreadId),
  ];
}
