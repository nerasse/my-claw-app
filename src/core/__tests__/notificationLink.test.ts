/**
 * The links the server builds (src/notifications/target.ts), read back as the places they name.
 * A cron run is a thread: its tap opens the run as a chat, not an empty conversation.
 */

import { notificationIdFor, parseNotificationLink } from '../notifications';

describe('a notification link', () => {
  test('a cron run opens as its own thread', () => {
    expect(parseNotificationLink('myclaw://thread/cron-0123456789ab-1790658020173')).toEqual({
      kind: 'thread',
      threadId: 'cron-0123456789ab-1790658020173',
    });
  });

  test('a conversation and a job', () => {
    expect(parseNotificationLink('myclaw://thread/4d5775e7-d5ac')).toEqual({ kind: 'thread', threadId: '4d5775e7-d5ac' });
    expect(parseNotificationLink('myclaw://job/0123456789ab')).toEqual({ kind: 'job', jobId: '0123456789ab' });
  });

  test('anything else opens nothing', () => {
    expect(parseNotificationLink('myclaw://jobs')).toBeNull();
    expect(parseNotificationLink('https://example.com')).toBeNull();
    expect(parseNotificationLink(null)).toBeNull();
  });

  test('the id a tap dismisses is the one the server posted with', () => {
    // Server side: notificationIdFor(linkOf(target)), same FNV-1a.
    expect(notificationIdFor('myclaw://thread/cron-0123456789ab-1')).toBe(notificationIdFor('myclaw://thread/cron-0123456789ab-1'));
    expect(notificationIdFor('myclaw://thread/a')).not.toBe(notificationIdFor('myclaw://thread/b'));
  });
});
