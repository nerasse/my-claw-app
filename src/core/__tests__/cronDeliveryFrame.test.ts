/**
 * The frame a scheduled job's report arrives on.
 *
 * It used to arrive as a plain `chat.message`, which the thread drew as a bubble the owner had
 * typed: a morning job put its report in the owner's own voice until the conversation was
 * reloaded and the log's `cron` marker took over (owner, 2026-11-17). The frame carries the
 * marker now, and the run it came from, so the live card is the card the log replays -- with a
 * door to the run.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore } from '../chat';
import { sessionStore } from '../sessions';
import { isCronDelivery, isSubAgentReturn } from '../subagentReturn';
import type { ChatCronDeliveryFrame } from '../protocol';

const THREAD = 'my-claw-app/thread/owner/main';

const handlers = {
  activeThreadId: () => THREAD,
} as unknown as ServerFrameHandlers;

const delivery = (over: Partial<ChatCronDeliveryFrame> = {}): ChatCronDeliveryFrame => ({
  type: 'chat.cron.delivery',
  threadId: THREAD,
  id: 'cron-1',
  text: '[Cron: veille]\n\n3 offres',
  ts: '2026-11-17T08:00:00.000Z',
  job: 'veille',
  cadence: 'every 1h',
  runId: 'cron-0123456789ab-1794938597013',
  ...over,
});

beforeEach(() => {
  chatStore.clearAll();
  sessionStore.replace([]);
});

describe('frameRouter cron delivery', () => {
  it('draws the delivery card, with the job, its cadence and the run', () => {
    routeServerFrame(delivery(), handlers);
    const item = chatStore.getItems(THREAD).find(entry => entry.id === 'cron-1')!;
    expect(item.kind).toBe('text');
    expect(isCronDelivery(item)).toBe(true);
    // Never a sub-agent's return: the two cards are different, and this one is a job's.
    expect(isSubAgentReturn(item)).toBe(false);
    if (item.kind !== 'text') throw new Error('a delivery is a text item');
    expect(item.from).toEqual({
      label: 'veille',
      kind: 'cron',
      cadence: 'every 1h',
      runId: 'cron-0123456789ab-1794938597013',
    });
  });

  it('keeps one card for one delivery, however many times the frame lands', () => {
    routeServerFrame(delivery(), handlers);
    routeServerFrame(delivery(), handlers);
    expect(chatStore.getItems(THREAD).filter(entry => entry.id === 'cron-1')).toHaveLength(1);
  });

  it('carries a failed run over, and a delivery written before the run existed', () => {
    routeServerFrame(delivery({ id: 'cron-2', status: 'error', runId: undefined }), handlers);
    const item = chatStore.getItems(THREAD).find(entry => entry.id === 'cron-2')!;
    if (item.kind !== 'text') throw new Error('a delivery is a text item');
    expect(item.from).toEqual({ label: 'veille', kind: 'cron', cadence: 'every 1h', status: 'error' });
  });
});
