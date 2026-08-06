/**
 * Native modules the app talks to. Jest runs without the Android binary, so every
 * TurboModule the bundle imports at load time has to exist here or the suite dies
 * before a single test runs.
 */
jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(),
    getString: jest.fn(() => Promise.resolve('')),
  },
}));

// The shipped mock exposes everything under `default`; spread it so named imports resolve.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The RN jest preset resolves platform files to 'ios', whose BackHandler is a no-op
// (BackHandler.ios.js). The real app runs BackHandler.android.js, which iterates the
// registered handlers and stops at the first that returns true. Keep a registry the tests
// can drive directly, so the hardware-back behaviour is testable at all.
jest.mock('react-native/Libraries/Utilities/BackHandler.ios', () => {
  const handlers = [];
  const mock = {
    exitApp: jest.fn(),
    addEventListener: jest.fn((_event, handler) => {
      handlers.push(handler);
      return {
        remove: () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) handlers.splice(index, 1);
        },
      };
    }),
    removeEventListener: jest.fn(),
    __handlers: handlers,
  };
  return { __esModule: true, default: mock };
});

jest.mock('react-native-marked', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const FakeMarkdown = ({ value }) =>
    React.createElement(Text, { key: 'md' }, String(value));
  return {
    __esModule: true,
    default: FakeMarkdown,
    Renderer: class {
      getKey() {
        return 'k';
      }
    },
    useMarkdown: value => [
      React.createElement(Text, { key: 'md' }, String(value)),
    ],
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
  launchImageLibrary: jest.fn((_options, callback) =>
    callback({ didCancel: true }),
  ),
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
    getDeviceInfo: jest.fn(() =>
      Promise.resolve({ deviceId: 'dev-test', token: 'token-test' }),
    ),
    getCapabilities: jest.fn(() =>
      Promise.resolve({
        accessibility: false,
        notificationListener: false,
        wssConnection: true,
      }),
    ),
    prefsGetAll: jest.fn(() => Promise.resolve({})),
    prefsSet: jest.fn(() => Promise.resolve()),
    pickFile: jest.fn(() => Promise.resolve([])),
    prepareFile: jest.fn(() =>
      Promise.resolve({ uri: 'file:///cache/prepared', name: 'file', size: 0 }),
    ),
    uploadFile: jest.fn(() =>
      Promise.resolve({ status: 200, body: JSON.stringify({ id: 'media-1' }) }),
    ),
    downloadFile: jest.fn(() =>
      Promise.resolve({ path: '/storage/Pictures/my-claw/file' }),
    ),
  },
  deviceEvents: require('react-native').DeviceEventEmitter,
}));

jest.mock('./src/core/device', () => ({
  getCapabilities: jest.fn(() =>
    Promise.resolve({
      accessibility: false,
      notificationListener: false,
      wssConnection: true,
    }),
  ),
  getDeviceInfo: jest.fn(() =>
    Promise.resolve({ deviceId: 'dev-test', token: 'token-test' }),
  ),
  getAccessibilitySnapshot: jest.fn(() => Promise.resolve(null)),
  performAccessibilityAction: jest.fn(() => Promise.resolve(true)),
  onNotification: jest.fn(() => ({ remove: jest.fn() })),
}));

// Node's URL is spec compliant, the device's is not: RN ships a partial polyfill whose `host`
// only matches http(s). Using Node's here hid a bug that only showed up on a phone, so tests
// run against the same URL the app gets.
// The top level export resolves to Node's real URL here; the device gets this polyfill, and
// that difference is exactly what we want under test.
// eslint-disable-next-line @react-native/no-deep-imports
global.URL = require('react-native/Libraries/Blob/URL').URL;
