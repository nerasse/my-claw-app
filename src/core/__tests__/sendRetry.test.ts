import { retryDelayAfter, sendsToRetry } from '../sendRetry';
import type { ChatItem } from '../chat';

const user = (id: string, extra: Partial<ChatItem> = {}): ChatItem =>
  ({ kind: 'text', id, role: 'user', text: id, attachments: [], streaming: false, ts: 1, ...extra }) as ChatItem;

describe('the sends the app retries itself', () => {
  test('only the ones that never got out', () => {
    const items = [
      user('sent'),
      user('lost', { queuedReason: 'undelivered', queuedSince: 5 }),
      // The server holds these two: it has them, and a turn is coming.
      user('parked', { queuedReason: 'injection', queuedSince: 5 }),
      user('held', { queuedReason: 'compaction', queuedSince: 5 }),
      { kind: 'tool', id: 't1', name: 'bash', args: {}, output: '', ok: true, truncated: false, ts: 2 } as ChatItem,
    ];
    expect(sendsToRetry(items).map(item => item.id)).toEqual(['lost']);
  });

  test('the wait opens up as the send keeps failing, and never stops', () => {
    expect(retryDelayAfter(0)).toBe(5_000);
    expect(retryDelayAfter(14_999)).toBe(5_000);
    expect(retryDelayAfter(15_000)).toBe(15_000);
    expect(retryDelayAfter(59_999)).toBe(15_000);
    expect(retryDelayAfter(60_000)).toBe(30_000);
    expect(retryDelayAfter(60 * 60 * 1000)).toBe(30_000);
  });
});
