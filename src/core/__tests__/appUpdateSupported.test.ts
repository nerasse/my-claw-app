/**
 * The self-update replaces the running APK. A browser has no package installer, and its
 * "version" is the string `web`, so every release reads as newer: unguarded, a tab was offered
 * a 45 MB Android download it could never install. The flag is what the modal, the check effect
 * and the settings card are gated on, so it is worth pinning per platform.
 */
const loadSupported = (os: string): boolean => {
  let supported = false;
  jest.isolateModules(() => {
    // A minimal stand-in, not requireActual: importing the real react-native index here pulls
    // the dev-menu native spec in and throws before the flag can be read.
    jest.doMock('react-native', () => ({
      Platform: { OS: os, select: (spec: Record<string, unknown>) => spec[os] ?? spec.default },
      NativeModules: {},
      DeviceEventEmitter: { addListener: () => ({ remove: () => {} }) },
    }));
    // require inside isolateModules: the module reads Platform at import time.
    supported = (require('../appUpdateRuntime') as { appUpdateSupported: boolean }).appUpdateSupported;
  });
  return supported;
};

describe('appUpdateSupported', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('react-native');
  });

  it('is off in a browser', () => {
    expect(loadSupported('web')).toBe(false);
  });

  it('is on where an APK can be installed', () => {
    expect(loadSupported('android')).toBe(true);
  });
});
