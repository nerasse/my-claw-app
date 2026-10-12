import { DEFAULT_SERVER_URL, nextPlaybackRate, parseCollapsedFolders, parsePlaybackRate, prefs } from '../prefs';
import { deviceBridge } from '../nativeBridge';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

beforeEach(() => {
  jest.clearAllMocks();
  bridge.prefsGetAll.mockResolvedValue({});
});

describe('prefs.hydrate', () => {
  test('falls back to defaults when nothing is stored: a new install has no address', async () => {
    const loaded = await prefs.hydrate();
    expect(loaded).toEqual({ themeMode: 'system', serverUrl: '', lastThreadId: null, updateOnMobileData: false, chatFontScale: 1, collapsedFolders: [], setupSkipped: [], playbackRate: 1 });
    expect(DEFAULT_SERVER_URL).toBe('');
    expect(bridge.prefsSet).not.toHaveBeenCalled();
    expect(prefs.isHydrated()).toBe(true);
  });

  test('ignores a corrupted theme mode and a blank url', async () => {
    bridge.prefsGetAll.mockResolvedValueOnce({ themeMode: 'neon', serverUrl: '   ', lastThreadId: '' });
    const loaded = await prefs.hydrate();
    expect(loaded).toEqual({ themeMode: 'system', serverUrl: '', lastThreadId: null, updateOnMobileData: false, chatFontScale: 1, collapsedFolders: [], setupSkipped: [], playbackRate: 1 });
    expect(bridge.prefsSet).not.toHaveBeenCalled();
  });

  test('reads back the folders that were folded away', async () => {
    bridge.prefsGetAll.mockResolvedValueOnce({ collapsedFolders: 'f2,f1' });
    const loaded = await prefs.hydrate();
    expect(loaded.collapsedFolders).toEqual(['f2', 'f1']);
  });

  test('an empty or absent folded list is no folders folded', async () => {
    expect(parseCollapsedFolders(undefined)).toEqual([]);
    expect(parseCollapsedFolders('')).toEqual([]);
    await expect(prefs.hydrate()).resolves.toMatchObject({ collapsedFolders: [], setupSkipped: [], playbackRate: 1 });
  });

  test('a broken bridge leaves the app on defaults instead of throwing', async () => {
    bridge.prefsGetAll.mockRejectedValueOnce(new Error('no native module'));
    await expect(prefs.hydrate()).resolves.toMatchObject({ themeMode: 'system' });
  });
});

describe('prefs.set', () => {
  test('a folded list is stored as one comma-separated value', async () => {
    await prefs.hydrate();
    prefs.set('collapsedFolders', ['f1', 'f2']);
    expect(bridge.prefsSet).toHaveBeenCalledWith('collapsedFolders', 'f1,f2');

    prefs.set('collapsedFolders', []);
    expect(bridge.prefsSet).toHaveBeenLastCalledWith('collapsedFolders', '');
  });

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

describe('playback speed', () => {
  test('steps 1, 1.1, 1.2, 1.3, 1.5, 2, then wraps to 1', () => {
    const seen = [1];
    for (let i = 0; i < 6; i += 1) seen.push(nextPlaybackRate(seen[seen.length - 1]));
    expect(seen).toEqual([1, 1.1, 1.2, 1.3, 1.5, 2, 1]);
  });

  test('a speed off the list goes back to normal', () => {
    expect(nextPlaybackRate(1.75)).toBe(1);
  });

  test('a stored speed is read back only when it is one of the steps', () => {
    expect(parsePlaybackRate('1.5')).toBe(1.5);
    expect(parsePlaybackRate('1.7')).toBe(1);
    expect(parsePlaybackRate('fast')).toBe(1);
    expect(parsePlaybackRate(undefined)).toBe(1);
  });

  test('hydrate restores the speed the owner left', async () => {
    bridge.prefsGetAll.mockResolvedValueOnce({ playbackRate: '1.3' });
    expect((await prefs.hydrate()).playbackRate).toBe(1.3);
  });
});
