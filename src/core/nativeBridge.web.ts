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
  private lifecycleBound = false;

  connect(url: string): void {
    this.url = url;
    this.wanted = true;
    this.watchLifecycle();
    this.open();
  }

  /**
   * A phone browser freezes a backgrounded tab and the socket dies with it, which is why the
   * client came back to a "disconnected" banner after switching apps. Nothing can hold that
   * connection open (only the native app has a foreground service), so the answer is to notice
   * the return immediately: on visibility or network coming back, the backoff is dropped and a
   * reconnect happens now rather than up to thirty seconds later.
   */
  private watchLifecycle(): void {
    if (this.lifecycleBound) return;
    this.lifecycleBound = true;

    const revive = (): void => {
      if (!this.wanted) return;
      if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
      this.attempt = 0;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.open();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revive();
    });
    window.addEventListener('online', revive);
    window.addEventListener('pageshow', revive);
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

/** Phase 0 identity: whatever the pairing flow will later store, read from localStorage. */
function readDeviceInfo(): DeviceInfoNative {
  return {
    deviceId: localStorage.getItem('claw:deviceId') ?? '',
    token: localStorage.getItem('claw:token') ?? '',
  };
}

/** Emits the same progress events the native transfers do, so the UI needs no branch. */
function emitTransfer(id: string, bytes: number, total: number): void {
  deviceEvents.emit(TRANSFER_PROGRESS_EVENT, { id, bytes, total });
}

/**
 * Uploads with XMLHttpRequest rather than fetch: fetch has no upload progress event, and a
 * composer that shows nothing while a 40 MB video crawls is what the native side exists to avoid.
 */
function uploadWithProgress(
  blob: Blob,
  url: string,
  headers: Record<string, string>,
  transferId: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url, true);
    // Same-origin: the session cookie rides along and no credential is built by hand.
    request.withCredentials = true;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => emitTransfer(transferId, event.loaded, event.total || blob.size);
    request.onload = () => {
      emitTransfer(transferId, blob.size, blob.size);
      resolve({ status: request.status, body: request.responseText });
    };
    request.onerror = () => reject(new Error('upload failed'));
    request.onabort = () => reject(new Error('upload aborted'));
    request.send(blob);
  });
}

/** Streams a download so the progress bar is real, and hands back the bytes as a blob. */
async function fetchWithProgress(url: string, transferId: string): Promise<Blob> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length') ?? 0);
  if (!response.body) return response.blob();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      emitTransfer(transferId, received, total || received);
    }
  }
  emitTransfer(transferId, received, total || received);
  return new Blob(chunks as BlobPart[], {
    type: response.headers.get('content-type') ?? 'application/octet-stream',
  });
}

/** The browser's own "save as": an anchor click, which is the only portable trigger. */
function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately cancels the download in Firefox; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

interface Recording {
  recorder: MediaRecorder;
  stream: MediaStream;
  context: AudioContext;
  chunks: BlobPart[];
  startedAt: number;
  levelTimer: ReturnType<typeof setInterval>;
}

let recording: Recording | null = null;
let player: HTMLAudioElement | null = null;
let playerUri: string | null = null;

function emitPlayback(playing: boolean): void {
  deviceEvents.emit(VOICE_PLAYBACK_EVENT, {
    uri: playerUri,
    playing,
    positionMs: Math.round((player?.currentTime ?? 0) * 1000),
    durationMs: Number.isFinite(player?.duration ?? NaN) ? Math.round((player?.duration ?? 0) * 1000) : 0,
  });
}

async function startWebRecording(): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Not a missing permission: an insecure origin has no mediaDevices at all, and the UI hides
    // the button rather than letting this reach a user.
    throw new Error('NO_MIC_PERMISSION');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new Error('NO_MIC_PERMISSION');
  });

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);

  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const startedAt = Date.now();
  // ~16 Hz, the rate the native recorder pushes, so the waveform animates identically.
  const levelTimer = setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centred = (sample - 128) / 128;
      sum += centred * centred;
    }
    const rms = Math.sqrt(sum / samples.length);
    deviceEvents.emit(VOICE_LEVEL_EVENT, {
      level: Math.min(1, rms * 3),
      elapsedMs: Date.now() - startedAt,
    });
  }, 62);

  recording = { recorder, stream, context, chunks, startedAt, levelTimer };
  return 'recording';
}

function stopTracks(current: Recording): void {
  clearInterval(current.levelTimer);
  current.stream.getTracks().forEach(track => track.stop());
  current.context.close().catch(() => {});
}

async function stopWebRecording(): Promise<VoiceRecording | null> {
  const current = recording;
  recording = null;
  if (!current) return null;

  const blob = await new Promise<Blob>(resolve => {
    current.recorder.onstop = () =>
      resolve(new Blob(current.chunks, { type: current.recorder.mimeType || 'audio/webm' }));
    current.recorder.stop();
  });
  stopTracks(current);

  const durationMs = Date.now() - current.startedAt;
  // The native side returns null for a tap rather than a hold, and the composer relies on it.
  if (durationMs < 400 || blob.size === 0) return null;
  return { uri: URL.createObjectURL(blob), durationMs, sizeBytes: blob.size };
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
  // A blob URL is already local and readable: there is nothing to copy anywhere.
  prepareFile: async uri => {
    const blob = await fetch(uri).then(response => response.blob());
    return { uri, name: 'file', size: blob.size };
  },
  uploadFile: async (uri, url, filename, type, threadId, transferId) => {
    const blob = await fetch(uri).then(response => response.blob());
    return uploadWithProgress(
      blob,
      url,
      {
        'Content-Type': type || 'application/octet-stream',
        'X-Filename': encodeURIComponent(filename),
        'X-Thread-Id': threadId,
      },
      transferId,
    );
  },
  downloadFile: async (url, filename, _toGallery, transferId) => {
    // There is no gallery in a browser: everything lands wherever downloads land.
    const blob = await fetchWithProgress(url, transferId);
    saveBlob(blob, filename);
    return { path: filename };
  },
  cacheFile: async (url, filename, transferId) => {
    const blob = await fetchWithProgress(url, transferId);
    return { uri: URL.createObjectURL(blob), name: filename, size: blob.size };
  },
  saveFile: async (url, filename, transferId) => {
    const blob = await fetchWithProgress(url, transferId);
    saveBlob(blob, filename);
    return { path: filename };
  },
  startRecording: () => startWebRecording(),
  stopRecording: () => stopWebRecording(),
  cancelRecording: () => {
    const current = recording;
    recording = null;
    if (!current) return Promise.resolve();
    current.recorder.stop();
    stopTracks(current);
    return Promise.resolve();
  },
  playAudio: uri => {
    if (player && playerUri === uri) {
      return player.play().then(() => emitPlayback(true));
    }
    player?.pause();
    player = new Audio(uri);
    playerUri = uri;
    player.ontimeupdate = () => emitPlayback(true);
    player.onended = () => {
      emitPlayback(false);
      playerUri = null;
    };
    return player.play().then(() => emitPlayback(true));
  },
  pausePlayback: () => {
    player?.pause();
    emitPlayback(false);
    return Promise.resolve();
  },
  seekPlayback: positionMs => {
    if (player) player.currentTime = positionMs / 1000;
    emitPlayback(!player?.paused);
    return Promise.resolve();
  },
  stopPlayback: () => {
    player?.pause();
    if (player) player.currentTime = 0;
    playerUri = null;
    emitPlayback(false);
    return Promise.resolve();
  },
};
