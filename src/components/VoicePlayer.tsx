import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { DownloadControl } from './DownloadControl';
import { PlayPauseIcon } from './icons';
import type { DownloadTarget } from '../core/download';
import { formatDuration, usePlaybackOf, usePlaybackRate, voicePlayback } from '../core/voice';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/** Fixed bar count: the shape is decorative, and reading a real waveform would cost a decode. */
const BARS = 36;
/** What an accessibility increment moves, as a share of the recording. */
const ACCESSIBLE_STEP = 0.1;

/**
 * One recording, playable, seekable and saveable. The same control serves a sent bubble and a
 * take still waiting in the composer: a note is worth reviewing before it leaves, not only after.
 *
 * Two lines, like Telegram: the waveform gets the whole width, which is what makes a drag on it
 * precise; time, speed and download sit under it.
 *
 * The bars are not the real waveform. Reading one would mean decoding the file on the phone for
 * a purely decorative result, so they are a stable shape seeded by the id: the same recording
 * always looks the same, which is what makes it recognisable in a scrollback.
 */
export function VoicePlayer({
  id,
  uri,
  durationMs,
  onAccent,
  trailing,
  download,
}: {
  /** Seeds the silhouette, so a recording keeps its shape across renders and reloads. */
  id: string;
  /** Local file while the note is on this device, else the authenticated media url. */
  uri: string;
  durationMs?: number;
  /** Sitting on an accent-filled bubble, where the page colours have no contrast left. */
  onAccent?: boolean;
  /** Rendered at the end of the first line, for a remove action on a staged take. */
  trailing?: React.ReactNode;
  /** The server copy, once there is one: a take still on the device has nothing to save. */
  download?: DownloadTarget;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const playback = usePlaybackOf(uri);
  const playing = playback?.playing ?? false;
  const rate = usePlaybackRate();
  const [width, setWidth] = useState(0);
  /** Where the finger is while it drags, drawn instead of the player's position until release. */
  const [scrub, setScrub] = useState<number | null>(null);

  const total = playback?.durationMs || durationMs || 0;
  const position = playback?.positionMs ?? 0;
  const progress = scrub ?? (total > 0 ? Math.min(1, position / total) : 0);

  const toggle = useCallback(() => {
    voicePlayback.toggle(uri, durationMs ?? 0).catch(() => {});
  }, [durationMs, uri]);

  const seekTo = useCallback(
    (fraction: number) => {
      if (total <= 0) return;
      const clamped = Math.min(1, Math.max(0, fraction));
      voicePlayback.seek(uri, Math.round(clamped * total), total).catch(() => {});
    },
    [total, uri],
  );

  const scrubGesture = useMemo(() => {
    const at = (x: number): number => (width > 0 ? Math.min(1, Math.max(0, x / width)) : 0);
    // A tap jumps; a drag previews and seeks once, on release. The drag only claims horizontal
    // movement, so the conversation still scrolls under a vertical swipe that starts here.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .withTestId(`voiceTap-${id}`)
      .onEnd((event, success) => {
        if (success) seekTo(at(event.x));
      });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .withTestId(`voiceScrub-${id}`)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onStart(event => setScrub(at(event.x)))
      .onUpdate(event => setScrub(at(event.x)))
      .onEnd((event, success) => {
        if (success) seekTo(at(event.x));
      })
      .onFinalize(() => setScrub(null));
    return Gesture.Exclusive(pan, tap);
  }, [id, seekTo, width]);

  const played = Math.round(progress * BARS);
  const engaged = playing || position > 0 || scrub !== null;
  // While dragging, the time under the finger; otherwise it counts down like every player.
  const shown = scrub !== null ? scrub * total : playing || position > 0 ? Math.max(0, total - position) : total;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          style={[styles.button, onAccent && styles.buttonOnAccent]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}>
          <PlayPauseIcon
            playing={playing}
            size={16}
            color={onAccent ? styles.glyphOnAccent.color : styles.glyph.color}
          />
        </Pressable>

        <GestureDetector gesture={scrubGesture}>
          <View
            style={styles.bars}
            onLayout={event => setWidth(event.nativeEvent.layout.width)}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Playback position"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={event =>
              seekTo(progress + (event.nativeEvent.actionName === 'increment' ? ACCESSIBLE_STEP : -ACCESSIBLE_STEP))
            }>
            {Array.from({ length: BARS }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.bar,
                  onAccent && styles.barOnAccent,
                  { height: barHeight(id, index) },
                  index < played ? (onAccent ? styles.barPlayedOnAccent : styles.barPlayed) : null,
                ]}
              />
            ))}
            {engaged ? (
              <View
                pointerEvents="none"
                style={[styles.thumb, onAccent && styles.thumbOnAccent, { left: `${progress * 100}%` }]}
              />
            ) : null}
          </View>
        </GestureDetector>

        {trailing}
      </View>

      <View style={styles.meta}>
        <Text style={[styles.time, onAccent && styles.timeOnAccent]}>{formatDuration(shown)}</Text>
        <View style={styles.spacer} />
        <Pressable
          onPress={() => {
            voicePlayback.cycleRate().catch(() => {});
          }}
          style={[styles.rate, onAccent && styles.rateOnAccent, rate !== 1 && (onAccent ? styles.rateActiveOnAccent : styles.rateActive)]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${formatRate(rate)}`}>
          <Text
            style={[
              styles.rateText,
              onAccent && styles.rateTextOnAccent,
              rate !== 1 && (onAccent ? styles.rateTextActiveOnAccent : styles.rateTextActive),
            ]}>
            {formatRate(rate)}
          </Text>
        </Pressable>
        {download ? (
          <DownloadControl targets={[download]} variant="row" tone={onAccent ? 'light' : 'default'} />
        ) : null}
      </View>
    </View>
  );
}

function formatRate(rate: number): string {
  return `${rate}\u00d7`;
}

/** Deterministic from the id, so a recording keeps its silhouette across renders and reloads. */
function barHeight(seed: string, index: number): number {
  let hash = index * 31 + 7;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) % 100003;
  }
  return 5 + (hash % 15);
}

const BUTTON = 30;
const THUMB = 10;

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  wrap: { gap: 2 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: 36,
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonOnAccent: { backgroundColor: palette.accentText },
  glyph: { color: palette.accentText },
  glyphOnAccent: { color: palette.accent },
  // Taller than the bars: the strip is the drag target, and a thumb needs room to land on it.
  bars: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    height: 32,
  },
  bar: { width: 2, borderRadius: radius.pill, backgroundColor: palette.border },
  barOnAccent: { backgroundColor: palette.onAccentTrack },
  barPlayed: { backgroundColor: palette.accent },
  barPlayedOnAccent: { backgroundColor: palette.accentText },
  thumb: {
    position: 'absolute' as const,
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
  },
  thumbOnAccent: { backgroundColor: palette.accentText },
  // Under the waveform, starting where it starts.
  meta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingLeft: BUTTON + space.sm,
  },
  spacer: { flex: 1 },
  time: {
    fontSize: scaleFont(font.micro, scale),
    color: palette.textFaint,
    fontVariant: ['tabular-nums' as const],
  },
  timeOnAccent: { color: palette.onAccentMuted },
  // Fixed width: the label goes from "1×" to "1.5×", and the row must not shift under the thumb.
  rate: {
    minWidth: 38,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rateOnAccent: { borderColor: palette.onAccentTrack },
  rateActive: { borderColor: palette.accent },
  rateActiveOnAccent: { borderColor: palette.accentText },
  rateText: {
    fontSize: scaleFont(font.micro, scale),
    fontWeight: '600' as const,
    color: palette.textFaint,
    fontVariant: ['tabular-nums' as const],
  },
  rateTextOnAccent: { color: palette.onAccentMuted },
  rateTextActive: { color: palette.accent },
  rateTextActiveOnAccent: { color: palette.accentText },
});
