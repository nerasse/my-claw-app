import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, Vibration, View } from 'react-native';
import { MicIcon, StopIcon, TrashIcon } from './icons';
import {
  deviceBridge,
  deviceEvents,
  VOICE_LEVEL_EVENT,
  VOICE_STATUS_EVENT,
  type VoiceLevelEvent,
  type VoiceRecording,
  type VoiceRecordingStatusEvent,
} from '../core/nativeBridge';
import { useLayout } from '../core/layout';
import { ensureMicPermission, finishRecording, formatDuration } from '../core/voice';
import { useThemedStyles } from '../theme';
import type { Palette } from '../theme/palettes';
import { font, radius, space } from '../theme/palettes';

/** Drag left past this and releasing throws the take away. */
const CANCEL_DISTANCE = 90;
/** Drag up past this and the recording keeps going without the finger. */
const LOCK_DISTANCE = 70;
/** Enough bars to read the last few seconds at a glance, few enough to stay cheap to render. */
const WAVE_BARS = 22;

type Phase = 'idle' | 'recording' | 'locked';

interface Props {
  /** The take is kept, not sent: it lands in the composer so text can be added to it. */
  onRecorded: (recording: VoiceRecording) => void;
  onError: (message: string) => void;
  /** Lets the composer hide the text field while the bar owns the row. */
  onActiveChange?: (active: boolean) => void;
  hero?: boolean;
}

/**
 * Hold to talk, slide left to discard, slide up to keep recording hands-free.
 *
 * The button that owns the gesture is mounted once and never replaced, only restyled. An earlier
 * version swapped the whole subtree when recording began, which unmounted the view holding the
 * touch responder while the finger was still down: Android dropped the gesture, and releasing did
 * nothing. Anything that appears during a take is a sibling of that button, never a replacement.
 */
