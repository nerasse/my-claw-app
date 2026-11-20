import { chatStore, type HistoryPage } from './chat';
import { connection } from './connection';
import { encodeSessionHistory, type ChatHistoryFrame } from './protocol';

const PAGE_LIMIT = 50;
const PAGE_TIMEOUT_MS = 15_000;

interface Request {
  page: HistoryPage;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Request>();

function cursorId(page: HistoryPage): string | undefined {
  return page.countOnly ? undefined : page.oldestId ?? undefined;
}

function forgetRequest(threadId: string): boolean {
  const request = pending.get(threadId);
  if (!request) return false;
  clearTimeout(request.timer);
  return pending.delete(threadId);
}

export function cancelOlderHistory(threadId: string, failed = false): void {
  if (forgetRequest(threadId) && chatStore.getPage(threadId).loading) {
    chatStore.setPageLoading(threadId, false, failed);
  }
}

function requestAtEdge(threadId: string): Request | undefined {
  const request = pending.get(threadId);
  if (!request) return;
  const page = chatStore.getPage(threadId);
  if (page.hasMore && page.oldestId === request.page.oldestId &&
      (cursorId(request.page) !== undefined || page.nextBefore === request.page.nextBefore)) return request;
  cancelOlderHistory(threadId);
}

export function syncOlderHistory(threadId: string): void {
  if (requestAtEdge(threadId)) chatStore.setPageLoading(threadId, true);
}

export function dropInflightHistory(): void {
  for (const threadId of pending.keys()) cancelOlderHistory(threadId, true);
}

export function requestOlderHistory(threadId: string, retry = false): void {
  if (requestAtEdge(threadId)) return;
  const page = chatStore.getPage(threadId);
  if (!page.hasMore || (page.failed && !retry)) return;
  const beforeId = cursorId(page);
  if (!beforeId && page.nextBefore === 0) return;
  const request = { page, timer: setTimeout(() => cancelOlderHistory(threadId, true), PAGE_TIMEOUT_MS) };
  pending.set(threadId, request);
  chatStore.setPageLoading(threadId, true);
  connection.send(encodeSessionHistory(threadId, PAGE_LIMIT, page.nextBefore, beforeId)).then(ok => {
    if (!ok && pending.get(threadId) === request) cancelOlderHistory(threadId, true);
  });
}

export function receiveOlderHistory(frame: ChatHistoryFrame): void {
  const { threadId, beforeId, before, nextBefore, messages } = frame;
  const request = requestAtEdge(threadId);
  if (!request || (beforeId !== undefined ? beforeId !== cursorId(request.page) : before !== request.page.nextBefore)) return;
  const added = chatStore.prependHistory(threadId, messages);
  const hasMore = frame.hasMore === true && nextBefore !== undefined;
  if (hasMore && !added && nextBefore <= request.page.nextBefore) {
    cancelOlderHistory(threadId, true);
    return;
  }
  forgetRequest(threadId);
  chatStore.setPage(threadId, {
    nextBefore: nextBefore ?? 0,
    hasMore,
    // An invisible page moves the journal cursor, not the oldest displayed id.
    countOnly: hasMore && !added,
  });
}
