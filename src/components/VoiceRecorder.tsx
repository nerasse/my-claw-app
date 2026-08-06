import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  deviceBridge,
  deviceEvents,
  VOICE_LEVEL_EVENT,
  type VoiceLevelEvent,
  type VoiceRecording,
} from '../core/nativeBridge';
import { ensureMicPermission, finishRecording, formatDuration } from '../core/voice';
import { useThemedStyles } from '../theme';
import type { Palette } from '../theme/palettes';
import { font, radius, space } from '../theme/palettes';

/** Drag left past this and releasing throws the take away. */
const CANCEL_DISTANCE = 90;
/** Drag up past this and the recording keeps going without the finger. */
const LOCK_DISTANCE = 70;
/** Enough bars to read the last few seconds at a glance, few enough to stay cheap to render. */
const WAVE_BARS = 27;

type Phase = 'idle' | 'recording' | 'locked';

interface Props {
  onRecorded: (recording: VoiceRecording) => void;
  onError: (message: string) => void;
  /** Lets the composer hide the text field while the bar owns the row. */
  onActiveChange?: (active: boolean) => void;
  hero?: boolean;
}

/**
 * Hold-to-talk, with the two escapes the gesture needs: slide left to discard, slide up to keep
 * recording hands-free. Both are on the same drag, so the finger never has to find a second
 * target, and neither commits until release.
 *
 * Built on PanResponder rather than gesture-handler to match the drawer, and because the bar can
 * end up over a modal, where gesture-handler stops receiving touches on Android.
 */
export function VoiceRecorder({ onRecorded, onError, onActiveChange, hero }: Props) {
  const styles = useThemedStyles(createStyles);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [cancelIntent, setCancelIntent] = useState(false);

  // The pan callbacks are created once and never see a re-render, so every value they read has
  // to live in a ref. Reading `phase` there would pin it to 'idle' for the whole gesture.
  const phaseRef = useRef<Phase>('idle');
  const startingRef = useRef(false);
  const cancelRef = useRef(false);

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

  // The microphone must not outlive the bar: an unmount mid-take would leave it held.
  useEffect(
    () => () => {
      if (phaseRef.current !== 'idle') deviceBridge.cancelRecording().catch(() => {});
    },
    [],
  );

  const reset = useCallback(() => {
    cancelRef.current = false;
    setCancelIntent(false);
    setElapsedMs(0);
    setLevels([]);
    setPhaseBoth('idle');
  }, [setPhaseBoth]);

  const begin = useCallback(async () => {
    if (startingRef.current || phaseRef.current !== 'idle') return;
    startingRef.current = true;
    try {
      const permission = await ensureMicPermission();
      if (permission !== 'granted') {
        onError(
          permission === 'blocked'
            ? 'Microphone blocked. Enable it in Android settings.'
            : 'Microphone permission is needed to record.',
        );
        return;
      }
      // The finger may already be gone: a quick tap resolves the permission after the release,
      // and starting then would leave a recording nobody is holding.
      if (cancelRef.current) return;
      await deviceBridge.startRecording();
      if (cancelRef.current) {
        await deviceBridge.cancelRecording();
        return;
      }
      setPhaseBoth('recording');
    } catch {
      onError('Could not start recording.');
    } finally {
      startingRef.current = false;
    }
  }, [onError, setPhaseBoth]);

  const discard = useCallback(() => {
    cancelRef.current = true;
    deviceBridge.cancelRecording().catch(() => {});
    reset();
  }, [reset]);

  const finish = useCallback(async () => {
    if (phaseRef.current === 'idle') {
      // Released before the recorder was up; begin() sees the flag and stands down.
      cancelRef.current = true;
      return;
    }
    setPhaseBoth('idle');
    const outcome = await finishRecording();
    reset();
    if (outcome.ok) {
      onRecorded(outcome.recording);
      return;
    }
    onError(outcome.reason === 'too-short' ? 'Hold to record.' : 'Recording failed.');
  }, [onError, onRecorded, reset, setPhaseBoth]);

  const pan = useRef(
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
          setCancelIntent(false);
          setPhaseBoth('locked');
          return;
        }
        setCancelIntent(gesture.dx < -CANCEL_DISTANCE);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (phaseRef.current === 'locked') return;
        if (gesture.dx < -CANCEL_DISTANCE) {
          discard();
          return;
        }
        finish().catch(() => {});
      },
      onPanResponderTerminate: () => {
        if (phaseRef.current === 'locked') return;
        discard();
      },
    }),
  ).current;

  if (phase === 'idle') {
    return (
      <View
        {...pan.panHandlers}
        style={[styles.mic, hero && styles.micHero]}
        accessibilityRole="button"
        accessibilityLabel="Record voice message"
        accessibilityHint="Hold to record, slide left to cancel, slide up to lock">
        <MicGlyph color={styles.micGlyphColor.color} size={hero ? 22 : 20} />
      </View>
    );
  }

  const locked = phase === 'locked';
  return (
    <View style={styles.bar} accessibilityLabel="Recording voice message">
      <View style={styles.dot} />
      <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>

      {cancelIntent ? (
        <Text style={styles.cancelArmed} numberOfLines={1}>
          Release to cancel
        </Text>
      ) : (
        <Waveform levels={levels} styles={styles} />
      )}

      {locked ? (
        <>
          <Pressable
            onPress={discard}
            style={styles.barAction}
            accessibilityRole="button"
            accessibilityLabel="Cancel recording">
            <Text style={styles.barActionText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              finish().catch(() => {});
            }}
            style={[styles.mic, styles.micSend]}
            accessibilityRole="button"
            accessibilityLabel="Send voice message">
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path fill={styles.sendGlyphColor.color} d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
            </Svg>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint} numberOfLines={1}>
            {'\u2039 slide to cancel'}
          </Text>
          <View
            {...pan.panHandlers}
            style={[styles.mic, styles.micLive]}
            accessibilityRole="button"
            accessibilityLabel="Recording, release to send">
            <MicGlyph color={styles.micLiveGlyphColor.color} size={20} />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Rendered from the amplitude the recorder reports, not from a decoded waveform: it is proof the
 * microphone is actually hearing something. A flat line while you speak means a dead take, and
 * that is worth seeing before sending rather than after transcription comes back empty.
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
    const height = 3 + Math.round(Math.sqrt(level) * 19);
    bars.push(<View key={index} style={[styles.waveBar, { height }]} />);
  }
  return (
    <View style={styles.wave} accessibilityLabel="Microphone level">
      {bars}
    </View>
  );
}

function MicGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"
      />
    </Svg>
  );
}

const createStyles = (palette: Palette) => ({
  mic: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  micHero: { width: 50, height: 50 },
  micLive: { backgroundColor: palette.danger, borderColor: palette.danger },
  micSend: { backgroundColor: palette.accent, borderColor: palette.accent },
  micGlyphColor: { color: palette.accent },
  micLiveGlyphColor: { color: palette.accentText },
  sendGlyphColor: { color: palette.accentText },
  bar: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: 44,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.danger,
  },
  timer: {
    fontSize: font.meta,
    color: palette.text,
    fontVariant: ['tabular-nums' as const],
    minWidth: 34,
  },
  wave: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    height: 22,
  },
  waveBar: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
  },
  hint: { fontSize: font.small, color: palette.textFaint },
  cancelArmed: { flex: 1, fontSize: font.small, color: palette.danger, textAlign: 'center' as const },
  barAction: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  barActionText: { fontSize: font.meta, color: palette.danger },
});
