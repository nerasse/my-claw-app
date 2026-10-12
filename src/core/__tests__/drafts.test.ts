import { connection } from '../connection';
import {
  applyRemoteDraft,
  clearAllDrafts,
  clearDraft,
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
