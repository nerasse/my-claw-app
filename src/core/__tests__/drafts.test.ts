import { connection } from '../connection';
import {
  applyRemoteDraft,
  applyServerDraft,
  applyServerFiles,
  clearAllDrafts,
  clearDraft,
  discardDraft,
  draftAttachmentsOf,
  draftTextOf,
  draftScope,
  setDraftScope,
  onRemoteDraft,
  queueDraftSync,
  saveDraft,
} from '../drafts';

const THREAD = 't-draft';

let sent: string[];

beforeEach(() => {
  jest.useFakeTimers();
  clearAllDrafts();
  sent = [];
  jest.spyOn(connection, 'send').mockImplementation(async (frame: string) => {
    sent.push(frame);
    return true;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function typed(): Array<{ type: string; threadId: string; text: string }> {
  return sent.map(frame => JSON.parse(frame) as { type: string; threadId: string; text: string });
}

describe('draft sync', () => {
  test('switching instances cancels pending sync and ignores a late screen cleanup', () => {
    setDraftScope('https://first.example');
    const previous = draftScope();
    saveDraft(THREAD, 'private draft', []);
    setDraftScope('https://second.example');
    saveDraft(THREAD, 'private draft', [], previous);
    jest.advanceTimersByTime(500);
    expect(draftTextOf(THREAD)).toBe('');
    expect(sent).toEqual([]);
  });
  test('a burst of keystrokes is one frame', () => {
    for (const text of ['b', 'bo', 'bon', 'bonj', 'bonjour']) queueDraftSync(THREAD, text);
    expect(sent).toHaveLength(0);

    jest.advanceTimersByTime(500);

    expect(typed()).toEqual([{ type: 'draft.set', threadId: THREAD, text: 'bonjour' }]);
  });

  test('the same text is never sent twice', () => {
    queueDraftSync(THREAD, 'stable');
    jest.advanceTimersByTime(500);
    queueDraftSync(THREAD, 'stable');
    jest.advanceTimersByTime(500);

    expect(sent).toHaveLength(1);
  });

  test('two conversations sync independently', () => {
    queueDraftSync(THREAD, 'ici');
    queueDraftSync('t-other', 'la-bas');
    jest.advanceTimersByTime(500);

    expect(typed()).toEqual([
      { type: 'draft.set', threadId: THREAD, text: 'ici' },
      { type: 'draft.set', threadId: 't-other', text: 'la-bas' },
    ]);
  });

  test('sending cancels the pending frame, which would otherwise resurrect the draft', () => {
    // The real order: text typed, send pressed 200ms later, debounce would fire after it.
    queueDraftSync(THREAD, 'presque fini');
    clearDraft(THREAD);
    jest.advanceTimersByTime(500);

    expect(sent).toHaveLength(0);
    expect(draftTextOf(THREAD)).toBe('');
  });

  test('a draft past the ceiling stays on this device', () => {
    queueDraftSync(THREAD, 'x'.repeat(64 * 1024 + 1));
    jest.advanceTimersByTime(500);

    expect(sent).toHaveLength(0);
  });

  test('a draft from the server is not echoed back to it', () => {
    applyRemoteDraft(THREAD, 'ecrit ailleurs');
    jest.advanceTimersByTime(500);
    expect(sent).toHaveLength(0);
    expect(draftTextOf(THREAD)).toBe('ecrit ailleurs');

    // And a local edit on top of it is news again.
    queueDraftSync(THREAD, 'ecrit ailleurs, complete ici');
    jest.advanceTimersByTime(500);
    expect(typed()).toEqual([{ type: 'draft.set', threadId: THREAD, text: 'ecrit ailleurs, complete ici' }]);
  });

  test('the page that replaces a thread fills an empty device', () => {
    // The bug this exists for: the app opened a conversation and asked for a sync, not a history
    // page, so the drawer said draft and the composer stayed empty -- forever.
    applyServerDraft(THREAD, 'ce que j ecrivais hier');
    expect(draftTextOf(THREAD)).toBe('ce que j ecrivais hier');
  });

  test('a page never overwrites text typed here and not yet acknowledged', () => {
    saveDraft(THREAD, 'frappe ici, pas encore partie', []);
    applyServerDraft(THREAD, 'la version d hier');
    expect(draftTextOf(THREAD)).toBe('frappe ici, pas encore partie');
  });

  test('a page does replace a copy that came from the server', () => {
    applyRemoteDraft(THREAD, 'ce que le serveur savait');
    applyServerDraft(THREAD, 'ce qu il sait maintenant');
    expect(draftTextOf(THREAD)).toBe('ce qu il sait maintenant');
  });

  test('a page that lands while a change of ours is in flight is ignored', () => {
    applyRemoteDraft(THREAD, 'texte que je viens d effacer');
    const seen: string[] = [];
    const stop = onRemoteDraft(threadId => seen.push(threadId));
    // Emptying the field is a change of ours waiting for its debounce; the page was built before.
    queueDraftSync(THREAD, '');
    applyServerDraft(THREAD, 'texte que je viens d effacer');
    stop();

    expect(seen).toEqual([]);
  });

  test('a draft consumed without a send is cleared on the server too', () => {
    // /new and /tag: no message reaches the server, so nothing in the send path clears its copy.
    saveDraft(THREAD, '/new', []);
    jest.advanceTimersByTime(500);
    discardDraft(THREAD);

    expect(draftTextOf(THREAD)).toBe('');
    expect(typed().at(-1)).toEqual({ type: 'draft.set', threadId: THREAD, text: '' });
  });

  test('an empty remote draft clears the local one', () => {
    applyRemoteDraft(THREAD, 'a effacer');
    applyRemoteDraft(THREAD, '');
    expect(draftTextOf(THREAD)).toBe('');
  });

  test('subscribers hear the thread that changed, and stop hearing after unsubscribe', () => {
    const seen: string[] = [];
    const stop = onRemoteDraft(threadId => seen.push(threadId));

    applyRemoteDraft(THREAD, 'un');
    applyRemoteDraft('t-other', 'deux');
    stop();
    applyRemoteDraft(THREAD, 'trois');

    expect(seen).toEqual([THREAD, 't-other']);
  });

  test('saving on unmount syncs what was written', () => {
    saveDraft(THREAD, 'ecrit puis quitte', []);
    jest.advanceTimersByTime(500);

    expect(typed()).toEqual([{ type: 'draft.set', threadId: THREAD, text: 'ecrit puis quitte' }]);
    expect(draftTextOf(THREAD)).toBe('ecrit puis quitte');
  });

  test('an emptied composer clears the draft everywhere', () => {
    saveDraft(THREAD, 'quelque chose', []);
    jest.advanceTimersByTime(500);
    saveDraft(THREAD, '', []);
    jest.advanceTimersByTime(500);

    expect(typed()[1]).toEqual({ type: 'draft.set', threadId: THREAD, text: '' });
    expect(draftTextOf(THREAD)).toBe('');
  });
});

describe('files in a draft', () => {
  const FILE = { id: 'media-1', filename: 'photo.png', type: 'image' as const, mimeType: 'image/png', sizeBytes: 3, ts: '2026-01-01T00:00:00.000Z' };

  beforeEach(() => {
    clearAllDrafts();
  });

  test('a chip the server knows arrives without a local copy', () => {
    applyServerFiles(THREAD, [FILE], 'replace');
    const [chip] = draftAttachmentsOf(THREAD);
    expect(chip).toMatchObject({ id: 'media-1', mediaId: 'media-1', uri: '', filename: 'photo.png', type: 'image' });
  });

  test('a page adds what this device did not know and removes nothing', () => {
    // A chip uploaded here left before the page was built: the page must not take it away.
    saveDraft(THREAD, '', [{ id: 'local', uri: 'file:///p.jpg', filename: 'p.jpg', type: 'image', mimeType: 'image/jpeg' }]);
    applyServerFiles(THREAD, [FILE], 'merge');
    expect(draftAttachmentsOf(THREAD).map(chip => chip.mediaId ?? chip.id)).toEqual(['local', 'media-1']);
  });

  test('the server list is authoritative, and keeps an upload that has no id yet', () => {
    saveDraft(THREAD, '', [
      { id: 'local-uploading', uri: 'file:///p.jpg', filename: 'p.jpg', type: 'image', mimeType: 'image/jpeg' },
      { id: 'gone', mediaId: 'gone', uri: '', filename: 'gone.png', type: 'image', mimeType: 'image/png' },
    ]);
    applyServerFiles(THREAD, [FILE], 'replace');
    expect(draftAttachmentsOf(THREAD).map(chip => chip.mediaId ?? chip.id)).toEqual(['media-1', 'local-uploading']);
    // The one the server kept from this device keeps its local uri: the thumb is already here.
    expect(draftAttachmentsOf(THREAD)[0]?.uri).toBe('');
  });

  test('a chip already known keeps its local uri when the server sends it back', () => {
    saveDraft(THREAD, 'legende', [
      { id: 'local', mediaId: 'media-1', uri: 'file:///p.jpg', filename: 'photo.png', type: 'image', mimeType: 'image/png' },
    ]);
    applyServerFiles(THREAD, [FILE], 'replace');
    const [chip] = draftAttachmentsOf(THREAD);
    expect(chip?.uri).toBe('file:///p.jpg');
    expect(chip?.id).toBe('local');
  });

  test('the drawer bit counts a file with no text', () => {
    applyServerFiles(THREAD, [FILE], 'replace');
    // setHasDraft is called by the store itself; the map is what the badge reads through it.
    expect(draftAttachmentsOf(THREAD)).toHaveLength(1);
    expect(draftTextOf(THREAD)).toBe('');
  });
});
