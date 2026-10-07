import { PermissionsAndroid, Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import {
  deviceBridge,
  deviceEvents,
  VOICE_PLAYBACK_EVENT,
  type VoicePlaybackEvent,
  type VoiceRecording,
} from './nativeBridge';

/**
 * Voice note capture and playback.
 *
 * The native side owns the recorder and the player; this module owns the rules around them --
 * who may hold the microphone, what counts as a real take, and which bubble is playing. Keeping
 * those out of the components means the composer never has to know that a 400 ms hold produces
 * a file the server would reject as empty.
 */

/** Below this a hold reads as a mis-tap, and the encoder has barely written a frame. */
export const MIN_RECORDING_MS = 700;

export interface PlaybackState {
  uri: string | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

const IDLE: PlaybackState = {
  uri: null,
  playing: false,
  positionMs: 0,
  durationMs: 0,
};

/**
 * One player, one store. Two notes playing at once is never intended, so the state is global
 * rather than per-bubble: a bubble reads it and asks "is that me?".
 */
class VoicePlaybackStore {
  private state: PlaybackState = IDLE;
  private listeners = new Set<() => void>();
  private attached = false;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.attach();
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PlaybackState => this.state;

  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    deviceEvents.addListener(VOICE_PLAYBACK_EVENT, (event: VoicePlaybackEvent) => {
      this.state = {
        uri: event.uri,
        playing: event.playing,
        positionMs: event.positionMs,
        durationMs: event.durationMs,
      };
      this.emit();
    });
  }

  /** Optimistic: the first progress event is a tick away, and a dead button reads as a bug. */
  async toggle(uri: string, durationMs: number): Promise<void> {
    const current = this.state;
    if (current.uri === uri && current.playing) {
      this.state = { ...current, playing: false };
      this.emit();
      await deviceBridge.pausePlayback();
      return;
    }
    this.state = {
      uri,
      playing: true,
      positionMs: current.uri === uri ? current.positionMs : 0,
      durationMs: current.durationMs > 0 && current.uri === uri ? current.durationMs : durationMs,
    };
    this.emit();
    try {
      await deviceBridge.playAudio(uri);
    } catch {
      this.state = { ...this.state, playing: false };
      this.emit();
    }
  }

  async seek(positionMs: number): Promise<void> {
    this.state = { ...this.state, positionMs };
    this.emit();
    await deviceBridge.seekPlayback(positionMs);
  }

  /** Test seam: the store outlives a render tree, so a suite would leak state between cases. */
  reset(): void {
    this.state = IDLE;
    this.emit();
  }
}

export const voicePlayback = new VoicePlaybackStore();

/** Playback state of one recording, so a bubble re-renders only while it is the one playing. */
export function usePlaybackOf(uri: string | undefined): PlaybackState | null {
  const state = useSyncExternalStore(voicePlayback.subscribe, voicePlayback.getSnapshot);
  return uri && state.uri === uri ? state : null;
}

export type MicPermission = 'granted' | 'denied' | 'blocked';

/**
 * The first dangerous permission this app asks for. Requested at the moment the mic is held
 * rather than at boot: asked out of context, "allow microphone" is a question with no visible
 * reason, and a denial then is permanent for a feature never seen.
 */
export async function ensureMicPermission(): Promise<MicPermission> {
  if (Platform.OS !== 'android') return 'granted';
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return 'granted';
  const result = await PermissionsAndroid.request(permission);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

export type RecordingOutcome =
  | { ok: true; recording: VoiceRecording }
  | { ok: false; reason: 'too-short' | 'failed' };

/**
 * Ends a take. A recording under MIN_RECORDING_MS is discarded rather than sent: the file would
 * be a fraction of a second of room tone, and the transcription would come back as either
 * nothing or an invented word.
 */
export async function finishRecording(): Promise<RecordingOutcome> {
  let recording: VoiceRecording | null;
  try {
    recording = await deviceBridge.stopRecording();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (!recording || recording.sizeBytes === 0) return { ok: false, reason: 'failed' };
  if (recording.durationMs < MIN_RECORDING_MS) return { ok: false, reason: 'too-short' };
  return { ok: true, recording };
}

/** Filename carries the extension the recorder actually wrote; the server types the file by it. */
export function voiceFilename(at: Date = new Date(), mimeType = 'audio/mp4'): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let extension = 'm4a';
  if (mimeType.startsWith('audio/webm')) extension = 'webm';
  else if (mimeType.startsWith('audio/ogg')) extension = 'ogg';
  return `voice-${stamp}.${extension}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
