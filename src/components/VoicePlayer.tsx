import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlayPauseIcon } from './icons';
import { formatDuration, usePlaybackOf, voicePlayback } from '../core/voice';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/** Fixed bar count: the shape is decorative, and reading a real waveform would cost a decode. */
const BARS = 28;

/**
 * One recording, playable and seekable. The same control serves a sent bubble and a take still
 * waiting in the composer: a note is worth reviewing before it leaves, not only after.
 *
 * The bars are not the real waveform. Reading one would mean decoding the file on the phone for
 * a purely decorative result, so they are a stable shape seeded by the id: the same recording
 * always looks the same, which is what makes it recognisable in a scrollback, and nothing here
 * pretends to show audio it never read.
 */
export function VoicePlayer({
  id,
  uri,
  durationMs,
  onAccent,
  trailing,
}: {
  /** Seeds the silhouette, so a recording keeps its shape across renders and reloads. */
  id: string;
  /** Local file while the note is on this device, else the authenticated media url. */
  uri: string;
  durationMs?: number;
  /** Sitting on an accent-filled bubble, where the page colours have no contrast left. */
  onAccent?: boolean;
  /** Rendered at the end of the row, for a remove action on a staged take. */
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const playback = usePlaybackOf(uri);
  const playing = playback?.playing ?? false;

  const total = playback?.durationMs || durationMs || 0;
  const position = playback?.positionMs ?? 0;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  const toggle = useCallback(() => {
    voicePlayback.toggle(uri, durationMs ?? 0).catch(() => {});
  }, [durationMs, uri]);

  const seekTo = useCallback(
    (fraction: number) => {
      if (total > 0) voicePlayback.seek(Math.round(fraction * total)).catch(() => {});
    },
    [total],
  );

  const played = Math.round(progress * BARS);

  return (
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

      <View style={styles.bars} accessibilityLabel="Playback position">
        {Array.from({ length: BARS }, (_, index) => (
          <Pressable
            key={index}
            // The whole strip is the scrub target: a thumb cannot hit a 2 px bar, and a separate
            // slider under every recording is more chrome than the gesture is worth.
            onPress={() => seekTo((index + 0.5) / BARS)}
            style={styles.barHit}
            accessibilityRole="button"
            accessibilityLabel={`Seek to ${Math.round(((index + 0.5) / BARS) * 100)} percent`}>
            <View
              style={[
                styles.bar,
                onAccent && styles.barOnAccent,
                { height: barHeight(id, index) },
                index < played ? (onAccent ? styles.barPlayedOnAccent : styles.barPlayed) : null,
              ]}
            />
          </Pressable>
        ))}
      </View>

      <Text style={[styles.time, onAccent && styles.timeOnAccent]}>
        {/* Counts down while playing, like every player: what is left is the useful number. */}
        {formatDuration(playing || position > 0 ? Math.max(0, total - position) : total)}
      </Text>

      {trailing}
    </View>
  );
}

/** Deterministic from the id, so a recording keeps its silhouette across renders and reloads. */
function barHeight(seed: string, index: number): number {
  let hash = index * 31 + 7;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) % 100003;
  }
  return 5 + (hash % 15);
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: 36,
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonOnAccent: { backgroundColor: palette.accentText },
  glyph: { color: palette.accentText },
  glyphOnAccent: { color: palette.accent },
  bars: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 24,
    gap: 2,
  },
  barHit: { flex: 1, height: 24, justifyContent: 'center' as const },
  bar: { borderRadius: radius.pill, backgroundColor: palette.border },
  barOnAccent: { backgroundColor: palette.onAccentTrack },
  barPlayed: { backgroundColor: palette.accent },
  barPlayedOnAccent: { backgroundColor: palette.accentText },
  time: {
    fontSize: scaleFont(font.micro, scale),
    color: palette.textFaint,
    fontVariant: ['tabular-nums' as const],
    minWidth: 30,
    textAlign: 'right' as const,
  },
  timeOnAccent: { color: palette.onAccentMuted },
});
