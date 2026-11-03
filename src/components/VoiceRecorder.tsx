import { ChevronIcon, MicIcon, StopIcon, TrashIcon } from './icons';
import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import type { VoiceRecording } from '../core/nativeBridge';
import { useRecordingGesture } from '../core/recordingGesture';
import { formatDuration } from '../core/voice';
import { useThemedStyles, type Palette, font, radius, space } from '../theme';
import { useVoiceCapture } from './useVoiceCapture';

interface Props {
  onRecorded: (recording: VoiceRecording) => void;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
  hero?: boolean;
}

export function VoiceRecorder({ hero, ...callbacks }: Props) {
  const styles = useThemedStyles(createStyles);
  const capture = useVoiceCapture(callbacks);
  const drag = useRef(new Animated.ValueXY()).current;
  const active = capture.phase !== 'idle';
  const locked = capture.phase === 'locked';
  const busy = capture.phase === 'starting' || capture.phase === 'stopping';
  const gesture = useRecordingGesture({
    canStart: capture.canStart,
    begin: () => {
      drag.setValue({ x: 0, y: 0 });
      capture.begin();
    },
    move: (dx, dy) => {
      drag.setValue({ x: Math.max(-90, Math.min(0, dx)), y: Math.max(-70, Math.min(0, dy)) });
      capture.move(dx, dy);
    },
    release: () => {
      capture.release();
      drag.setValue({ x: 0, y: 0 });
    },
    terminate: () => {
      capture.terminate();
      drag.setValue({ x: 0, y: 0 });
    },
  });

  return (
    <View style={[styles.row, active && styles.rowActive]}>
      {active ? (
        <View key="details" style={styles.details}>
          {locked ? (
            <Pressable onPress={capture.cancel} hitSlop={8} accessibilityLabel="Cancel recording" accessibilityRole="button">
              <TrashIcon size={17} color={styles.danger.color} />
            </Pressable>
          ) : <TrashIcon size={15} color={styles.muted.color} />}
          <View style={styles.dot} />
          <Text style={styles.timer} selectable={false}>{formatDuration(capture.elapsedMs)}</Text>
          <View style={styles.wave} pointerEvents="none" accessibilityLabel="Microphone level">
            {Array.from({ length: 22 }, (_, i) => (
              <View key={i} style={[styles.waveBar, { height: 3 + Math.sqrt(capture.levels[i] ?? 0) * 15 }]} />
            ))}
          </View>
          {!locked && !busy ? (
            <View style={styles.hint} pointerEvents="none">
              <ChevronIcon direction="left" size={12} color={styles.muted.color} />
              <Text style={styles.hintText} selectable={false}>Cancel</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {/* This target and its icon stay mounted. Only the visual moves, never the hit area. */}
      <View
        key="microphone"
        {...gesture}
        hitSlop={8}
        style={[styles.target, hero && styles.targetHero, gesture.style]}
        accessibilityRole="button"
        accessibilityLabel={locked ? 'Recording, hands free' : active ? 'Recording, release to keep' : 'Record voice message'}
        accessibilityHint="Hold to record, slide left to delete, slide up to keep your hands free">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.visual,
            active && styles.live,
            hero && styles.targetHero,
            (locked || busy) && styles.hidden,
            { transform: active ? drag.getTranslateTransform() : [] },
          ]}>
          <MicIcon size={hero ? 20 : 17} color={active ? styles.onFill.color : styles.muted.color} />
        </Animated.View>
        {busy ? <ActivityIndicator style={styles.overlay} size="small" color={styles.muted.color} /> : null}
        {locked ? (
          <Pressable
            onPress={capture.stop}
            style={[styles.visual, styles.live, styles.overlay]}
            accessibilityLabel="Stop recording"
            accessibilityRole="button">
            <StopIcon size={15} color={styles.onFill.color} />
          </Pressable>
        ) : null}
        {active && !locked && !busy ? (
          <View style={styles.lockHint} pointerEvents="none">
            <ChevronIcon direction="up" size={15} color={styles.muted.color} />
          </View>
        ) : null}
      </View>
      {capture.warning ? <Text style={styles.warning} accessibilityRole="alert">{capture.warning}</Text> : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const },
  rowActive: { flex: 1 },
  details: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingRight: space.sm },
  target: { width: 30, height: 30, justifyContent: 'center' as const, alignItems: 'center' as const },
  targetHero: { width: 40, height: 40 },
  visual: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  live: { backgroundColor: palette.accent },
  hidden: { opacity: 0 },
  overlay: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, right: 0 },
  lockHint: { position: 'absolute' as const, bottom: 36, alignSelf: 'center' as const },
  hint: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  hintText: { fontSize: font.micro, color: palette.textMuted },
  dot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: palette.danger },
  timer: { fontSize: font.small, fontVariant: ['tabular-nums' as const], color: palette.text },
  wave: { flex: 1, height: 20, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  waveBar: { flex: 1, borderRadius: radius.pill, backgroundColor: palette.accentSoft },
  warning: { position: 'absolute' as const, bottom: 36, left: 0, color: palette.danger, fontSize: font.micro },
  muted: { color: palette.textMuted },
  danger: { color: palette.danger },
  onFill: { color: palette.accentText },
});
