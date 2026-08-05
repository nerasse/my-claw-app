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

// DeviceEventEmitter stays real so tests can push frames through the actual listener path.
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
