import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import type { UiPrefsResultFrame } from '../core/protocol';
import type { ThemeMode } from '../core/prefs';
import { CheckIcon } from '../components/icons';
import {
  font,
  radius,
  scaleFont,
  space,
  themeIds,
  themeModes,
  themes,
  useTheme,
  useThemedStyles,
  type Palette,
  type ThemeId,
} from '../theme';
import { customPalette, hasCustom, type CustomTheme } from '../theme/customPalette';
import { CustomThemeEditor } from './CustomThemeEditor';
import { Section, SettingsPageFrame, useSettingsStyles } from './settingsParts';

/** The scales offered as a picker, and the label each one shows. 1 = the design size. */
const SCALE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.85, label: '85%' },
  { value: 1, label: '100%' },
  { value: 1.15, label: '115%' },
  { value: 1.3, label: '130%' },
];

const swatchStyles = {
  frame: {
    width: 34,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    padding: 3,
  },
  bubble: { width: 14, height: 7, borderRadius: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
};

/**
 * A theme seen from the outside: its background, its user bubble, its accent. Three shapes and
 * no more -- a full preview would be a second implementation of every screen.
 */
function Swatch({ palette }: { palette: Palette }): React.JSX.Element {
  return (
    <View style={[swatchStyles.frame, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={[swatchStyles.bubble, { backgroundColor: palette.bubbleUserBg }]} />
      <View style={[swatchStyles.dot, { backgroundColor: palette.accent }]} />
    </View>
  );
}

/**
 * How the app looks, in one place: the palette, the mode, the text size and the folding.
 *
 * The theme control left the title bar on 2026-11-02. A theme is a setting changed every few
 * months, not a control, and the bar is the busiest strip of the app.
 */
export function AppearanceScreen({
  themeId,
  onThemeIdChange,
  custom,
  onCustomChange,
  themeMode,
  onThemeModeChange,
  chatFontScale,
  onChatFontScaleChange,
  uiPrefs,
  onUiPrefsChange,
  onBack,
}: {
  themeId: ThemeId;
  onThemeIdChange: (themeId: ThemeId) => void;
  /** The colours of the `custom` palette, when one is written. */
  custom: CustomTheme;
  onCustomChange: (custom: CustomTheme) => void;
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
  const own = useThemedStyles(localStyles);
  const { dark } = useTheme();
  // The swatches follow the mode on screen: the same theme in light and in dark are two colours.
  const preview = themeMode === 'light' ? 'light' : themeMode === 'amoled' ? 'amoled' : dark ? 'dark' : 'light';

  return (
    <SettingsPageFrame title="Appearance" onBack={onBack}>
      <Section title="theme">
        {themeIds.map(id => {
          const set = themes[id];
          const selected = id === themeId;
          return (
            <Pressable
              key={id}
              style={[own.themeRow, selected && own.themeRowActive]}
              onPress={() => onThemeIdChange(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Theme ${set.label}`}>
              <Swatch palette={set[preview]} />
              <View style={own.themeMain}>
                <Text style={[own.themeLabel, selected && own.themeLabelActive]}>{set.label}</Text>
                <Text style={own.themeSource} numberOfLines={1}>
                  {set.source}
                </Text>
              </View>
              {selected ? <CheckIcon size={16} tone="accent" /> : null}
            </Pressable>
          );
        })}
        {/* Last, and only useful once it holds something: pressing it with nothing written
            duplicates the theme on screen, which is the only sane starting point. */}
        <Pressable
          style={[own.themeRow, themeId === 'custom' && own.themeRowActive]}
          onPress={() => onThemeIdChange('custom')}
          accessibilityRole="radio"
          accessibilityState={{ selected: themeId === 'custom' }}
          accessibilityLabel="Theme Custom">
          <Swatch
            palette={
              hasCustom(custom)
                ? customPalette(custom, preview)
                : themes[themeId === 'custom' ? 'sable' : themeId][preview]
            }
          />
          <View style={own.themeMain}>
            <Text style={[own.themeLabel, themeId === 'custom' && own.themeLabelActive]}>Custom</Text>
            <Text style={own.themeSource} numberOfLines={1}>
              {hasCustom(custom) ? 'your own colours' : 'duplicate a theme to start'}
            </Text>
          </View>
          {themeId === 'custom' ? <CheckIcon size={16} tone="accent" /> : null}
        </Pressable>
      </Section>

      {themeId === 'custom' ? (
        <Section title="custom colours">
          <CustomThemeEditor custom={custom} onChange={onCustomChange} themeId={themeId} />
        </Section>
      ) : null}

      <Section title="mode">
        <View style={own.grid}>
          {themeModes.map(option => {
            const selected = option.mode === themeMode;
            return (
              <Pressable
                key={option.mode}
                style={[own.gridItem, selected && own.gridItemActive]}
                onPress={() => onThemeModeChange(option.mode)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Mode ${option.label}`}>
                <Text style={[own.gridText, selected && own.gridTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {themeMode === 'system'
            ? `follows the device · currently ${dark ? 'dark' : 'light'}`
            : themeMode === 'amoled'
              ? 'pure black · the panel switches those pixels off'
              : 'forced choice'}
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
            <Text style={styles.hint}>off: the model's reasoning stays folded</Text>
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

const localStyles = (palette: Palette) => ({
  // Ten rows in one card: a selected row is a fill, not a border of its own.
  themeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 40,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  themeRowActive: { backgroundColor: palette.surfaceRaised },
  themeMain: { flex: 1, minWidth: 0 },
  themeLabel: { fontSize: font.body, color: palette.text },
  themeLabelActive: { fontWeight: '600' as const },
  themeSource: { fontSize: font.micro, color: palette.textMeta },
  check: { fontSize: font.body, color: palette.accent },
  // Four modes do not fit in one segment at 360 pt without wrapping a label or shrinking the tap
  // target below what a finger needs, so the choice is a 2x2 grid.
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  gridItem: {
    width: '48%' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gridItemActive: { backgroundColor: palette.surface, borderColor: palette.accent },
  gridText: { fontSize: font.meta, color: palette.textMuted },
  gridTextActive: { color: palette.text, fontWeight: '600' as const },
});
