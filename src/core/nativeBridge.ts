import { DeviceEventEmitter, NativeModules } from 'react-native';

export interface DeviceInfoNative {
  deviceId: string;
  token: string;
}

export interface DeviceCapabilities {
  accessibility: boolean;
  notificationListener: boolean;
  wssConnection: boolean;
}

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Single typed door to the Kotlin module. Everything else imports this instead of
 * NativeModules, so tests can mock one file and a renamed native method breaks
 * exactly one place.
 */
export interface DeviceBridgeNative {
  connect(url: string): void;
  disconnect(): void;
  sendMessage(text: string): Promise<boolean>;
  pendingCount(): Promise<number>;
  clearOutbox(): Promise<void>;
  getConnectionState(): Promise<string>;
  getDeviceInfo(): Promise<DeviceInfoNative>;
  getCapabilities(): Promise<DeviceCapabilities>;
  prefsGetAll(): Promise<Record<string, string>>;
  prefsSet(key: string, value: string | null): Promise<void>;
  pickFile(): Promise<PickedFile[]>;
  /** Copies a content:// or file:// uri into the cache and returns a readable file:// uri. */
  prepareFile(
    uri: string,
  ): Promise<{ uri: string; name: string; size: number }>;
  /**
   * POSTs a local file as a raw body. Native because RN's fetch cannot read file:// or
   * content:// uris on Android (OkHttp only accepts http(s) urls).
   */
  uploadFile(
    uri: string,
    url: string,
    filename: string,
    type: string,
    threadId: string,
  ): Promise<{ status: number; body: string }>;
  /**
   * GETs a media url and stores the bytes: in Pictures (visible to the gallery app) when
   * `toGallery`, in Downloads otherwise. Runs on the native side because the URL carries the
   * auth token and the bytes never touch the JS heap.
   */
  downloadFile(
    url: string,
    filename: string,
    toGallery: boolean,
  ): Promise<{ path: string }>;
}

const native = NativeModules.DeviceBridge as DeviceBridgeNative | undefined;

if (!native && !__DEV__) {
  // Fail loudly at boot rather than silently dropping every frame at runtime.
  console.error(
    'DeviceBridge native module missing: the app cannot reach the agent',
  );
}

export const deviceBridge: DeviceBridgeNative = {
  connect: url => native?.connect(url),
  disconnect: () => native?.disconnect(),
  sendMessage: text => native?.sendMessage(text) ?? Promise.resolve(false),
  pendingCount: () => native?.pendingCount() ?? Promise.resolve(0),
  clearOutbox: () => native?.clearOutbox() ?? Promise.resolve(),
  getConnectionState: () =>
    native?.getConnectionState() ?? Promise.resolve('idle'),
  getDeviceInfo: () =>
    native?.getDeviceInfo() ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  getCapabilities: () =>
    native?.getCapabilities() ??
    Promise.resolve({
      accessibility: false,
      notificationListener: false,
      wssConnection: false,
    }),
  prefsGetAll: () => native?.prefsGetAll() ?? Promise.resolve({}),
  prefsSet: (key, value) => native?.prefsSet(key, value) ?? Promise.resolve(),
  pickFile: () => native?.pickFile() ?? Promise.resolve([]),
  prepareFile: uri =>
    native?.prepareFile(uri) ?? Promise.resolve({ uri, name: 'file', size: 0 }),
  uploadFile: (uri, url, filename, type, threadId) =>
    native?.uploadFile(uri, url, filename, type, threadId) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  downloadFile: (url, filename, toGallery) =>
    native?.downloadFile(url, filename, toGallery) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
};

export const deviceEvents = DeviceEventEmitter;
