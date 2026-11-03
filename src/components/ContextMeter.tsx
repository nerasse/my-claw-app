import React from 'react';
import { Text, View } from 'react-native';
import { shortTokens } from '../core/context';
import { radius, useThemedStyles, type Palette } from '../theme';

/**
 * How full the window is: the share, the two numbers it is a share of, and a track.
 *
 * The percentage alone is a number without a denominator, and 41 % of 175k is not 41 % of 1M --
 * the figure that decides when this conversation must be compacted is the ratio, and the figure
 * that says how much room is left is the pair. Both, in the title bar, which is the strip the
 * owner already scans.
 *
 * Never drawn on a narrow window: below 560 pt the share alone goes in the metadata line, and a
 * track there would take the room the title needs.
 */
export function ContextMeter({
  used,
  effective,
  percent,
  onPress,
}: {
  used: number;
  effective: number;
  /** To a tenth. Never clamped: a prompt over its ceiling is the moment worth seeing. */
  percent: number;
  onPress?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // A prompt past its ceiling keeps drawing past the end of the track rather than stopping at
  // 100 %, which would say "full" for the one case where it is over.
  const fill = Math.min(100, Math.max(0, percent));

  return (
    <View
      style={styles.wrap}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${percent}% of the context window used: ${shortTokens(used)} of ${shortTokens(effective)} tokens`}
      // The tap opens the context picker: the gauge is the number people ask about.
      {...(onPress ? { onStartShouldSetResponder: () => true, onResponderRelease: onPress } : {})}>
      <View style={styles.track}>
        <View style={[styles.fill, percent > 90 && styles.fillFull, { width: `${fill}%` }]} />
      </View>
      <Text style={styles.numbers}>
        <Text style={styles.strong}>{shortTokens(used)}</Text>
        {` / ${shortTokens(effective)}`}
      </Text>
      <Text style={[styles.percent, percent > 90 && styles.percentFull]}>{`${Math.round(percent)}%`}</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    height: 28,
    paddingLeft: 9,
    paddingRight: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  track: {
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.surfaceRaised,
    overflow: 'hidden' as const,
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: palette.accent },
  // Past 90 % the one colour that means "do something about it".
  fillFull: { backgroundColor: palette.danger },
  numbers: {
    fontSize: 11,
    color: palette.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  strong: { color: palette.text, fontWeight: '600' as const },
  // Behind its own rule: the share is a reading of the pair, not a third number beside it.
  percent: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: '500' as const,
    fontVariant: ['tabular-nums' as const],
    paddingLeft: 7,
    borderLeftWidth: 1,
    borderLeftColor: palette.surfaceRaised,
  },
  percentFull: { color: palette.warn, fontWeight: '600' as const },
});
