import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PendingAttachment } from '../core/upload';
import { formatDuration, usePlaybackOf, voicePlayback } from '../core/voice';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * A recorded take waiting in the composer.
 *
 * Named like a file it would read `voice-2026-08-06T21-14-02.m4a - 13.3 KB`, which says nothing
 * about the only two questions at that moment: how long is it, and is it the one I meant. So it
 * offers the length and a way to hear it back before anything is sent.
 */
export function VoiceChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const playback = usePlaybackOf(attachment.uri);
  const playing = playback?.playing ?? false;
  const total = attachment.durationMs ?? 0;
  const position = playback?.positionMs ?? 0;

  const toggle = useCallback(() => {
    voicePlayback.toggle(attachment.uri, total).catch(() => {});
  }, [attachment.uri, total]);

  return (
    <View style={styles.chip}>
      <Pressable
        onPress={toggle}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}>
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path
            fill={styles.glyph.color}
            d={playing ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z'}
          />
        </Svg>
      </Pressable>

      <Text style={styles.label}>
        {/* Counts down while playing, like every player: what is left is the useful number. */}
        {formatDuration(playing || position > 0 ? Math.max(0, total - position) : total)}
      </Text>

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove voice message">
          <Text style={styles.remove}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  glyph: { color: palette.accent },
  label: {
    fontSize: font.small,
    color: palette.text,
    fontVariant: ['tabular-nums' as const],
    minWidth: 28,
  },
  remove: { fontSize: font.meta, lineHeight: 15, color: palette.textMuted },
});
