import { deviceBridge, deviceEvents } from '../nativeBridge';
import { apnsSnapshot, handleAPNsResult, subscribeAPNs } from '../apns.ios';
import { connection } from '../connection';
import { parseServerFrame } from '../protocol';
jest.mock('../connection', () => ({ connection: { send: jest.fn() } }));
const send = connection.send as jest.Mock;

test('a relay enrollment is ready only after durable acceptance and the matching server acknowledgement', async () => {
  send.mockResolvedValue(true); const unsubscribe = subscribeAPNs();
  deviceEvents.emit('claw:push:registration', { permission: 'granted', status: 'registered', registrationId: 'new-id', secret: 'secret-fixture' });
  await Promise.resolve();
  expect(apnsSnapshot().serverStatus).toBe('pending');
  expect(apnsSnapshot().secret).toBeUndefined();
  const wrong = parseServerFrame(JSON.stringify({ type: 'notifications.apns.result', ok: true, registrationId: 'old-id' }));
  if (wrong?.type === 'notifications.apns.result') handleAPNsResult(wrong);
  expect(apnsSnapshot().serverStatus).toBe('pending');
  const correct = parseServerFrame(JSON.stringify({ type: 'notifications.apns.result', ok: true, registrationId: 'new-id' }));
  if (correct?.type === 'notifications.apns.result') handleAPNsResult(correct);
  expect(apnsSnapshot().serverStatus).toBe('ready'); unsubscribe();
});
test('a full native queue exposes a failed notification registration', async () => {
  send.mockResolvedValue(false); const unsubscribe = subscribeAPNs();
  deviceEvents.emit('claw:push:registration', { permission: 'granted', status: 'registered', registrationId: 'another-id', secret: 'fixture' });
  await Promise.resolve();
  expect(apnsSnapshot().serverStatus).toBe('failed');
  expect(deviceBridge.revokeAPNs).not.toHaveBeenCalled(); unsubscribe();
});
