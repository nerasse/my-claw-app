import React, { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSheetBottomInset } from '../core/keyboard';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * Bottom sheet asking for one line of text.
 *
 * Android has no `Alert.prompt`, and a sheet keeps the same shape as the menu it opens from
 * instead of dropping a system dialog on top of the app.
 */
export function PromptSheet({
  title,
  hint,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  maxLength,
  onSubmit,
  onClose,
}: {
  title: string;
  /** Explains what an empty value does, when leaving it empty is a real choice. */
  hint?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxLength?: number;
  onSubmit: (value: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  // The field is autofocused: without this the keyboard opens straight over the sheet.
  const bottomInset = useSheetBottomInset(space.xl);
  const [value, setValue] = useState(initialValue);

  const submit = (): void => {
    onSubmit(value);
    close();
  };

  // The field is autofocused: the keyboard outlives the sheet if it is not told to go,
  // and tapping outside or Cancel would leave it floating over the chat.
  const close = (): void => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityLabel="Close menu"
      />
      {/* Same absolute-positioning trap as the drawer: pad the gesture bar ourselves. */}
      <View style={[styles.sheet, { paddingBottom: bottomInset }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title}</Text>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          placeholder={placeholder}
          placeholderTextColor={palette.textFaint}
          maxLength={maxLength}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          accessibilityLabel={title}
        />

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <View style={styles.row}>
          <Pressable
            onPress={close}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Cancel">
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            style={[styles.button, styles.buttonPrimary]}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}>
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{confirmLabel}</Text>
          </Pressable>
        </View>
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
    gap: space.md,
  },
  grabber: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.border,
    marginBottom: space.xs,
  },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  input: {
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  hint: { fontSize: font.small, color: palette.textFaint, marginTop: -space.xs },
  row: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: space.sm },
  button: {
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonPrimary: { backgroundColor: palette.accent, borderColor: palette.accent },
  buttonText: { fontSize: font.meta, color: palette.text },
  buttonTextPrimary: { color: palette.accentText, fontWeight: '600' as const },
});
