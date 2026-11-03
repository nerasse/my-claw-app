import { ChevronIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

/** One numeric per-agent setting: the iteration budget or the context ceiling. A blank value
 *  removes the key so the default applies again; context cap accepts 0 (no ceiling). The frame
 *  saves immediately and the server answers with the whole agents snapshot. */
export function NumberEditorScreen({
  title,
  hint,
  value,
  placeholder,
  min,
  allowZero,
  error,
  saving,
  onBack,
  backLabel = 'Back to agent',
  onSave,
}: {
  title: string;
  hint: string;
  /** The current raw config value, null when absent. */
  value: number | null;
  placeholder: string;
  min: number;
  allowZero: boolean;
  error: string | null;
  saving: boolean;
  onBack: () => void;
  /** The page it returns to: an agent, or the tags list. */
  backLabel?: string;
  onSave: (value: number | null) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const parsed = draft.trim() === '' ? null : Number(draft);
  const valid =
    parsed === null ||
    (Number.isInteger(parsed) && parsed >= (allowZero ? 0 : min) && (allowZero ? parsed >= 0 : parsed > 0));

  const save = (): void => {
    if (!valid) return;
    onSave(draft.trim() === '' ? null : Number(draft));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={backLabel}>
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {hint}
          </Text>
        </View>
        <Pressable
          onPress={save}
          disabled={!valid || saving}
          style={[styles.saveButton, valid && !saving ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || saving }}
          accessibilityLabel={saving ? 'Saving number' : 'Save number'}>
          <Text style={valid && !saving ? styles.saveText : styles.saveTextOff}>
            {saving ? '...' : 'Save'}
          </Text>
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Number error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[styles.input, !valid ? styles.inputInvalid : null]}
          value={draft}
          onChangeText={setDraft}
          keyboardType="number-pad"
          autoCorrect={false}
          accessibilityLabel={`${title} value`}
        />
        <Text style={styles.note}>
          {placeholder} · a blank value restores the default
        </Text>
      </ScrollView>
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
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  saveButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  saveTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  body: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: font.body,
    color: palette.text,
  },
  inputInvalid: { borderColor: palette.danger },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
