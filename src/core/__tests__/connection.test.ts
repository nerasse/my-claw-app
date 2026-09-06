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

  test('a listener that throws does not take the process, and is reported', () => {
    // parseServerFrame only validates `type`. A frame that announces itself correctly and lacks a
    // field the handler walks into used to throw out of a native module callback, which is a crash
    // on Android -- and the app relaunched, reconnected, was handed the same frame, and crashed
    // again. A boot loop no reinstall fixes, driven by one bad frame on the server.
    const errors: Array<{ message: string; label: string }> = [];
    connection.setListenerErrorReporter((error, label) => errors.push({ message: error.message, label }));

    const seen: unknown[] = [];
    const offBad = connection.onFrame(() => {
      throw new Error('missing field');
    });
    const offGood = connection.onFrame(frame => seen.push(frame));

    expect(() =>
      DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify({ type: 'error', message: 'x' }) }),
    ).not.toThrow();

    // The other listeners still ran: one bad handler is not the whole app.
    expect(seen).toEqual([{ type: 'error', message: 'x' }]);
    expect(errors).toEqual([{ message: 'missing field', label: 'error' }]);

    offBad();
    offGood();
    connection.setListenerErrorReporter(() => {});
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
