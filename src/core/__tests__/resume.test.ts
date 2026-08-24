import { resumeFrames } from '../resume';

const typesOf = (frames: string[]): string[] => frames.map(frame => JSON.parse(frame).type as string);

describe('resumeFrames', () => {
  test('a reconnect refetches the conversation on screen, not only the catalogs', () => {
    const frames = resumeFrames('t1', 50);
    // The whole point: frames pushed while the socket was down are gone, so the turns this
    // window missed can only come back as a history page.
    expect(typesOf(frames)).toEqual([
      'session.list',
      'commands.list',
      'model.list',
      'jobs.list',
      'session.history',
      'subagents.list',
      'model.get',
    ]);
    const history = JSON.parse(frames[4]!);
    expect(history).toMatchObject({ threadId: 't1', limit: 50 });
    // The newest page, never an older one: `before` is what asks for a page further back.
    expect(history.before).toBeUndefined();
  });

  test('no conversation open, nothing to refetch', () => {
    expect(typesOf(resumeFrames(null, 50))).toEqual(['session.list', 'commands.list', 'model.list', 'jobs.list']);
  });
});
