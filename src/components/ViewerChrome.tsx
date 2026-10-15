import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CollapseIcon, ExpandIcon } from './icons';
import { radius, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * Where a viewer draws: over the whole window, or inside the right-hand pane beside the
 * conversation (owner, 2026-10-15: an attachment on a wide screen opens on the right, "comme les
 * autres menus").
 *
 * The two presentations differ in more than a border. An overlay is laid out against the shell's
 * outer box and clears the status bar itself; embedded, that same inset would be paid inside a
 * pane that has already cleared it, and `absoluteFill` would cover the pane's neighbours instead
 * of filling the pane. So the viewers ask this wrapper rather than hard-coding either.
 */
export function ViewerStage({
  embedded = false,
  insetTop = false,
  style,
  children,
  ...rest
}: {
  embedded?: boolean;
  /** Pay the status bar: true for every overlay whose own bars do not already do it. */
  insetTop?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
} & Omit<Partial<ViewProps>, 'style' | 'children'>): React.JSX.Element {
  const insets = useSafeAreaInsets();
  if (embedded) {
    return (
      <View style={[styles.embedded, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, insetTop ? { top: insets.top } : null, style]} {...rest}>
      {children}
    </View>
  );
}

/**
 * The expand control of a viewer's top bar: to the pane, or to the window.
 *
 * Drawn only where the choice exists -- the shell passes the handler on a window wide enough for
 * the pane, and withholds it everywhere else, so a phone never shows a button that changes
 * nothing. `tone` follows the bar it sits in: a picture's and a film's bars are white on black,
 * the readers' bars are themed.
 */
export function FullscreenToggle({
  embedded,
  onPress,
  tone = 'default',
}: {
  embedded: boolean;
  onPress: () => void;
  tone?: 'default' | 'light';
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const ink = tone === 'light' ? '#fff' : palette.text;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={tone === 'light' ? styles.light : styles.default}
      accessibilityRole="button"
      accessibilityLabel={embedded ? 'Read it full screen' : 'Read it beside the conversation'}>
      {embedded ? <ExpandIcon size={18} color={ink} /> : <CollapseIcon size={18} color={ink} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  embedded: { flex: 1 },
});

const createStyles = (palette: Palette) => ({
  default: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  light: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
