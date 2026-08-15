/// <reference lib="dom" />
// The DOM lib is referenced here rather than in tsconfig: a global `window` would let native
// code compile against APIs the phone does not have.
import { useEffect, useState } from 'react';

/**
 * Web implementation of the single native door (see nativeBridge.ts).
 *
 * The interface is identical, so nothing above this file knows which platform it runs on.
 * What the Android foreground service does natively, this does with a WebSocket, localStorage
 * and DOM APIs. Phase 0 covers the socket, prefs and identity; everything else rejects with a
 * named error rather than resolving a lie.
 */

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
export const TRANSFER_PROGRESS_EVENT = 'claw:transfer:progress';

export interface TransferProgress {
  id: string;
  bytes: number;
  total: number;
}

type Listener = (payload: never) => void;

/** DeviceEventEmitter is a react-native module with no react-native-web equivalent. */
class WebEventEmitter {
  private listeners = new Map<string, Set<Listener>>();

  addListener(event: string, cb: Listener): { remove: () => void } {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return { remove: () => set?.delete(cb) };
  }

  emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach(cb => (cb as (p: unknown) => void)(payload));
  }
}

export const deviceEvents = new WebEventEmitter();

export function onTransferProgress(cb: (progress: TransferProgress) => void): () => void {
  const sub = deviceEvents.addListener(TRANSFER_PROGRESS_EVENT, cb as Listener);
  return () => sub.remove();
}

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

export interface DeviceBridgeNative {
  connect(url: string): void;
  disconnect(): void;
  sendMessage(text: string): Promise<boolean>;
  pendingCount(): Promise<number>;
  clearOutbox(): Promise<void>;
  getConnectionState(): Promise<string>;
  getDeviceInfo(): Promise<DeviceInfoNative>;
  getCapabilities(): Promise<DeviceCapabilities>;
  getCurrentLocation(): Promise<CurrentLocationNative>;
  prefsGetAll(): Promise<Record<string, string>>;
  prefsSet(key: string, value: string | null): Promise<void>;
  getExitInfo(): Promise<{
    versionName: string;
    exits: { reason: string; at: number; status: number; description: string }[];
  }>;
  getAppVersion(): Promise<string>;
  cancelNotification(id: number): Promise<void>;
  pickFile(): Promise<PickedFile[]>;
  prepareFile(uri: string): Promise<{ uri: string; name: string; size: number }>;
  uploadFile(
    uri: string,
    url: string,
    filename: string,
    type: string,
    threadId: string,
    transferId: string,
  ): Promise<{ status: number; body: string }>;
  downloadFile(
    url: string,
    filename: string,
    toGallery: boolean,
    transferId: string,
  ): Promise<{ path: string }>;
  cacheFile(
    url: string,
    filename: string,
    transferId: string,
  ): Promise<{ uri: string; name: string; size: number }>;
  saveFile(url: string, filename: string, transferId: string): Promise<{ path: string } | null>;
  startRecording(): Promise<string>;
  stopRecording(): Promise<VoiceRecording | null>;
  cancelRecording(): Promise<void>;
  playAudio(uri: string): Promise<void>;
  pausePlayback(): Promise<void>;
  seekPlayback(positionMs: number): Promise<void>;
  stopPlayback(): Promise<void>;
}

const PREFS_PREFIX = 'claw:pref:';
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/** Mirrors ClawConnectionService: one socket, an outbox, exponential backoff, state events. */
class WebConnection {
  private socket: WebSocket | null = null;
  private url = '';
  private outbox: string[] = [];
  private state = 'idle';
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;

  connect(url: string): void {
    this.url = url;
    this.wanted = true;
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
    this.setState('disconnected');
  }

  send(text: string): boolean {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(text);
      return true;
    }
    this.outbox.push(text);
    deviceEvents.emit('claw:ws:outbox', { pending: this.outbox.length });
    return true;
  }

  pending(): number {
    return this.outbox.length;
  }

  clearOutbox(): void {
    this.outbox = [];
    deviceEvents.emit('claw:ws:outbox', { pending: 0 });
  }

  currentState(): string {
    return this.state;
  }

  private open(): void {
    if (!this.wanted) return;
    this.setState('connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setState('connected');
      this.drain();
    };
    socket.onmessage = event => {
      deviceEvents.emit('claw:ws:message', { text: String(event.data) });
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setState('disconnected');
      this.scheduleRetry();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  private drain(): void {
    const queued = this.outbox;
    this.outbox = [];
    queued.forEach(text => this.send(text));
    deviceEvents.emit('claw:ws:outbox', { pending: this.outbox.length });
  }

  private scheduleRetry(): void {
    if (!this.wanted || this.retryTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private setState(state: string): void {
    this.state = state;
    deviceEvents.emit('claw:ws:state', { state, pending: this.outbox.length });
  }
}

const connection = new WebConnection();

function unsupported(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} is not implemented on web yet`));
}

/** Phase 0 identity: whatever the pairing flow will later store, read from localStorage. */
function readDeviceInfo(): DeviceInfoNative {
  return {
    deviceId: localStorage.getItem('claw:deviceId') ?? '',
    token: localStorage.getItem('claw:token') ?? '',
  };
}

export const deviceBridge: DeviceBridgeNative = {
  connect: url => connection.connect(url),
  disconnect: () => connection.disconnect(),
  sendMessage: text => Promise.resolve(connection.send(text)),
  pendingCount: () => Promise.resolve(connection.pending()),
  clearOutbox: () => {
    connection.clearOutbox();
    return Promise.resolve();
  },
  getConnectionState: () => Promise.resolve(connection.currentState()),
  getDeviceInfo: () => Promise.resolve(readDeviceInfo()),
  getCapabilities: () =>
    Promise.resolve({
      accessibility: false,
      notificationListener: false,
      wssConnection: true,
    }),
  getCurrentLocation: () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation unavailable'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        position =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            capturedAt: new Date(position.timestamp).toISOString(),
            altitudeMeters: position.coords.altitude ?? undefined,
            headingDegrees: position.coords.heading ?? undefined,
            speedMetersPerSecond: position.coords.speed ?? undefined,
          }),
        error => reject(new Error(error.message)),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }),
  prefsGetAll: () => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFS_PREFIX)) {
        out[key.slice(PREFS_PREFIX.length)] = localStorage.getItem(key) ?? '';
      }
    }
    return Promise.resolve(out);
  },
  prefsSet: (key, value) => {
    if (value === null) localStorage.removeItem(PREFS_PREFIX + key);
    else localStorage.setItem(PREFS_PREFIX + key, value);
    return Promise.resolve();
  },
  getExitInfo: () => Promise.resolve({ versionName: '', exits: [] }),
  getAppVersion: () => Promise.resolve('web'),
  cancelNotification: () => Promise.resolve(),
  pickFile: () =>
    new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        resolve(
          files.map(file => ({
            uri: URL.createObjectURL(file),
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
          })),
        );
      };
      input.oncancel = () => resolve([]);
      input.click();
    }),
  prepareFile: uri => Promise.resolve({ uri, name: 'file', size: 0 }),
  uploadFile: () => unsupported('uploadFile'),
  downloadFile: () => unsupported('downloadFile'),
  cacheFile: () => unsupported('cacheFile'),
  saveFile: () => unsupported('saveFile'),
  startRecording: () => unsupported('startRecording'),
  stopRecording: () => Promise.resolve(null),
  cancelRecording: () => Promise.resolve(),
  playAudio: () => unsupported('playAudio'),
  pausePlayback: () => Promise.resolve(),
  seekPlayback: () => Promise.resolve(),
  stopPlayback: () => Promise.resolve(),
};
