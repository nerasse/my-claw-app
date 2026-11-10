import React from 'react';
import { Text, View } from 'react-native';
import { dayLabel } from '../core/day';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * The day a run of messages belongs to, drawn once where that day starts.
 *
 * The thread carried only a clock on each bubble, so a conversation scrolled past midnight read
 * as one unbroken hour. It is a chip of its own between the rows rather than a caption on the
 * first bubble (owner, 2026-11-10: "je vois les heures, mais je ne vois pas du tout la journée").
 *
 * The label is read at draw time, not baked into the row: a thread left open past midnight says
 * "Today" for a day that has become yesterday as soon as anything redraws it.
 */
export const DaySeparator = React.memo(function DaySeparatorView({
  day,
}: {
  day: number;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row} accessibilityRole="header">
      <Text style={styles.label}>{dayLabel(day)}</Text>
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  // Inverted list: a margin top/bottom is the gap below/above the row on screen.
  row: { alignItems: 'center' as const, marginTop: space.xs, marginBottom: space.md },
  label: {
    fontSize: scaleFont(font.micro, scale),
    color: palette.textMuted,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    overflow: 'hidden' as const,
  },
});
