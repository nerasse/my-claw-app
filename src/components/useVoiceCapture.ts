import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import {
  deviceBridge, deviceEvents, VOICE_LEVEL_EVENT, VOICE_STATUS_EVENT,
  type VoiceLevelEvent, type VoiceRecording, type VoiceRecordingStatusEvent,
} from '../core/nativeBridge';
import { ensureMicPermission, finishRecording } from '../core/voice';

type Phase = 'idle' | 'starting' | 'recording' | 'locked' | 'stopping';
type Intent = 'hold' | 'lock' | 'keep' | 'cancel';
interface Take {
  intent: Intent;
  ready: boolean;
  finishing: boolean;
  ended: boolean;
}
interface Callbacks {
  onRecorded: (recording: VoiceRecording) => void;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
}

export function useVoiceCapture(callbacks: Callbacks) {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const mounted = useRef(true);
  const takeRef = useRef<Take | null>(null);
  const delivered = useRef(new Set<string>());
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const transition = useCallback((next: Phase) => {
    if (!mounted.current) return;
    setPhase(next);
    latest.current.onActiveChange?.(next !== 'idle');
  }, []);

  const reset = useCallback((take: Take) => {
    take.ended = true;
    if (takeRef.current !== take) return;
    takeRef.current = null;
    if (!mounted.current) return;
    setElapsedMs(0);
    setLevels([]);
    setWarning(null);
    transition('idle');
  }, [transition]);

  const deliver = useCallback((recording: VoiceRecording) => {
    if (!mounted.current || delivered.current.has(recording.uri)) return;
    delivered.current.add(recording.uri);
    latest.current.onRecorded(recording);
    if (recording.warning) latest.current.onError(recording.warning);
  }, []);

  async function finish(take: Take) {
    if (!take.ready || take.finishing || take.ended) return;
    take.finishing = true;
    if (take.intent === 'cancel') {
      try {
        await deviceBridge.cancelRecording();
      } catch {
        if (mounted.current) latest.current.onError('Could not cancel recording.');
      } finally {
        reset(take);
      }
      return;
    }
    const outcome = await finishRecording();
    // A native stop event may have already handed the same take to the composer.
    if (take.ended) return;
    reset(take);
    if (outcome.ok) deliver(outcome.recording);
    else if (outcome.reason === 'failed' && mounted.current) latest.current.onError('Recording failed.');
  }

  async function begin() {
    if (takeRef.current) return;
    const take: Take = { intent: 'hold', ready: false, finishing: false, ended: false };
    takeRef.current = take;
    transition('starting');
    try {
      const permission = await ensureMicPermission();
      if (permission !== 'granted') {
        if (mounted.current && take.intent !== 'cancel') {
          latest.current.onError(permission === 'blocked'
            ? 'Microphone blocked. Enable it in system settings.'
            : 'Microphone permission is needed to record.');
        }
        reset(take);
        return;
      }
      // A release while the permission dialog was open is not a hands-free recording.
      if (take.ended || take.intent === 'cancel' || take.intent === 'keep') {
        reset(take);
        return;
      }
      await deviceBridge.startRecording();
      take.ready = true;
      if (take.ended) return;
      // Intent can change while the asynchronous native start is in flight.
      const intent = takeRef.current?.intent;
      if (!mounted.current || intent === 'cancel' || intent === 'keep') {
        if (!mounted.current) take.intent = 'cancel';
        await finish(take);
        return;
      }
      Vibration.vibrate(12);
      transition(intent === 'lock' ? 'locked' : 'recording');
    } catch {
      if (!take.ended && take.intent !== 'cancel' && mounted.current) {
        latest.current.onError('Could not start recording.');
      }
      reset(take);
    }
  }

  function end(intent: 'keep' | 'cancel') {
    const take = takeRef.current;
    if (!take || take.finishing || take.ended || take.intent === 'cancel' || take.intent === 'keep') return;
    take.intent = intent;
    transition('stopping');
    finish(take);
  }

  function release() {
    const take = takeRef.current;
    if (!take || take.intent === 'lock') return;
    // Lifted before the microphone was live: nothing was ever held, so this is a tap, not a take.
    if (!take.ready) {
      take.intent = 'cancel';
      return;
    }
    end('keep');
  }

  function move(dx: number, dy: number) {
    const take = takeRef.current;
    if (!take || take.ended || take.intent !== 'hold') return;
    if (dx <= -90 && Math.abs(dx) >= Math.abs(dy)) {
      Vibration.vibrate(18);
      end('cancel');
    } else if (dy <= -70 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      take.intent = 'lock';
      Vibration.vibrate(12);
      if (take.ready) transition('locked');
    }
  }

  useEffect(() => {
    mounted.current = true;
    const level = deviceEvents.addListener(VOICE_LEVEL_EVENT, (event: VoiceLevelEvent) => {
      if (!takeRef.current || takeRef.current.ended) return;
      setElapsedMs(event.elapsedMs);
      setLevels(previous => [...previous.slice(-21), event.level]);
    });
    const status = deviceEvents.addListener(VOICE_STATUS_EVENT, (event: VoiceRecordingStatusEvent) => {
      const take = takeRef.current;
      if (event.state === 'warning') {
        if (take) setWarning(event.warning ?? 'Microphone interrupted.');
        return;
      }
      const cancelled = take?.intent === 'cancel';
      if (take) reset(take);
      if (cancelled) return;
      if (event.recording) deliver(event.recording);
      if (event.warning && event.warning !== event.recording?.warning) latest.current.onError(event.warning);
    });
    const interrupted = deviceEvents.addListener('claw:voice:interrupted', () => {
      const take = takeRef.current;
      if (take) reset(take);
    });
    return () => {
      mounted.current = false;
      level.remove();
      status.remove();
      interrupted.remove();
      const take = takeRef.current;
      if (!take) return;
      // Android's foreground service keeps an established take when navigating away.
      if (take.ready && Platform.OS === 'android') return;
      take.intent = 'cancel';
      if (take.ready) deviceBridge.cancelRecording().catch(() => {});
    };
  }, [deliver, reset]);

  return {
    phase, elapsedMs, levels, warning,
    begin, move, release,
    stop: () => end('keep'),
    cancel: () => end('cancel'),
    terminate: () => { if (takeRef.current?.intent !== 'lock') end('cancel'); },
    canStart: () => takeRef.current === null,
  };
}
