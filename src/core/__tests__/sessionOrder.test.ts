/**
 * The drawer lists the conversation last written in first (owner, 2026-10-04): the server sorts its
 * listing that way, and the app moves a conversation up itself the moment a message is sent into
 * it, here or from another window. Before, the row stayed where it was until something else asked
 * for the listing, so the drawer read as frozen.
 */
const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { chatStore } from '../chat';
import { drawerSections } from '../folders';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { FolderSummary, SessionSummary } from '../protocol';
import { sessionStore } from '../sessions';

const summary = (threadId: string, extra: Partial<SessionSummary> = {}): SessionSummary => ({
  threadId,
  title: threadId,
  messageCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const order = (): string[] => sessionStore.getActiveSnapshot().map(entry => entry.threadId);

function route(threadId: string, active: string | null = null): void {
  const handlers = { activeThreadId: () => active, subagentParent: () => null } as unknown as ServerFrameHandlers;
  routeServerFrame({ type: 'chat.user', threadId, id: `u-${threadId}`, text: 'depuis le telephone' }, handlers);
}

beforeEach(() => {
  chatStore.clearAll();
  sessionStore.replace([summary('a'), summary('b'), summary('c')]);
});

describe('sessionStore.touch', () => {
  test('lifts the conversation to the top and stamps it, leaving the others in their order', () => {
    const before = Date.now();
    sessionStore.touch('c', 'salut');

    expect(order()).toEqual(['c', 'a', 'b']);
    const touched = sessionStore.getActiveSnapshot()[0]!;
    expect(Date.parse(touched.lastMessageAt!)).toBeGreaterThanOrEqual(before);
    // Its name is the server's, not the text that was just sent.
    expect(touched.title).toBe('c');
  });

  test('lists a conversation the server has not listed yet, named after what was sent', () => {
    sessionStore.touch('neuve', '  premiere   question ');

    expect(order()).toEqual(['neuve', 'a', 'b', 'c']);
    expect(sessionStore.getActiveSnapshot()[0]!.title).toBe('premiere question');
  });

  test('hands the drawer a new snapshot, even for the row already on top', () => {
    const first = sessionStore.getActiveSnapshot();
    sessionStore.touch('a', 'x');
    expect(sessionStore.getActiveSnapshot()).not.toBe(first);
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  test('moves it to the top of its own folder, and the unfiled ones keep theirs', () => {
    const folder: FolderSummary = { id: 'f1', name: 'CubeFlow', rank: 0 };
    sessionStore.replace([summary('a', { folderId: 'f1' }), summary('b'), summary('c', { folderId: 'f1' })], [folder]);

    sessionStore.touch('c', 'x');

    const sections = drawerSections(sessionStore.getActiveSnapshot(), [folder], null);
    expect(sections.map(section => section.rows.map(row => row.threadId))).toEqual([['c', 'a'], ['b']]);
  });
});

describe('a message mirrored from another window', () => {
  test('lifts its conversation like a message sent from here', () => {
    route('b');
    expect(order()).toEqual(['b', 'a', 'c']);
  });

  test('lifts it too when it is the conversation open on this screen', () => {
    route('c', 'c');
    expect(order()).toEqual(['c', 'a', 'b']);
  });

  test('never lists a sub-agent thread', () => {
    route('sub-0123456789abcdef');
    expect(order()).toEqual(['a', 'b', 'c']);
  });
});
