import { bootFrames, resumeFrames } from '../resume';
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

describe('bootFrames', () => {
  // The JS restarted under a socket the native service kept up: no transition to `connected` is
  // coming, so the boot is the only chance to resume. It used to send the list alone, the catalogue
  // was never asked for, and every send opened the setup assistant (2026-10-06).
  test('a JS that starts on a live socket resumes in full, the catalogue included', () => {
    const frames = bootFrames('connected', 't1');
    expect(frames).toEqual(resumeFrames('t1'));
    expect(typesOf(frames)).toContain('model.list');
  });

  test('without an open thread, the catalogs still come', () => {
    expect(typesOf(bootFrames('connected', null))).toEqual(['session.list', 'commands.list', 'model.list', 'jobs.list']);
  });

  test('a socket still to come asks for the list alone, its connect resumes the rest', () => {
    expect(typesOf(bootFrames('disconnected', 't1'))).toEqual(['session.list']);
    expect(typesOf(bootFrames('connecting', 't1'))).toEqual(['session.list']);
  });
});
