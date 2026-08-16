import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '../core/layout';
import { DRAWER_WIDTH, space, useThemedStyles, type Palette } from '../theme';

/**
 * A screen written for the shell's padded container, shown as a layer over another screen.
 *
 * Two things the container was doing for it have to be done here instead. It paints the stage:
 * a layer with no background is transparent, and the page underneath keeps showing through its
 * own header. And it clears the status bar: an absolutely positioned child is laid out against
 * the shell's outer box, insets included, so a layer that does not pay the top inset draws its
 * first row under the clock. Both were visible at once on the nested AGENTS.md editor, opened
 * over the conversation's Instructions page: two headers, stacked, one of them too high.
 *
 * The padding matches the shell container, so a screen looks the same on either side of the door.
 */
export function ScreenLayer({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  // The conversation list is a column of the layout on a desktop, not something to be covered:
  // a layer starts where that column ends.
  const { pinnedDrawer } = useLayout();

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.stage,
        { paddingTop: insets.top + space.sm },
        pinnedDrawer && { left: DRAWER_WIDTH },
      ]}>
      {children}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  stage: {
    backgroundColor: palette.bg,
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
  },
});
