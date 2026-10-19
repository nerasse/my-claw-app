import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { parseServerFrame } from '../protocol';
import { clearAllDrafts, clearDraft, draftAttachmentsOf, draftTextOf } from '../drafts';
import { sessionStore } from '../sessions';

/**
 * The draft of a conversation, on the surface that actually opens it.
 *
 * Opening a thread used to ask for a history page; since the delta sync it asks for a
 * `session.sync`, which carried no draft. The drawer announced unsent text from the listing and
 * nothing ever handed the text back, so the composer stayed empty -- and a send then dropped the
 * draft on the server, silently destroying it.
 */

const THREAD = 't-draft-restore';
const handlers = { activeThreadId: () => null } as unknown as ServerFrameHandlers;

function listed(hasDraft = false): void {
  sessionStore.replace([
    {
      threadId: THREAD,
      title: 'conversation',
      messageCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: '2026-01-01T00:00:00.000Z',
      ...(hasDraft ? { hasDraft: true } : {}),
    },
  ]);
}

function route(frame: Record<string, unknown>): void {
  // Through the parser: `parseServerFrame` is a whitelist, and a frame handed straight in as an
  // object hides a field it drops.
  const parsed = parseServerFrame(JSON.stringify(frame));
  expect(parsed).not.toBeNull();
  routeServerFrame(parsed!, handlers);
}

beforeEach(() => {
  clearAllDrafts();
  sessionStore.replace([]);
});

test('the sync that opens a thread hands its draft to the composer', () => {
  listed(true);
  route({
    type: 'session.sync.result',
    threadId: THREAD,
    entries: [],
    leaf: null,
    head: null,
    draft: 'ce que j ecrivais hier',
  });

  expect(draftTextOf(THREAD)).toBe('ce que j ecrivais hier');
});

test('a sync with no draft leaves what is typed here alone', () => {
  clearDraft(THREAD);
  // A delta is work arriving under the owner's eyes, not a page: it never carries a draft, and
  // the router must not read that absence as "nothing to keep".
  route({ type: 'session.sync.result', threadId: THREAD, entries: [], leaf: null, head: null });
  expect(draftTextOf(THREAD)).toBe('');
});

test('a draft typed elsewhere appears in the drawer, and goes when it is cleared', () => {
  listed(false);
  route({ type: 'draft.changed', threadId: THREAD, text: 'ecrit sur le telephone', ts: 1 });
  expect(sessionStore.getActiveSnapshot()[0]?.hasDraft).toBe(true);
  expect(draftTextOf(THREAD)).toBe('ecrit sur le telephone');

  route({ type: 'draft.changed', threadId: THREAD, text: '', ts: 2 });
  expect(sessionStore.getActiveSnapshot()[0]?.hasDraft).toBeUndefined();
  expect(draftTextOf(THREAD)).toBe('');
});

test('a sent message clears the badge that advertised its draft', () => {
  // The sender is never echoed the server's clear (broadcastExcept), so its own row has to hear
  // it from the composer that just emptied itself.
  listed(true);
  clearDraft(THREAD);
  expect(sessionStore.getActiveSnapshot()[0]?.hasDraft).toBeUndefined();
});

test('the files of a composer ride the sync that opens it, and the server list is what removes them', () => {
  listed(true);
  route({
    type: 'session.sync.result',
    threadId: THREAD,
    entries: [],
    leaf: null,
    head: null,
    files: [
      { id: 'media-1', filename: 'photo.png', type: 'image', mimeType: 'image/png', sizeBytes: 3, ts: '2026-01-01T00:00:00.000Z' },
    ],
  });
  expect(draftAttachmentsOf(THREAD).map(chip => [chip.mediaId, chip.uri])).toEqual([['media-1', '']]);

  // A chip removed on another device travels as the authoritative list, empty included.
  route({ type: 'draft.files.changed', threadId: THREAD, files: [], ts: 2 });
  expect(draftAttachmentsOf(THREAD)).toEqual([]);
});
