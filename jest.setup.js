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

// UnifiedPush talks to a distributor app over Android IPC; under Jest there is neither.
// The registration callback is kept on the mock so a test can replay what the distributor
// would have sent (see __tests__/Notifications.test.tsx).
jest.mock('expo-unified-push', () => {
  const listeners = [];
  return {
    __esModule: true,
    default: {
      getDistributors: jest.fn(() => [{ id: 'io.heckel.ntfy', name: 'ntfy', isInternal: false }]),
      getSavedDistributor: jest.fn(() => null),
      saveDistributor: jest.fn(),
      registerDevice: jest.fn(() => Promise.resolve()),
      unregisterDevice: jest.fn(() => Promise.resolve()),
    },
    checkPermissions: jest.fn(() => Promise.resolve(true)),
    requestPermissions: jest.fn(() => Promise.resolve('granted')),
    showLocalNotification: jest.fn(() => Promise.resolve()),
    subscribeDistributorMessages: jest.fn(fn => {
      listeners.push(fn);
      return () => {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
    __emitDistributorMessage: message => listeners.forEach(fn => fn(message)),
  };
});

// The shipped mock exposes everything under `default`; spread it so named imports resolve.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// expo-video's Android player is a native TurboModule; under Jest it becomes a stub player
// on a plain View, so VideoViewer renders without pulling in Media3.
jest.mock('expo-video', () => {
  const React = require('react');
  const player = () => ({
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    muted: false,
    currentTime: 0,
    duration: 0,
  });
  return {
    __esModule: true,
    useVideoPlayer: jest.fn(() => player()),
    VideoView: props => React.createElement('View', props),
    VideoPlayer: { prototype: {} },
  };
});

// Mock the native gesture handler module the app registers at boot, and reset any
// listeners between test files.
require('react-native-gesture-handler/jestSetup');

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

// The zoom library runs on worklets and the native gesture recognisers; under jest the
// gestures do not exist, so the image stands in for a Pressable that fires the single-tap
// callback the way the real component does on Android.
jest.mock('@likashefqet/react-native-image-zoom', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  const stub = props =>
    React.createElement(Pressable, {
      accessibilityLabel: 'Zoomable image',
      onPress: props.onSingleTap,
    });
  return { __esModule: true, default: stub, ImageZoom: stub, Zoomable: stub };
});

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return {
    ...mock,
    default: { ...mock.default },
    // The official mock lacks this predicate that react-native-sortables calls on drag
    // handlers; a plain function is never a worklet, which is what the mock world needs.
    isWorkletFunction: fn => typeof fn === 'function' && typeof fn.__workletHash === 'number',
  };
});

