import { ChevronIcon } from './icons';
import React from 'react';
import { Pressable } from 'react-native';
import { radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The settings pages' Back: a 40pt square holding one chevron. Most pages draw it from their own
 * styles; the ones that drifted (a bare glyph, a smaller target) use this one.
 */
export function BackButton({ onPress, label }: { onPress: () => void; label: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} style={styles.button} accessibilityRole="button" accessibilityLabel={label}>
      <ChevronIcon direction="left" size={22} tone="text" />
    </Pressable>
  );
}

/** The header those pages sit under: the shell pads the page, the header draws its rule. */
export const headerStyle = (palette: Palette) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: space.md,
  paddingBottom: space.sm,
  borderBottomWidth: 1,
  borderBottomColor: palette.border,
});

const createStyles = (palette: Palette) => ({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