export function VoiceRecorder({ onRecorded, onError, onActiveChange, hero }: Props) {
  const styles = useThemedStyles(createStyles);
  // Read here rather than passed down: the composer sizes its own pills off the same hook, and a
  // mic that ignored it stood 8pt taller than the field and the send button it sits next to.
  const { dense } = useLayout();
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const recording = phase === 'recording';
  const locked = phase === 'locked';
  const active = recording || locked;

  // The pan callbacks are built once and never see a re-render, so every value they read lives
  // in a ref. Reading `phase` there would pin it to 'idle' for the whole gesture.
  const phaseRef = useRef<Phase>('idle');
  const startingRef = useRef(false);
  const cancelRef = useRef(false);
  const armedRef = useRef(false);
  const pendingWarningRef = useRef<string | null>(null);
  const nativeEndedRef = useRef(false);
  const slide = useRef(new Animated.Value(0)).current;
  // Three values, one timeline. A take is a state the whole row is in, not a label swapped in
  // beside a button: the dot blinks at the rate of the caret, the microphone breathes at the
  // same rate, and the bar rises into place once. Coherence here is one period, not three.
  const blink = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  const setPhaseBoth = useCallback(
    (next: Phase) => {
      phaseRef.current = next;
      setPhase(next);
      onActiveChange?.(next !== 'idle');
    },
    [onActiveChange],
  );

  useEffect(() => {
    if (phase === 'idle') return undefined;
    const subscription = deviceEvents.addListener(
      VOICE_LEVEL_EVENT,
      (event: VoiceLevelEvent) => {
        setElapsedMs(event.elapsedMs);
        setLevels(previous => {
          const next = previous.concat(event.level);
          return next.length > WAVE_BARS ? next.slice(next.length - WAVE_BARS) : next;
        });
      },
    );
    return () => subscription.remove();
  }, [phase]);

  // On Android the native foreground service owns the capture lifetime once it starts: unmounting
  // this bar while navigating must not cancel a valid take, and the delete gesture and the
  // notification's Stop action remain the only endings besides MediaRecorder errors. Nothing owns
  // it anywhere else, so there the microphone must not outlive the bar.
  useEffect(
    () => () => {
      if (Platform.OS !== 'android' && phaseRef.current !== 'idle') deviceBridge.cancelRecording().catch(() => {});
    },
    [],
  );

  const settle = useCallback(() => {
    cancelRef.current = false;
    armedRef.current = false;
    setArmed(false);
    setElapsedMs(0);
    setLevels([]);
    setWarning(null);
    setPhaseBoth('idle');
    Animated.spring(slide, {
      toValue: 0,
      // No native animation module in a browser: asking for one only prints a warning.
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: 4,
    }).start();
  }, [setPhaseBoth, slide]);

  // A recording that does not move is a recording whose state the eye has to remember. The loop
  // runs while the take does, on the native driver so it keeps its rhythm while the thread is
  // busy with the stream.
  useEffect(() => {
    const live = phase === 'recording';
    const native = Platform.OS !== 'web';
    if (!live) {
      blink.stopAnimation();
      breathe.stopAnimation();
      blink.setValue(1);
      breathe.setValue(0);
      return undefined;
    }
    // 1.1 s, the same period as the caret on the web: a blink that fought the caret read as two
    // different ideas of "busy".
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 550, useNativeDriver: native }),
        Animated.timing(blink, { toValue: 1, duration: 550, useNativeDriver: native }),
      ]),
    );
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 550, useNativeDriver: native }),
        Animated.timing(breathe, { toValue: 0, duration: 550, useNativeDriver: native }),
      ]),
    );
    pulse.start();
    ring.start();
    return () => {
      pulse.stop();
      ring.stop();
    };
  }, [blink, breathe, phase]);

  // The bar arrives once per take, and leaves the same way: an element that appears between two
  // frames reads as a jolt, and a phone row that jolts while the thumb is held is worse than a
  // still one.
  const riseTo = active ? 1 : 0;
  useEffect(() => {
    Animated.timing(rise, {
      toValue: riseTo,
      duration: 140,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [rise, riseTo]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = deviceEvents.addListener('claw:voice:interrupted', () => settle());
    return () => subscription.remove();
  }, [settle]);

  useEffect(() => {
    const subscription = deviceEvents.addListener(
      VOICE_STATUS_EVENT,
      (event: VoiceRecordingStatusEvent) => {
        if (event.state === 'warning') {
          const message = event.warning ?? 'Android reported a microphone interruption.';
          if (phaseRef.current !== 'idle') setWarning(message);
          else pendingWarningRef.current = message;
          return;
        }
        // A service/recorder ending can race the finger release. A recording payload is enough
        // to accept it even after keep() has already moved the bar back to idle.
        nativeEndedRef.current = true;
        if (phaseRef.current === 'idle' && !event.recording) return;
        settle();
        if (event.recording) onRecorded(event.recording);
        if (event.warning) onError(event.warning);
      },
    );
    return () => subscription.remove();
  }, [onError, onRecorded, settle]);

  const begin = useCallback(async () => {
    if (startingRef.current || phaseRef.current !== 'idle') return;
    startingRef.current = true;
    nativeEndedRef.current = false;
    pendingWarningRef.current = null;
    try {
      const permission = await ensureMicPermission();
      if (permission !== 'granted') {
        onError(
          permission === 'blocked'
            ? 'Microphone blocked. Enable it in system settings.'
            : 'Microphone permission is needed to record.',
        );
        return;
      }
      // The finger may already be gone: a quick tap resolves the permission after the release,
      // and starting then would leave a recording nobody is holding.
      if (cancelRef.current) return;
      await deviceBridge.startRecording();
      if (nativeEndedRef.current) return;
      if (cancelRef.current) {
        await deviceBridge.cancelRecording().catch(() => {});
        return;
      }
      // Confirms the microphone is live without asking the eye to leave the conversation.
      Vibration.vibrate(12);
      setPhaseBoth('recording');
      if (pendingWarningRef.current) {
        setWarning(pendingWarningRef.current);
        pendingWarningRef.current = null;
      }
    } catch {
      onError('Could not start recording.');
    } finally {
      startingRef.current = false;
    }
  }, [onError, setPhaseBoth]);

  const discard = useCallback(() => {
    cancelRef.current = true;
    deviceBridge.cancelRecording().catch(() => {});
    Vibration.vibrate(18);
    settle();
  }, [settle]);

  const keep = useCallback(async () => {
    if (phaseRef.current === 'idle') {
      // Released before the recorder was up; begin() sees the flag and stands down.
      cancelRef.current = true;
      return;
    }
    setPhaseBoth('idle');
    const outcome = await finishRecording();
    settle();
    if (outcome.ok) {
      onRecorded(outcome.recording);
      if (outcome.recording.warning) onError(outcome.recording.warning);
      return;
    }
    // Native already ended the take (notification stop, recorder error, service teardown): its
    // status event staged or handled it, and this release is only the finger catching up.
    if (nativeEndedRef.current) return;
    onError(outcome.reason === 'too-short' ? 'Hold to record.' : 'Recording failed.');
  }, [onError, onRecorded, settle, setPhaseBoth]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          cancelRef.current = false;
          begin().catch(() => {});
        },
        onPanResponderMove: (_event, gesture) => {
          if (phaseRef.current !== 'recording') return;
          if (gesture.dy < -LOCK_DISTANCE) {
            armedRef.current = false;
            setArmed(false);
            slide.setValue(0);
            Vibration.vibrate(12);
            setPhaseBoth('locked');
            return;
          }
          // Follows the thumb, left only: dragging right is not a gesture, and a button that
          // wandered back past its slot would read as a second, different control.
          slide.setValue(Math.min(0, gesture.dx));
          const nowArmed = gesture.dx < -CANCEL_DISTANCE;
          if (nowArmed !== armedRef.current) {
            armedRef.current = nowArmed;
            setArmed(nowArmed);
            // The point of no return is worth feeling, since the eye is on the thumb.
            Vibration.vibrate(nowArmed ? 20 : 8);
          }
        },
        onPanResponderRelease: () => {
          if (phaseRef.current === 'locked') return;
          if (armedRef.current) {
            discard();
            return;
          }
          keep().catch(() => {});
        },
        onPanResponderTerminate: () => {
          if (phaseRef.current === 'locked') return;
          discard();
        },
      }),
    [begin, discard, keep, setPhaseBoth, slide],
  );

  // The take owns the whole row. It used to sit in a wrapper that split the free space with the
  // composer's own spacer, so the waveform got half of a bar and stopped mid-way -- a bar that
  // does not answer to its own edge reads as broken, not as compact.
  if (!active) {
    return (
      <Animated.View
        {...pan.panHandlers}
        style={[styles.button, hero && styles.buttonHero, dense && !hero && styles.buttonDense]}
        accessibilityRole="button"
        accessibilityLabel="Record voice message"
        accessibilityHint="Hold to record, slide left to delete, slide up to keep your hands free">
        <MicIcon color={styles.glyphIdle.color} size={hero ? 20 : 17} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.take,
        {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
        },
      ]}>
      {/* Where the thumb is going: a mark, not a caption. It fills with the danger colour the
          moment the take is past the point of no return, which is the only feedback the gesture
          needs while the eye is on the finger. */}
      <TrashIcon size={14} color={armed ? styles.armed.color : styles.trashIdle.color} />
      <Animated.View style={[styles.dot, { opacity: blink }]} />
      <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
      {warning ? (
        <Text style={styles.warning} numberOfLines={1} accessibilityRole="alert">
          {warning}
        </Text>
      ) : (
        <Waveform levels={levels} styles={styles} />
      )}
      {locked ? (
        <Pressable
          onPress={() => {
            keep().catch(() => {});
          }}
          style={[styles.button, styles.buttonStop]}
          accessibilityRole="button"
          accessibilityLabel="Stop recording">
          <StopIcon size={13} color={styles.stopIcon.color} />
        </Pressable>
      ) : (
        <Animated.View
          {...pan.panHandlers}
          style={[
            styles.button,
            armed ? styles.buttonArmed : styles.buttonLive,
            {
              transform: [
                { translateX: slide },
                { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
              ],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={armed ? 'Release to delete' : 'Recording, release to keep'}
          accessibilityHint="Slide left to delete, slide up to keep your hands free">
          {armed ? <TrashIcon color={styles.glyphOnFill.color} size={15} /> : <MicIcon color={styles.glyphOnFill.color} size={15} />}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/**
 * Drawn from the amplitude the recorder reports, not from a decoded waveform. It is a visual aid,
 * not a silence detector: deliberate pauses are valid, and Android's native recording callback is
 * the only warning path for a confirmed silencing/interruption.
 */
function Waveform({
  levels,
  styles,
}: {
  levels: number[];
  styles: ReturnType<typeof createStyles>;
}) {
  const bars = [];
  for (let index = 0; index < WAVE_BARS; index += 1) {
    const level = levels[index] ?? 0;
    // Square-rooted: speech sits low on a linear amplitude scale and would barely move the bars.
    const height = 3 + Math.round(Math.sqrt(level) * 17);
    bars.push(<View key={index} style={[styles.waveBar, { height }]} />);
  }
  return (
    <View style={styles.wave} accessibilityLabel="Microphone level">
      {bars}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  // The take is the row: one height with the controls it replaces, and it fills the width it is
  // given rather than asking for a share of it.
  take: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: 30,
  },
  trashIdle: { color: palette.textFaint },
  // The scale of the composer's bar: the microphone is a secondary action beside the send
  // button, not a second primary one. Two filled circles of the same size fight for the eye.
  button: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonHero: { width: 40, height: 40 },
  // Same number as the composer's `buttonDense`: one row, one height, whatever is in it.
  buttonDense: { width: 36, height: 36 },
  buttonLive: { backgroundColor: palette.accent, borderColor: palette.accent },
  buttonArmed: { backgroundColor: palette.danger, borderColor: palette.danger },
  buttonStop: { backgroundColor: palette.danger, borderColor: palette.danger },
  stopGlyph: { width: 14, height: 14, borderRadius: 3, backgroundColor: palette.accentText },
  glyphIdle: { color: palette.textMuted },
  glyphOnFill: { color: palette.accentText },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: palette.danger },
  timer: {
    fontSize: font.small,
    color: palette.text,
    fontVariant: ['tabular-nums' as const],
    minWidth: 32,
  },
  wave: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    height: 18,
  },
  waveBar: { flex: 1, borderRadius: radius.pill, backgroundColor: palette.accentSoft },
  warning: { flex: 1, fontSize: font.small, color: palette.danger },
  /** The colour the trash mark takes once the take is past the point of no return. */
  armed: { color: palette.danger },
  stopIcon: { color: palette.accentText },
});
