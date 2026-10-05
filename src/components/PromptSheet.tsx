import React, { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSheetBottomInset } from '../core/keyboard';
import { useLayout } from '../core/layout';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { keyLayerProps } from '../core/keyNav';

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
  invalid,
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
  /** Why a value cannot be submitted, or null: said under the field, and the confirm waits. */
  invalid?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const { dialogs } = useLayout();
  // The field is autofocused: without this the keyboard opens straight over the sheet.
  const bottomInset = useSheetBottomInset(space.xl);
  const [value, setValue] = useState(initialValue);

  const problem = invalid?.(value) ?? null;

  const submit = (): void => {
    if (problem) return;
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
    <View style={[styles.backdrop, dialogs && styles.backdropCentered]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityLabel="Close menu"
      />
      {/* Same absolute-positioning trap as the drawer: pad the gesture bar ourselves. */}
      <View
        {...keyLayerProps('menu')}
        style={[
          styles.sheet,
          { paddingBottom: dialogs ? space.lg : bottomInset },
          dialogs && styles.dialog,
        ]}>
        {dialogs ? null : <View style={styles.grabber} />}
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

        {problem ? (
          <Text style={[styles.hint, styles.problem]} accessibilityLabel={`Problem ${problem}`}>
            {problem}
          </Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}

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
            disabled={problem !== null}
            style={[styles.button, styles.buttonPrimary, problem !== null && styles.buttonOff]}
            accessibilityRole="button"
            accessibilityState={{ disabled: problem !== null }}
            accessibilityLabel={confirmLabel}>
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  problem: { color: palette.danger },
  buttonOff: { opacity: 0.5 },
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end' as const,
  },
  backdropCentered: { justifyContent: 'center' as const, alignItems: 'center' as const },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
  },
  dialog: {
    width: 440,
    maxWidth: '92%' as const,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingTop: space.lg,
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
