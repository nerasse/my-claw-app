import React from 'react';
import { Pressable, Text, View, type PressableStateCallbackType } from 'react-native';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * Continue, at the foot of the thread: a pill on its own row under the last run when that run
 * stopped, failed or was lost -- docs/continue.md on the server.
 *
 * It was the last word of the run's signature, in its smallest type, on the same line as the
 * bubble's `⋯`: two touch targets side by side, and the owner kept opening the menu instead
 * (2026-10-02). Centered and thumb-sized, like the "continue generating" of the chat apps, with
 * nothing else on its row to be hit by mistake.
 */
export function ContinueButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
          styles.pill,
          hovered ? styles.hovered : null,
          pressed ? styles.pressed : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Continue where it stopped">
        <Text style={styles.label}>↻  Continue</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { alignItems: 'center' as const, paddingVertical: space.md },
  pill: {
    minHeight: 44,
    minWidth: 160,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  hovered: { opacity: 0.85 },
  pressed: { opacity: 0.6 },
  label: { fontSize: scaleFont(font.body, scale), color: palette.accent, fontWeight: '600' as const },
});
