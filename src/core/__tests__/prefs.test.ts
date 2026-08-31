import { DEFAULT_SERVER_URL, prefs } from '../prefs';
import { deviceBridge } from '../nativeBridge';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

beforeEach(() => {
  jest.clearAllMocks();
  bridge.prefsGetAll.mockResolvedValue({});
});

describe('prefs.hydrate', () => {
  test('falls back to defaults when nothing is stored', async () => {
    const loaded = await prefs.hydrate();
    expect(loaded).toEqual({ themeMode: 'system', serverUrl: DEFAULT_SERVER_URL, lastThreadId: null, updateOnMobileData: false });
    expect(prefs.isHydrated()).toBe(true);
  });

  test('reads back stored values', async () => {
    bridge.prefsGetAll.mockResolvedValueOnce({
      themeMode: 'dark',
      serverUrl: 'wss://claw.example/my-claw-app',
      lastThreadId: 'thread-9',
    });
    const loaded = await prefs.hydrate();
    expect(loaded).toEqual({ themeMode: 'dark', serverUrl: 'wss://claw.example/my-claw-app', lastThreadId: 'thread-9', updateOnMobileData: false });
  });

  test('ignores a corrupted theme mode and an empty url', async () => {
    bridge.prefsGetAll.mockResolvedValueOnce({ themeMode: 'neon', serverUrl: '   ', lastThreadId: '' });
    const loaded = await prefs.hydrate();
    expect(loaded).toEqual({ themeMode: 'system', serverUrl: DEFAULT_SERVER_URL, lastThreadId: null, updateOnMobileData: false });
  });

  test('a broken bridge leaves the app on defaults instead of throwing', async () => {
    bridge.prefsGetAll.mockRejectedValueOnce(new Error('no native module'));
    await expect(prefs.hydrate()).resolves.toMatchObject({ themeMode: 'system' });
  });
});

describe('prefs.set', () => {
  test('writes through and notifies once per real change', async () => {
    await prefs.hydrate();
    const listener = jest.fn();
    const off = prefs.subscribe(listener);

    prefs.set('themeMode', 'dark');
    prefs.set('themeMode', 'dark');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(prefs.get().themeMode).toBe('dark');
    expect(bridge.prefsSet).toHaveBeenCalledWith('themeMode', 'dark');
    expect(bridge.prefsSet).toHaveBeenCalledTimes(1);
    off();
  });

  test('clearing the last thread removes the key', async () => {
    await prefs.hydrate();
    prefs.set('lastThreadId', 'abc');
    prefs.set('lastThreadId', null);
    expect(bridge.prefsSet).toHaveBeenLastCalledWith('lastThreadId', null);
  });

  test('a failed write never rejects into the UI', async () => {
    await prefs.hydrate();
    bridge.prefsSet.mockRejectedValueOnce(new Error('disk full'));
    expect(() => prefs.set('serverUrl', 'ws://localhost:9/my-claw-app')).not.toThrow();
    await Promise.resolve();
  });
});
