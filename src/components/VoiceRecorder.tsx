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

/** Dragged left this far, releasing throws the take away. */
const CANCEL_DISTANCE = 90;
/** Dragged up this far, the take keeps going without the finger. */
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
 * Three things here are the result of getting it wrong first, and they are the rules:
 *
 * 1. **The button that owns the gesture is never replaced.** It is restyled, never unmounted: an
 *    earlier version swapped the subtree when a take began, which destroyed the view holding the
 *    touch responder while the finger was still down. Android dropped the gesture and releasing
 *    did nothing.
 * 2. **A tap is not a take.** See `TAP_MS`.
 * 3. **A lock is deliberate.** Up past 70 pt AND clearly more up than sideways: a thumb sliding
 *    left drifts, and a left drag that locked the take read as a design that ignored the finger.
 *
 * The button sits at the right edge of the composer so that "slide left" drags inward, across the
 * bar, toward the trash mark. Held on the left -- where it started -- the same gesture aimed at
 * the bezel of the phone.
 *
 * A tap is not a take: the recorder is started on touch down (waiting would lose the first
 * syllable), and a take too short to be one is dropped in silence rather than reported as an
 * error. Brushing the edge of the composer must not produce a red line.
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

  // The pan callbacks are built once and never see a re-render, so every value they read lives in
  // a ref. Reading `phase` there would pin it to 'idle' for the whole gesture.
  const phaseRef = useRef<Phase>('idle');
  const startingRef = useRef(false);
  const cancelRef = useRef(false);
  const armedRef = useRef(false);
  const pendingWarningRef = useRef<string | null>(null);
  const nativeEndedRef = useRef(false);

  const slide = useRef(new Animated.Value(0)).current;
  // Three values, one timeline. A take is a state the whole row is in, not a label swapped in
  // beside a button: the dot blinks at the rate of the caret, the microphone breathes at the same
  // rate, and the row rises into place once. Coherence here is one period, not three.
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
      // The finger may already be gone: a tap resolves the permission after the release, and
      // starting then would leave a recording nobody is holding.
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
    // Too short to be a take: a brush of the thumb, not an error. Anything else is one.
    if (outcome.reason === 'too-short') return;
    onError('Recording failed.');
  }, [onError, onRecorded, settle, setPhaseBoth]);

  /** The finger came up (or the system took the gesture): what does that mean? */
  const release = useCallback(() => {
    if (phaseRef.current === 'locked') return;
    if (armedRef.current) {
      discard();
      return;
    }
    keep().catch(() => {});
  }, [discard, keep]);

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
          // Up, and clearly more up than sideways: a left drag drifts, and a lock nobody asked
          // for is the gesture deciding for the hand.
          if (gesture.dy < -LOCK_DISTANCE && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4) {
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
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
      }),
    [begin, release, setPhaseBoth, slide],
  );

  /* ── lifecycle ─────────────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase === 'idle') return undefined;
    const subscription = deviceEvents.addListener(VOICE_LEVEL_EVENT, (event: VoiceLevelEvent) => {
      setElapsedMs(event.elapsedMs);
      setLevels(previous => {
        const next = previous.concat(event.level);
        return next.length > WAVE_BARS ? next.slice(next.length - WAVE_BARS) : next;
      });
    });
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

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = deviceEvents.addListener('claw:voice:interrupted', () => settle());
    return () => subscription.remove();
  }, [settle]);

  useEffect(() => {
    const subscription = deviceEvents.addListener(VOICE_STATUS_EVENT, (event: VoiceRecordingStatusEvent) => {
      if (event.state === 'warning') {
        const message = event.warning ?? 'Android reported a microphone interruption.';
        if (phaseRef.current !== 'idle') setWarning(message);
        else pendingWarningRef.current = message;
        return;
      }
      // A service/recorder ending can race the finger release. A recording payload is enough to
      // accept it even after keep() has already moved the bar back to idle.
      nativeEndedRef.current = true;
      if (phaseRef.current === 'idle' && !event.recording) return;
      settle();
      if (event.recording) onRecorded(event.recording);
      if (event.warning) onError(event.warning);
    });
    return () => subscription.remove();
  }, [onError, onRecorded, settle]);

  // The row rises in and the button breathes, on the native driver so a busy JS thread does not
  // freeze the only signal that the microphone is live.
  const native = Platform.OS !== 'web';
  useEffect(() => {
    const live = phase === 'recording';
    if (!live) {
      blink.stopAnimation();
      breathe.stopAnimation();
      blink.setValue(1);
      breathe.setValue(0);
      return undefined;
    }
    // 1.1 s, the same period as the caret: two different ideas of "busy" in one screen read as
    // two different states.
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
  }, [blink, breathe, native, phase]);

  const riseTo = active ? 1 : 0;
  useEffect(() => {
    Animated.timing(rise, { toValue: riseTo, duration: 140, useNativeDriver: native }).start();
  }, [native, rise, riseTo]);

  /* ── what is on screen ─────────────────────────────────────────────────────────────────── */

  const size = hero ? styles.buttonHero : dense ? styles.buttonDense : null;

  // Idle: the button alone, at the composer's right edge.
  if (!active) {
    return (
      <Animated.View
        {...pan.panHandlers}
        style={[styles.button, size]}
        accessibilityRole="button"
        accessibilityLabel="Record voice message"
        accessibilityHint="Hold to record, slide left to delete, slide up to keep your hands free">
        <MicIcon color={styles.glyphIdle.color} size={hero ? 20 : 17} />
      </Animated.View>
    );
  }

  // A take owns the whole row: the mark it can be thrown into, the clock, the level, and the
  // button that ends it. Nothing else is drawn beside it -- the composer hides the field and the
  // spacer while this is up.
  return (
    <Animated.View
      style={[
        styles.take,
        {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
        },
      ]}>
      {locked ? (
        // Hands free: the trash is a real target now, because there is no thumb on the button to
        // drag. While holding it is a mark, and a mark that looks pressable but is not is worse
        // than no mark at all.
        <Pressable
          onPress={discard}
          hitSlop={10}
          style={styles.trashButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel recording">
          <TrashIcon size={15} color={styles.armed.color} />
        </Pressable>
      ) : (
        <View style={styles.trashMark}>
          <TrashIcon size={14} color={armed ? styles.armed.color : styles.trashIdle.color} />
        </View>
      )}

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
            size,
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
          {armed ? (
            <TrashIcon color={styles.glyphOnFill.color} size={15} />
          ) : (
            <MicIcon color={styles.glyphOnFill.color} size={15} />
          )}
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
function Waveform({ levels, styles }: { levels: number[]; styles: ReturnType<typeof createStyles> }) {
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
  buttonDense: { width: 30, height: 30 },
  buttonLive: { backgroundColor: palette.accent },
  buttonArmed: { backgroundColor: palette.danger },
  buttonStop: { backgroundColor: palette.accent },
  stopIcon: { color: palette.accentText },
  glyphIdle: { color: palette.textMuted },
  glyphOnFill: { color: palette.accentText },
  /** Where the take can be thrown: a slot the thumb drags across, filled only past the threshold. */
  trashMark: { width: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  trashIdle: { color: palette.textFaint },
  /** The same slot, as a target, once the take is hands-free. */
  trashButton: {
    width: 24,
    height: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  /** The colour the trash mark takes once the take is past the point of no return. */
  armed: { color: palette.danger },
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
});
