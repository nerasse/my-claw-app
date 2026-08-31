import { DeviceEventEmitter, NativeModules } from 'react-native';
import { useEffect, useState } from 'react';

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

export interface VoiceRecording {
  uri: string;
  durationMs: number;
  sizeBytes: number;
}

export interface CurrentLocationNative {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  altitudeMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
}

/** Pushed while recording, ~16 times a second: `level` is already normalised to 0..1. */
export interface VoiceLevelEvent {
  level: number;
  elapsedMs: number;
}

export interface VoicePlaybackEvent {
  uri: string | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

export const VOICE_LEVEL_EVENT = 'claw:voice:level';
export const VOICE_PLAYBACK_EVENT = 'claw:voice:playback';

/** Pushed while a file moves between the device and the server (upload, download, cache, save). */
export const TRANSFER_PROGRESS_EVENT = 'claw:transfer:progress';

export interface TransferProgress {
  /** Matches the transferId passed to the bridge call that started the transfer. */
  id: string;
  bytes: number;
  total: number;
}

/** Subscribes to transfer progress; the returned function unsubscribes. */
export function onTransferProgress(cb: (progress: TransferProgress) => void): () => void {
  const sub = DeviceEventEmitter.addListener(TRANSFER_PROGRESS_EVENT, cb);
  return () => sub.remove();
}

/** Latest progress event for one transfer id, null before the first event. */
export function useTransferProgress(transferId: string | null): TransferProgress | null {
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  useEffect(() => {
    if (!transferId) {
      setProgress(null);
      return;
    }
    return onTransferProgress(p => {
      if (p.id === transferId) setProgress(p);
    });
  }, [transferId]);
  return progress;
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
  /** Replaces the locally generated credentials with the pair the server minted (CLI pairing). */
  adoptCredentials(deviceId: string, token: string): Promise<boolean>;
  getCapabilities(): Promise<DeviceCapabilities>;
  /** Captures one foreground location, waiting briefly for the best available fix. */
  getCurrentLocation(): Promise<CurrentLocationNative>;
  prefsGetAll(): Promise<Record<string, string>>;
  prefsSet(key: string, value: string | null): Promise<void>;
  /** Android's history of previous process deaths, plus the running build's version name. */
  getExitInfo(): Promise<{
    versionName: string;
    exits: { reason: string; at: number; status: number; description: string }[];
  }>;
  /** The running build's version name ("0.2.78"). */
  getAppVersion(): Promise<string>;
  /** "wifi" | "mobile" | "other", for the auto-download policy. */
  getNetworkType(): Promise<string>;
  /** Android 8+ opt-in for sideloaded installs; false until the user grants it. */
  canInstallApk(): Promise<boolean>;
  /** Opens Android's "install unknown apps" settings screen for this app. */
  openUnknownSourcesSettings(): void;
  /**
   * Downloads the APK through the server relay into a fixed staging file.
   * Resolves when the download has completed; the install is a separate call.
   */
  downloadApk(url: string, transferId: string): Promise<void>;
  /**
   * Commits the staged APK to PackageInstaller. Resolves when the session is committed;
   * the system confirmation and the outcome arrive via `claw:update:install`.
   */
  installStagedApk(): Promise<void>;
  /** Delivers an install result that arrived before JS subscribed (cold start after install). */
  drainInstallResult(): void;
  /**
   * Dismisses one posted notification by the id it was posted with (docs/notifications.md).
   * Native because the notification is rendered by a service that may have run while this JS
   * context did not exist.
   */
  cancelNotification(id: number): Promise<void>;
  pickFile(): Promise<PickedFile[]>;
  /**
   * Whether the clipboard holds an image, read from the clip description alone.
   *
   * The description carries the mime types and nothing else, so asking is silent; reading the
   * clip itself raises the Android 12 "pasted from" toast. The menu entry is therefore decided
   * from this, and the pixels are only fetched once the entry is tapped.
   */
  clipboardHasImage(): Promise<boolean>;
  /** The clipboard image as a picked file, or null when there is none to take. */
  clipboardImage(): Promise<PickedFile | null>;
  /** Copies a content:// or file:// uri into the cache and returns a readable file:// uri. */
  prepareFile(
    uri: string,
  ): Promise<{ uri: string; name: string; size: number }>;
  /**
   * POSTs a local file as a raw body. Native because RN's fetch cannot read file:// or
   * content:// uris on Android (OkHttp only accepts http(s) urls). Progress events carry the
   * `transferId`.
   */
  uploadFile(
    uri: string,
    url: string,
    filename: string,
    type: string,
    threadId: string,
    transferId: string,
  ): Promise<{ status: number; body: string }>;
  /**
   * GETs a media url and stores the bytes: in Pictures (visible to the gallery app) when
   * `toGallery`, in Downloads otherwise. Runs on the native side because the URL carries the
   * auth token and the bytes never touch the JS heap. Progress events carry the `transferId`.
   */
  downloadFile(
    url: string,
    filename: string,
    toGallery: boolean,
    transferId: string,
  ): Promise<{ path: string }>;
  /**
   * GETs a media url into the app cache and resolves the local file:// uri. For big media the
   * viewers download with visible progress first, then render the local copy.
   */
  cacheFile(
    url: string,
    filename: string,
    transferId: string,
  ): Promise<{ uri: string; name: string; size: number }>;
  /**
   * Opens the system "Save as" dialog, then downloads the media url into the chosen
   * location. Resolves null when the picker is dismissed. Progress events carry the
   * `transferId`.
   */
  saveFile(url: string, filename: string, transferId: string): Promise<{ path: string } | null>;
  /**
   * Starts microphone capture and resolves the destination file:// uri. Rejects with
   * NO_MIC_PERMISSION when the permission was never granted, so the caller can ask.
   */
  startRecording(): Promise<string>;
  /** Resolves null when the take was too short to hold audio (a tap rather than a hold). */
  stopRecording(): Promise<VoiceRecording | null>;
  cancelRecording(): Promise<void>;
  playAudio(uri: string): Promise<void>;
  pausePlayback(): Promise<void>;
  seekPlayback(positionMs: number): Promise<void>;
  stopPlayback(): Promise<void>;
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
  adoptCredentials: (deviceId, token) =>
    native?.adoptCredentials(deviceId, token) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  getCapabilities: () =>
    native?.getCapabilities() ??
    Promise.resolve({
      accessibility: false,
      notificationListener: false,
      wssConnection: false,
      }),
  getCurrentLocation: () =>
    native?.getCurrentLocation() ?? Promise.reject(new Error('Location unavailable')),
  prefsGetAll: () => native?.prefsGetAll() ?? Promise.resolve({}),
  prefsSet: (key, value) => native?.prefsSet(key, value) ?? Promise.resolve(),
  getExitInfo: () =>
    native?.getExitInfo() ?? Promise.resolve({ versionName: '', exits: [] }),
  getAppVersion: () => native?.getAppVersion() ?? Promise.resolve(''),
  getNetworkType: () => native?.getNetworkType() ?? Promise.resolve('other'),
  canInstallApk: () => native?.canInstallApk() ?? Promise.resolve(false),
  openUnknownSourcesSettings: () => native?.openUnknownSourcesSettings(),
  downloadApk: (url, transferId) => native?.downloadApk(url, transferId) ?? Promise.resolve(),
  installStagedApk: () => native?.installStagedApk() ?? Promise.resolve(),
  drainInstallResult: () => native?.drainInstallResult(),
  cancelNotification: id => native?.cancelNotification(id) ?? Promise.resolve(),
  pickFile: () => native?.pickFile() ?? Promise.resolve([]),
  clipboardHasImage: () => native?.clipboardHasImage() ?? Promise.resolve(false),
  clipboardImage: () => native?.clipboardImage() ?? Promise.resolve(null),
  prepareFile: uri =>
    native?.prepareFile(uri) ?? Promise.resolve({ uri, name: 'file', size: 0 }),
  uploadFile: (uri, url, filename, type, threadId, transferId) =>
    native?.uploadFile(uri, url, filename, type, threadId, transferId) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  downloadFile: (url, filename, toGallery, transferId) =>
    native?.downloadFile(url, filename, toGallery, transferId) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  cacheFile: (url, filename, transferId) =>
    native?.cacheFile(url, filename, transferId) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  saveFile: (url, filename, transferId) =>
    native?.saveFile(url, filename, transferId) ??
    Promise.reject(new Error('DeviceBridge unavailable')),
  // No silent fallback: a recorder that resolves without recording would hand the composer an
  // empty take to upload, and the failure would only surface as an unexplained refusal.
  startRecording: () =>
    native?.startRecording() ?? Promise.reject(new Error('DeviceBridge unavailable')),
  stopRecording: () => native?.stopRecording() ?? Promise.resolve(null),
  cancelRecording: () => native?.cancelRecording() ?? Promise.resolve(),
  playAudio: uri =>
    native?.playAudio(uri) ?? Promise.reject(new Error('DeviceBridge unavailable')),
  pausePlayback: () => native?.pausePlayback() ?? Promise.resolve(),
  seekPlayback: positionMs => native?.seekPlayback(positionMs) ?? Promise.resolve(),
  stopPlayback: () => native?.stopPlayback() ?? Promise.resolve(),
};

export const deviceEvents = DeviceEventEmitter;
