/**
 * Native modules the app talks to. Jest runs without the Android binary, so every
 * TurboModule the bundle imports at load time has to exist here or the suite dies
 * before a single test runs.
 */
jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: { setString: jest.fn(), getString: jest.fn(() => Promise.resolve('')) },
}));

// The shipped mock exposes everything under `default`; spread it so named imports resolve.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('react-native-marked', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    Renderer: class {
      getKey() {
        return 'k';
      }
    },
    useMarkdown: value => [React.createElement(Text, { key: 'md' }, String(value))],
  };
});

// react-native-svg needs the native binary; swap its render tree for plain Views in tests.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => props => React.createElement(View, props);
  return { __esModule: true, default: stub(), Svg: stub(), Path: stub() };
});

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn((_options, callback) => callback({ didCancel: true })),
  launchImageLibrary: jest.fn((_options, callback) => callback({ didCancel: true })),
}));

// The SAF file picker lives in our own Kotlin bridge, like the rest of the native modules.
jest.mock('./src/core/nativeBridge', () => ({
  deviceBridge: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendMessage: jest.fn(() => Promise.resolve(true)),
    pendingCount: jest.fn(() => Promise.resolve(0)),
    clearOutbox: jest.fn(() => Promise.resolve()),
    getConnectionState: jest.fn(() => Promise.resolve('connected')),
    getDeviceInfo: jest.fn(() => Promise.resolve({ deviceId: 'dev-test', token: 'token-test' })),
    getCapabilities: jest.fn(() =>
      Promise.resolve({ accessibility: false, notificationListener: false, wssConnection: true }),
    ),
    prefsGetAll: jest.fn(() => Promise.resolve({})),
    prefsSet: jest.fn(() => Promise.resolve()),
    pickFile: jest.fn(() => Promise.resolve([])),
  },
  deviceEvents: require('react-native').DeviceEventEmitter,
}));

jest.mock('./src/core/device', () => ({
  getCapabilities: jest.fn(() =>
    Promise.resolve({ accessibility: false, notificationListener: false, wssConnection: true }),
  ),
  getDeviceInfo: jest.fn(() => Promise.resolve({ deviceId: 'dev-test', token: 'token-test' })),
  getAccessibilitySnapshot: jest.fn(() => Promise.resolve(null)),
  performAccessibilityAction: jest.fn(() => Promise.resolve(true)),
  onNotification: jest.fn(() => ({ remove: jest.fn() })),
}));
