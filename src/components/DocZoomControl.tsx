import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ZoomInIcon, ZoomOutIcon } from './icons';
import { useDocZoom } from '../core/docZoom';
import { radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * The reader's zoom: a minus, the percentage, a plus, in the top bar of every document.
 *
 * Two buttons rather than a slider because the target is a thumb on a phone and the whole range
 * is six steps; the percentage between them is what tells the reader where they are, and it is
 * itself a reset -- a page left at 200% three files ago should be one tap from normal, not five.
 *
 * At either end the button goes quiet instead of disappearing: a control that vanishes under the
 * finger reads as a bug, and the row keeps its width so the title never reflows.
 */
export function DocZoomControl(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const { canZoomIn, canZoomOut, scale, zoomIn, zoomOut } = useDocZoom();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={zoomOut}
        disabled={!canZoomOut}
        hitSlop={8}
        style={[styles.button, !canZoomOut && styles.quiet]}
        accessibilityRole="button"
        accessibilityLabel="Smaller text">
        <ZoomOutIcon size={16} color={canZoomOut ? palette.text : palette.textFaint} />
      </Pressable>
      <Text style={styles.value} numberOfLines={1}>
        {`${Math.round(scale * 100)}%`}
      </Text>
      <Pressable
        onPress={zoomIn}
        disabled={!canZoomIn}
        hitSlop={8}
        style={[styles.button, !canZoomIn && styles.quiet]}
        accessibilityRole="button"
        accessibilityLabel="Larger text">
        <ZoomInIcon size={16} color={canZoomIn ? palette.text : palette.textFaint} />
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    paddingHorizontal: space.xxs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  button: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quiet: { opacity: 0.45 },
  // Fixed width so the row does not breathe as the number changes from 85% to 100%.
  value: {
    minWidth: 38,
    textAlign: 'center' as const,
    fontSize: 11,
    color: palette.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
});
