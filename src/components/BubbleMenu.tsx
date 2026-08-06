import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export interface BubbleMenuAction {
  label: string;
  danger?: boolean;
  onPress: () => void;
}

/** Bottom sheet for message and conversation actions. Tapping outside closes it. */
export function BubbleMenu({
  preview,
  actions,
  onClose,
}: {
  preview: string;
  actions: BubbleMenuAction[];
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      {/* Same absolute-positioning trap as the drawer: pad the gesture bar ourselves. */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.grabber} />
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
        {actions.map(action => (
          <Text
            key={action.label}
            style={[styles.action, action.danger && styles.actionDanger]}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}>
            {action.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.xs,
  },
  grabber: {
    alignSelf: 'center' as const,
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.border,
    marginBottom: space.sm,
  },
  preview: {
    fontSize: font.meta,
    color: palette.textMuted,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: space.sm,
    marginBottom: space.xs,
  },
  action: { fontSize: font.title, color: palette.text, paddingVertical: space.md },
  actionDanger: { color: palette.danger },
});
