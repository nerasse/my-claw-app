import React from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { ThemeMode } from '../core/prefs';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

/**
 * The "Other" page: what the phone itself controls (appearance) and what helps when something
 * is wrong (troubleshooting). Everything server-side lives on the General page; this one holds
 * the settings that are about the app on this device.
 */
export function OtherSettingsScreen({
  themeMode,
  updateOnMobileData,
  onUpdateOnMobileDataChange,
  onThemeModeChange,
  onOpenDiagnostics,
  onBack,
}: {
  themeMode: ThemeMode;
  /** Auto-download the app update on mobile data (off = wifi only). */
  updateOnMobileData: boolean;
  onUpdateOnMobileDataChange: (value: boolean) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  onOpenDiagnostics: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const { dark } = useTheme();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Other</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.categoryItem}>
          <Text style={styles.section}>appearance</Text>
          <View style={styles.card}>
            <View style={styles.segment}>
              {THEME_OPTIONS.map(option => {
                const selected = option.mode === themeMode;
                return (
                  <Pressable
                    key={option.mode}
                    style={[styles.segmentItem, selected && styles.segmentItemActive]}
                    onPress={() => onThemeModeChange(option.mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Theme ${option.label}`}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {themeMode === 'system' ? `follows the phone · currently ${dark ? 'dark' : 'light'}` : 'forced choice'}
            </Text>
          </View>
        </View>

        <View style={styles.categoryItem}>
          <Text style={styles.section}>updates</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Download app update on mobile data</Text>
              <Switch
                value={updateOnMobileData}
                onValueChange={onUpdateOnMobileDataChange}
                accessibilityLabel="Download app update on mobile data"
              />
            </View>
            <Text style={styles.hint}>off = wifi only · the update downloads on its own when newer</Text>
          </View>
        </View>

        <View style={styles.categoryItem}>
          <Text style={styles.section}>troubleshooting</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={onOpenDiagnostics}
              accessibilityRole="button"
              accessibilityLabel="Open diagnostics">
              <Text style={[styles.buttonText, styles.buttonGhostText]}>Diagnostics</Text>
            </Pressable>
            <Text style={styles.hint}>server snapshot and logs, ready to copy</Text>
          </View>
        </View>
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
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  categoryItem: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  segment: {
    flexDirection: 'row' as const,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: 2,
    gap: 2,
  },
  segmentItem: { flex: 1, alignItems: 'center' as const, paddingVertical: 10, borderRadius: radius.sm - 1 },
  segmentItemActive: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  segmentText: { fontSize: font.meta, color: palette.textMuted },
  segmentTextActive: { color: palette.text, fontWeight: '600' as const },
  hint: { fontSize: font.small, color: palette.textFaint },
  button: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center' as const,
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border },
  buttonText: { color: palette.accentText, fontSize: font.meta, fontWeight: '600' as const },
  buttonGhostText: { color: palette.text },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  switchLabel: { flex: 1, fontSize: font.meta, color: palette.text },
});
