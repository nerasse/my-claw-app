import {
  encodeCommandsList,
  encodeJobsList,
  encodeModelGet,
  encodeModelList,
  encodeSessionSync,
  encodeSessionList,
  encodeStatusWatch,
  encodeSubAgentsList,
} from './protocol';
import { chatStore } from './chat';
import { statusStore } from './status';

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
/**
 * What the JS asks for when it starts, given the state the transport is already in.
 *
 * On Android the socket lives in the native service and outlives the JS: a process the system
 * restarted, or an activity recreated, comes back to a socket that is already `connected`. No
 * transition to `connected` will follow, so the resume that runs on that transition never runs,
 * and everything it fetches -- the model catalogue first -- stays empty for the life of the socket.
 * An empty catalogue reads as "no model", which closed every send behind the setup assistant
 * (2026-10-06). So a JS that starts on a live socket resumes here, exactly as a reconnect would.
 *
 * Any other state: the list alone, queued natively, and the resume follows the connect.
 */
export function bootFrames(state: string, activeThreadId: string | null): string[] {
  return state === 'connected' ? resumeFrames(activeThreadId) : [encodeSessionList()];
}

export function resumeFrames(activeThreadId: string | null): string[] {
  const frames = [encodeSessionList(), encodeCommandsList(), encodeModelList(), encodeJobsList()];
  // A watch belongs to a socket, and this is a new one: the status page still open would
  // otherwise keep the report of the moment the old socket died, and never hear another.
  const watched = statusStore.getSnapshot().threadId;
  if (watched) frames.push(encodeStatusWatch(watched));
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
