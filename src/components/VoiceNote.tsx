import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlayPauseIcon } from './icons';
import type { AttachmentMeta } from '../core/protocol';
import { formatDuration, usePlaybackOf, voicePlayback } from '../core/voice';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/** Fixed bar count: the shape is decorative, and decoding a waveform for it would cost a decode. */
const BARS = 24;

/**
 * A sent voice note, playable in place.
 *
 * The bars are not the real waveform. Reading one would mean decoding the file on the phone for
 * a purely decorative result, so they are a stable pseudo-random shape seeded by the id: the same
 * note always looks the same, which is what makes it recognisable in a scrollback, and no bubble
 * pretends to show audio it never read.
 */
export function VoiceNote({
  att,
  uri,
  transcript,
  onAccent,
}: {
  att: AttachmentMeta;
  /** Local file while the note is still on this device, else the authenticated media url. */
  uri: string;
  /** Filled in once the server reports what it heard. */
  transcript?: string;
  /** Sitting on an accent-filled bubble, where the page colours have no contrast left. */
  onAccent?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const playback = usePlaybackOf(uri);
  const playing = playback?.playing ?? false;

  const total = playback?.durationMs || att.durationMs || 0;
  const position = playback?.positionMs ?? 0;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  const toggle = useCallback(() => {
    voicePlayback.toggle(uri, att.durationMs ?? 0).catch(() => {});
  }, [att.durationMs, uri]);

  const seekTo = useCallback(
    (fraction: number) => {
      if (total > 0) voicePlayback.seek(Math.round(fraction * total)).catch(() => {});
    },
    [total],
  );

  const played = Math.round(progress * BARS);

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
            color={onAccent ? styles.buttonGlyphOnAccent.color : styles.buttonGlyph.color}
          />
        </Pressable>

        <View style={styles.bars} accessibilityLabel="Playback position">
          {Array.from({ length: BARS }, (_, index) => (
            <Pressable
              key={index}
              // The whole strip is the scrub target: a thumb cannot hit a 2 px bar, and a
              // separate slider under a chat bubble is more chrome than the gesture is worth.
              onPress={() => seekTo((index + 0.5) / BARS)}
              style={styles.barHit}
              accessibilityRole="button"
              accessibilityLabel={`Seek to ${Math.round(((index + 0.5) / BARS) * 100)} percent`}>
              <View
                style={[
                  styles.bar,
                  onAccent && styles.barOnAccent,
                  { height: barHeight(att.id, index) },
                  index < played ? (onAccent ? styles.barPlayedOnAccent : styles.barPlayed) : null,
                ]}
              />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.time, onAccent && styles.timeOnAccent]}>
          {formatDuration(playing || position > 0 ? Math.max(0, total - position) : total)}
        </Text>
      </View>

      {transcript ? (
        <Text style={[styles.transcript, onAccent && styles.transcriptOnAccent]}>{transcript}</Text>
      ) : null}
    </View>
  );
}

/** Deterministic from the id, so a note keeps its silhouette across renders and reloads. */
function barHeight(seed: string, index: number): number {
  let hash = index * 31 + 7;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) % 100003;
  }
  return 5 + (hash % 14);
}

const createStyles = (palette: Palette) => ({
  wrap: { marginBottom: space.xs, gap: 3 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minWidth: 190,
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Inverted on an accent bubble: an accent button on an accent fill has no edge at all.
  buttonOnAccent: { backgroundColor: palette.accentText },
  buttonGlyph: { color: palette.accentText },
  buttonGlyphOnAccent: { color: palette.accent },
  bars: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 22,
    gap: 2,
  },
  barHit: { flex: 1, height: 22, justifyContent: 'center' as const },
  bar: { borderRadius: radius.pill, backgroundColor: palette.border },
  barOnAccent: { backgroundColor: palette.onAccentTrack },
  barPlayed: { backgroundColor: palette.accent },
  barPlayedOnAccent: { backgroundColor: palette.accentText },
  time: {
    fontSize: font.micro,
    color: palette.textFaint,
    fontVariant: ['tabular-nums' as const],
    minWidth: 30,
    textAlign: 'right' as const,
  },
  timeOnAccent: { color: palette.onAccentMuted },
  /**
   * The transcript sits inside the bubble instead of arriving as its own message: what was said
   * and the recording of it are one thing, and a separate echo pushed the conversation apart.
   */
  transcript: {
    fontSize: font.small,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
    maxWidth: 260,
  },
  transcriptOnAccent: { color: palette.onAccentMuted },
});
