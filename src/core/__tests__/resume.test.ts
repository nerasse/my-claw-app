import { resumeFrames } from '../resume';
import { chatStore } from '../chat';

const typesOf = (frames: string[]): string[] => frames.map(frame => JSON.parse(frame).type as string);

beforeEach(() => {
  chatStore.clearAll();
});

describe('resumeFrames', () => {
  test('a reconnect syncs the conversation on screen with a delta request', () => {
    // Simulate having received some history already
    chatStore.seedHistory('t1', [
      { id: 'entry-1', role: 'user', text: 'hello', ts: '2026-01-01T00:00:00.000Z', attachments: [] },
      { id: 'entry-2', role: 'assistant', text: 'hi', ts: '2026-01-01T00:00:01.000Z', attachments: [] },
    ]);

    const frames = resumeFrames('t1');
    expect(typesOf(frames)).toEqual([
      'session.list',
      'commands.list',
      'model.list',
      'jobs.list',
      'session.sync',
      'subagents.list',
      'model.get',
    ]);
    const sync = JSON.parse(frames[4]!);
    // Asks for entries since the last one we have
    expect(sync).toMatchObject({ threadId: 't1', since: 'entry-2' });
  });

  test('a fresh thread syncs with null cursor (start from beginning)', () => {
    const frames = resumeFrames('t1');
    const sync = JSON.parse(frames[4]!);
    expect(sync).toMatchObject({ threadId: 't1' });
    // null cursor means "give me everything from the start"
    expect(sync.since).toBeNull();
    expect(sync.leaf).toBeUndefined();
  });

  test('no conversation open, nothing to sync', () => {
    expect(typesOf(resumeFrames(null))).toEqual(['session.list', 'commands.list', 'model.list', 'jobs.list']);
  });
});
