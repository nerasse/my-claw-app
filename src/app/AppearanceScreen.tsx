import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import type { UiPrefsResultFrame } from '../core/protocol';
import type { ThemeMode } from '../core/prefs';
import { font, scaleFont, useTheme } from '../theme';
import { Section, SettingsPageFrame, useSettingsStyles } from './settingsParts';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

/** The scales offered as a picker, and the label each one shows. 1 = the design size. */
const SCALE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.85, label: '85%' },
  { value: 1, label: '100%' },
  { value: 1.15, label: '115%' },
  { value: 1.3, label: '130%' },
];

/**
 * How the app looks, in one place: the theme was on Other, the text size and the folding on
 * General, three pages for one question (owner, 2026-10-04).
 */
export function AppearanceScreen({
  themeMode,
  onThemeModeChange,
  chatFontScale,
  onChatFontScaleChange,
  uiPrefs,
  onUiPrefsChange,
  onBack,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  /** Thread typography scale: 1 = the design sizes. Live, so the picker shows the current one. */
  chatFontScale: number;
  onChatFontScaleChange: (scale: number) => void;
  /** Server-owned display prefs; null until uiPrefs.get is answered. */
  uiPrefs: UiPrefsResultFrame | null;
  onUiPrefsChange: (prefs: { expandTools?: boolean; expandReasoning?: boolean }) => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  const { dark } = useTheme();
  return (
    <SettingsPageFrame title="Appearance" onBack={onBack}>
      <Section title="theme">
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
          {themeMode === 'system' ? `follows the device · currently ${dark ? 'dark' : 'light'}` : 'forced choice'}
        </Text>
      </Section>

      <Section title="text">
        <Text style={styles.switchTitle}>Message size</Text>
        <View style={styles.segment}>
          {SCALE_OPTIONS.map(option => {
            const selected = Math.abs(chatFontScale - option.value) < 0.001;
            return (
              <Pressable
                key={option.value}
                style={[styles.segmentItem, selected && styles.segmentItemActive]}
                onPress={() => onChatFontScaleChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Message size ${option.label}`}>
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {`messages, tools and reasoning · ${Math.round(scaleFont(font.body, chatFontScale))}pt body`}
        </Text>
      </Section>

      <Section title="folding">
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.switchTitle}>Always expand tool cards</Text>
            <Text style={styles.hint}>off: a call folds back to one line once it settles</Text>
          </View>
          <Switch
            value={uiPrefs?.expandTools ?? false}
            onValueChange={value => onUiPrefsChange({ expandTools: value })}
            disabled={!uiPrefs}
            accessibilityLabel="Always expand tool cards"
            accessibilityRole="switch"
          />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.switchTitle}>Always expand reasoning</Text>
            <Text style={styles.hint}>off: the model's thinking stays folded</Text>
          </View>
          <Switch
            value={uiPrefs?.expandReasoning ?? false}
            onValueChange={value => onUiPrefsChange({ expandReasoning: value })}
            disabled={!uiPrefs}
            accessibilityLabel="Always expand reasoning"
            accessibilityRole="switch"
          />
        </View>
      </Section>
    </SettingsPageFrame>
  );
}
