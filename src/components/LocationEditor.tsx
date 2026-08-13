import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { font, lineHeightFor, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * The editable half of the location sheet: one address field plus the facts nobody can edit.
 * The address is display text only — coordinates and accuracy stay exactly as captured.
 */
export function LocationEditor({
  value,
  onChange,
  meta,
}: {
  value: string;
  onChange: (text: string) => void;
  meta: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Address (optional)"
        placeholderTextColor={palette.textFaint}
        autoCorrect={false}
        accessibilityLabel="Location address"
      />
      <Text style={styles.meta}>{meta}</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { gap: space.xs, marginBottom: space.xs },
  input: {
    minHeight: 40,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    fontSize: font.meta,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  meta: { fontSize: font.small, color: palette.textFaint, lineHeight: lineHeightFor(font.small) },
});
