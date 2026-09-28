/**
 * Walking a sub-agent tree: a cron run, one of its volets, the browser task the volet delegated.
 * Each level opens from the one on screen, and back returns one level at a time, as what it was.
 */

import { backFrom, backLabel, reachableFrom, rostersFor, stackedOn, type StackedView } from '../subagentStack';
import type { SubAgentEntry } from '../protocol';

const CRON = 'cron-0123456789ab-1790571620919';
const volet: StackedView = { threadId: 'sub-volet', id: 'subagent/veille-3-wttj', parentThreadId: CRON };

const entry = (id: string, visibility: SubAgentEntry['visibility'] = 'global'): SubAgentEntry => ({
  threadId: `sub-${id}`, id: `subagent/${id}`, displayName: id, type: 'general', messageCount: 1, status: 'idle', visibility, createdAt: '2026-09-28T05:00:00Z',
});

describe('a sub-agent tree, level by level', () => {
  test('a browser task opened from a volet stacks on it, and back returns to the volet', () => {
    const browser = stackedOn<StackedView>({ threadId: 'sub-browser', id: 'subagent/browser-c3d4', parentThreadId: 'sub-volet' }, volet);
    expect(browser.parent).toBe(volet);
    expect(backFrom(browser)).toEqual({ view: volet });
    // The back row names the volet, not a conversation title.
    expect(backLabel(browser, () => 'conversation')).toBe('veille-3-wttj');
  });

  test('back from the volet leaves the tree for the run it belongs to', () => {
    expect(backFrom(volet)).toEqual({ threadId: CRON });
    expect(backLabel(volet, id => (id === CRON ? 'career : veille' : '?'))).toBe('career : veille');
  });

  test('a sibling picked from the roster is not stacked on the agent on screen', () => {
    const sibling = stackedOn<StackedView>({ threadId: 'sub-other', id: 'subagent/veille-4', parentThreadId: CRON }, volet);
    expect(sibling.parent).toBeUndefined();
    expect(backFrom(sibling)).toEqual({ threadId: CRON });
  });

  test('a sub-agent chat asks for its parent roster and its own; a conversation for its own', () => {
    expect(rostersFor('sub-volet', CRON)).toEqual([CRON, 'sub-volet']);
    expect(rostersFor(CRON, null)).toEqual([CRON]);
    expect(rostersFor(CRON, CRON)).toEqual([CRON]);
  });

  test('a card opens what its own thread started first, then what the parent reaches, once each', () => {
    const own = [entry('browser-c3d4', 'private'), entry('shared')];
    const parent = [entry('shared'), entry('veille-4')];
    expect(reachableFrom(own, parent).map(a => a.id)).toEqual(['subagent/browser-c3d4', 'subagent/shared', 'subagent/veille-4']);
  });
});
