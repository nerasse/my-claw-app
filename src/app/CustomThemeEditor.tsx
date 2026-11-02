import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { contrast } from '../theme/derive';
import {
  SOURCE_FIELDS,
  customPalette,
  duplicateSeeds,
  hasCustom,
  parseHex,
  type CustomTheme,
} from '../theme/customPalette';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * The custom palette, in the mode currently on screen.
 *
 * Ten fields, not thirty: the elevations, the two greys, the bubble, the code plate and the diff
 * washes are all arithmetic on these ten, and the arithmetic is the one the ten shipped themes go
 * through (theme/derive.ts). A field that could be typed is a field whose guarantees would have
 * to be re-checked by eye after every edit.
 *
 * Editing is per mode. The same pair of colours that reads well on white is mud on black, so the
 * editor says which half it is editing and switches with the mode.
 */
export function CustomThemeEditor({
  custom,
  onChange,
  themeId,
}: {
  custom: CustomTheme;
  onChange: (custom: CustomTheme) => void;
  /** The named theme "Duplicate" copies from. */
  themeId: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { mode, dark } = useTheme();
  // `system` edits whichever half is on screen: that is the one the owner is looking at.
  const editing: 'light' | 'dark' = mode === 'light' ? 'light' : mode === 'amoled' ? 'dark' : dark ? 'dark' : 'light';
  const seeds = custom[editing];
  const palette = useMemo(() => customPalette(custom, editing), [custom, editing]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.note}>
        {`editing the ${editing} half · ${mode === 'amoled' ? 'AMOLED derives from dark' : mode === 'system' ? 'system resolves to it' : mode}`}
      </Text>
      {SOURCE_FIELDS.map(field => (
        <ColorField
          key={field.key}
          label={field.label}
          value={seeds[field.key] ?? defaultSeed(palette, field.key)}
          onCommit={next =>
            onChange({ ...custom, [editing]: { ...seeds, [field.key]: next } })
          }
          // Every one of these is read on the background, so every one is measured against it.
          against={seeds.bg ?? defaultSeed(palette, 'bg')}
        />
      ))}
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={() => onChange(hasCustom(custom) ? { light: {}, dark: {} } : duplicateSeeds(themeId))}
          accessibilityRole="button"
          accessibilityLabel={hasCustom(custom) ? 'Reset the custom colours' : 'Duplicate the current theme'}>
          <Text style={styles.actionText}>{hasCustom(custom) ? 'Reset to derived' : 'Duplicate this theme'}</Text>
        </Pressable>
        {hasCustom(custom) ? (
          <Pressable
            style={styles.action}
            onPress={() => onChange({ ...custom, [editing]: {} })}
            accessibilityRole="button"
            accessibilityLabel={`Reset the ${editing} colours`}>
            <Text style={styles.actionText}>{`Reset ${editing}`}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** The value a field shows before it is typed: what the derivation produced for it. */
function defaultSeed(palette: Palette, key: string): string {
  switch (key) {
    case 'bg':
      return palette.bg;
    case 'surface':
      return palette.surface;
    case 'line':
      return palette.border;
    case 'ink':
      return palette.text;
    case 'muted':
      return palette.textMuted;
    case 'faint':
      return palette.textFaint;
    case 'accent':
      return palette.accent;
    case 'ok':
      return palette.ok;
    case 'warn':
      return palette.warn;
    default:
      return palette.danger;
  }
}

/**
 * One hex, one swatch, one ratio.
 *
 * The value is only committed on blur or after a pause: a half-typed `#8a3` is not a colour, and
 * a palette rebuilt on every keystroke would be a `StyleSheet.create` per character.
 */
function ColorField({
  label,
  value,
  against,
  onCommit,
}: {
  label: string;
  value: string;
  /** The background this colour is read on: what the ratio means. */
  against: string;
  onCommit: (hex: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState(value);
  // A commit from elsewhere (a reset, a mode switch) has to win over a stale draft.
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    const hex = parseHex(draft);
    if (hex && hex !== value) onCommit(hex);
    else setDraft(value);
  };

  const ratio = contrast(value, against);
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: value }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.ratio, ratio < 3 && styles.ratioBad]}>
        {label === 'Background' || label === 'Surface' || label === 'Hairline' ? '' : `${ratio.toFixed(1)}:1`}
      </Text>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        accessibilityLabel={`${label} colour`}
        placeholderTextColor="#8a8378"
      />
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { gap: space.xs, paddingTop: space.sm },
  note: { fontSize: font.micro, color: palette.textMeta, paddingHorizontal: space.xs },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: 2,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  label: { flex: 1, fontSize: font.meta, color: palette.text },
  ratio: { width: 46, textAlign: 'right' as const, fontSize: font.micro, color: palette.textMeta },
  ratioBad: { color: palette.danger },
  input: {
    width: 84,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    fontFamily: 'monospace',
    fontSize: font.small,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    textAlign: 'center' as const,
  },
  actions: { flexDirection: 'row' as const, gap: space.sm, paddingTop: space.xs },
  action: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionText: { fontSize: font.small, color: palette.text },
});
