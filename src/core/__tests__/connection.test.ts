import { DeviceEventEmitter } from 'react-native';
import { connection } from '../connection';
import { deviceBridge } from '../nativeBridge';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('connection.send', () => {
  test('reports the native result so the UI can flag a lost frame', async () => {
    bridge.sendMessage.mockResolvedValueOnce(true);
    await expect(connection.send('{"type":"ping"}')).resolves.toBe(true);

    bridge.sendMessage.mockResolvedValueOnce(false);
    await expect(connection.send('{"type":"ping"}')).resolves.toBe(false);
  });

  test('a native rejection is a failure, not a crash', async () => {
    bridge.sendMessage.mockRejectedValueOnce(new Error('bridge down'));
    await expect(connection.send('{"type":"ping"}')).resolves.toBe(false);
  });
});

describe('connection listeners', () => {
  test('parsed frames reach frame listeners and garbage does not', () => {
    const frames: unknown[] = [];
    const off = connection.onFrame(frame => frames.push(frame));

    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify({ type: 'error', message: 'x' }) });
    DeviceEventEmitter.emit('claw:ws:message', { text: 'not a frame' });

    expect(frames).toEqual([{ type: 'error', message: 'x' }]);
    off();
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify({ type: 'error', message: 'y' }) });
    expect(frames).toHaveLength(1);
  });

  test('the outbox size is published from both the state and outbox events', () => {
    const sizes: number[] = [];
    const off = connection.onPending(size => sizes.push(size));

    DeviceEventEmitter.emit('claw:ws:state', { state: 'disconnected', pending: 3 });
    DeviceEventEmitter.emit('claw:ws:outbox', { pending: 0 });

    expect(sizes).toEqual([3, 0]);
    off();
  });
});
