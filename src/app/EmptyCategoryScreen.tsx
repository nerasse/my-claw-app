import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';

/**
 * A settings category with no content yet: the row exists in the index so the structure is
 * visible, the page says so instead of pretending the category is not there.
 */
export function EmptyCategoryScreen({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <CloseButton />
      </View>

      <View style={styles.body}>
        <Text style={styles.empty}>nothing here yet</Text>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  body: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  empty: { fontSize: font.meta, color: palette.textFaint },
});