jest.mock('react-native-marked', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const FakeMarkdown = ({ value }) =>
    React.createElement(Text, { key: 'md' }, String(value));
  return {
    __esModule: true,
    default: FakeMarkdown,
    Renderer: class {
      getKey() {
        return 'k';
      }
      // The real base draws a rule here. Kept in the stub because AgentMarkdown overrides it to
      // drop the rule in an aside, and a base that answered undefined would make that override
      // pass for the wrong reason.
      hr(styles) {
        return React.createElement(View, { key: 'hr', style: styles });
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

// react-native-sortables runs its drag engine on measured layout shared values; the reanimated
// mock has no layout at all, so the provider crashes. The gesture itself therefore stays device
// territory. What this mock keeps testable is the contract the drawer leans on: the rows render
// through `renderItem` in the order they are handed over, the layout is a single column, and no
// custom handle steals the grab area from the row. Those props ride onto the View so a test can
// read them back, and `onDragEnd` is exposed so a drop can be played without a finger.
jest.mock('react-native-sortables', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Grid = ({
    data = [],
    renderItem,
    keyExtractor,
    columns,
    customHandle,
    onDragEnd,
    dragActivationDelay,
    dragActivationFailOffset,
  }) =>
    React.createElement(
      View,
      {
        testID: 'sortable-grid',
        collapsable: false,
        columns,
        customHandle: Boolean(customHandle),
        onDragEnd,
        dragActivationDelay,
        dragActivationFailOffset,
      },
      data.map((item, index) =>
        React.createElement(
          View,
          { key: keyExtractor ? keyExtractor(item) : index },
          renderItem({ item, index }),
        ),
      ),
    );
  return { __esModule: true, default: { Grid }, Grid };
});

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
    getCurrentLocation: jest.fn(() =>
      Promise.resolve({
        latitude: 48.8566,
        longitude: 2.3522,
        accuracyMeters: 24,
        capturedAt: '2026-01-01T10:00:00.000Z',
      }),
    ),
    prefsGetAll: jest.fn(() => Promise.resolve({})),
    getExitInfo: jest.fn(() => Promise.resolve({ versionName: '0.0.1-test', exits: [] })),
    getAppVersion: jest.fn(() => Promise.resolve('0.0.1-test')),
    cancelNotification: jest.fn(() => Promise.resolve()),
    prefsSet: jest.fn(() => Promise.resolve()),
    pickFile: jest.fn(() => Promise.resolve([])),
    clipboardHasImage: jest.fn(() => Promise.resolve(false)),
    clipboardImage: jest.fn(() => Promise.resolve(null)),
    prepareFile: jest.fn(() =>
      Promise.resolve({ uri: 'file:///cache/prepared', name: 'file', size: 0 }),
    ),
    uploadFile: jest.fn(() =>
      Promise.resolve({ status: 200, body: JSON.stringify({ id: 'media-1' }) }),
    ),
    downloadFile: jest.fn(() =>
      Promise.resolve({ path: '/storage/Pictures/my-claw/file' }),
    ),
    cacheFile: jest.fn(() =>
      Promise.resolve({ uri: 'file:///cache/media', name: 'file', size: 0 }),
    ),
    saveFile: jest.fn(() => Promise.resolve({ path: 'content://saved/file' })),
    startRecording: jest.fn(() => Promise.resolve('file:///cache/voice.m4a')),
    stopRecording: jest.fn(() =>
      Promise.resolve({
        uri: 'file:///cache/voice.m4a',
        durationMs: 3400,
        sizeBytes: 13600,
      }),
    ),
    cancelRecording: jest.fn(() => Promise.resolve()),
    playAudio: jest.fn(() => Promise.resolve()),
    pausePlayback: jest.fn(() => Promise.resolve()),
    seekPlayback: jest.fn(() => Promise.resolve()),
    stopPlayback: jest.fn(() => Promise.resolve()),
  },
  deviceEvents: require('react-native').DeviceEventEmitter,
  VOICE_LEVEL_EVENT: 'claw:voice:level',
  VOICE_PLAYBACK_EVENT: 'claw:voice:playback',
  TRANSFER_PROGRESS_EVENT: 'claw:transfer:progress',
  onTransferProgress: jest.fn(() => () => {}),
  useTransferProgress: jest.fn(() => null),
}));

// The identity a screen sees. Mirrors the real module exactly: it exports one function, and a
// mock that offers more than that hides the day the module stops offering it.
jest.mock('./src/core/device', () => ({
  getDeviceInfo: jest.fn(() =>
    Promise.resolve({ deviceId: 'dev-test', token: 'token-test' }),
  ),
}));

// Node's URL is spec compliant, the device's is not: RN ships a partial polyfill whose `host`
// only matches http(s). Using Node's here hid a bug that only showed up on a phone, so tests
// run against the same URL the app gets.
// The top level export resolves to Node's real URL here; the device gets this polyfill, and
// that difference is exactly what we want under test.
// eslint-disable-next-line @react-native/no-deep-imports
global.URL = require('react-native/Libraries/Blob/URL').URL;

// The Android date/time pickers are native dialogs (an inline spinner on iOS); under Jest
// nothing renders. The holder lets a test drive onChange with a chosen Date, the same way the
// expo-unified-push mock replays distributor messages.
jest.mock('@react-native-community/datetimepicker', () => {
  let last = null;
  return {
    __esModule: true,
    default: props => {
      last = props;
      return null;
    },
    __lastProps: () => last,
  };
});
