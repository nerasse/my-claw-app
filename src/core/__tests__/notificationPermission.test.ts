/**
 * Who is allowed to ask the browser for the notification permission, and when.
 *
 * The connect frame used to ask outright. A browser only grants from a user gesture: Firefox
 * refuses `requestPermission()` outside one, and Chrome spends its single prompt on a dialog
 * nobody is looking at -- after which the answer is remembered as "no". That is why the two web
 * windows of this owner had no push endpoint at all while the phone had one, and why a question
 * waiting on him reached the phone's tray and nothing on the desktop.
 *
 * Android has no permission on this path (the distributor owns the registration), reports
 * `unavailable`, and must keep registering on every connect as it always did.
 */

const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

const mockRegisterForPush = jest.fn((key: string) => Promise.resolve({ ok: true, key }));
const mockPermission = { value: 'unavailable' as 'granted' | 'denied' | 'default' | 'unavailable' };
jest.mock('../notifications', () => ({
  registerForPush: (key: string) => mockRegisterForPush(key),
  notificationPermission: () => mockPermission.value,
}));

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';

const handlers = {
  activeThreadId: () => null,
  subagentParent: () => null,
  setVapidKey: () => {},
} as unknown as ServerFrameHandlers;

const info = { type: 'notifications.info', vapidPublicKey: 'BKEY' } as const;

beforeEach(() => {
  mockRegisterForPush.mockClear();
});

it('a browser that has not been asked yet is not asked here', () => {
  mockPermission.value = 'default';
  routeServerFrame(info as never, handlers);
  expect(mockRegisterForPush).not.toHaveBeenCalled();
});

it('a browser that said no is not asked again on every reconnect', () => {
  mockPermission.value = 'denied';
  routeServerFrame(info as never, handlers);
  expect(mockRegisterForPush).not.toHaveBeenCalled();
});

it('a browser that said yes re-registers on connect, so a rotated endpoint is picked up', () => {
  mockPermission.value = 'granted';
  routeServerFrame(info as never, handlers);
  expect(mockRegisterForPush).toHaveBeenCalledWith('BKEY');
});

it('a platform with no permission to ask for registers as it always did', () => {
  mockPermission.value = 'unavailable';
  routeServerFrame(info as never, handlers);
  expect(mockRegisterForPush).toHaveBeenCalledWith('BKEY');
});
