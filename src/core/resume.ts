import {
  encodeCommandsList,
  encodeJobsList,
  encodeModelGet,
  encodeModelList,
  encodeSessionHistory,
  encodeSessionList,
} from './protocol';

/**
 * What a socket asks for the moment it comes up, in order.
 *
 * Nothing the server pushed while this window was down is replayed: a mirrored prompt, an answer,
 * a command result all went to the windows that were connected and to nowhere else. So the
 * conversation on screen is refetched here, not only the catalogs: a device that dropped, crashed
 * or slept otherwise comes back to its own stale copy and stays there, silently, for as long as
 * the owner does not switch threads.
 */
export function resumeFrames(activeThreadId: string | null, historyLimit: number): string[] {
  const frames = [encodeSessionList(), encodeCommandsList(), encodeModelList(), encodeJobsList()];
  if (!activeThreadId) return frames;
  // The model too: a thread whose model was changed from another window would keep the old label
  // in the header until the next run ended.
  return [...frames, encodeSessionHistory(activeThreadId, historyLimit), encodeModelGet(activeThreadId)];
}
