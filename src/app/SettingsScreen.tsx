import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

const CATEGORIES: Array<{
  title: string;
  hint: string;
  accessibilityLabel: string;
  key: 'general' | 'providers' | 'agents' | 'tools' | 'skills' | 'devices' | 'mcps' | 'workspaces' | 'config' | 'other';
}> = [
  {
    title: 'General',
    hint: 'appearance, voice, server',
    accessibilityLabel: 'Open general',
    key: 'general',
  },
  {
    // The prompt files live here since they are per workspace: a workspace is the directory, its
    // instructions and its nested AGENTS.md, and they were on two pages that never named each
    // other.
    title: 'Workspaces',
    hint: 'directories, their instructions and skills',
    accessibilityLabel: 'Open workspaces',
    key: 'workspaces',
  },
  {
    title: 'Providers',
    hint: 'model providers, API keys, models',
    accessibilityLabel: 'Open providers',
    key: 'providers',
  },
  {
    title: 'Agents',
    hint: 'default model, effort, per-agent settings',
    accessibilityLabel: 'Open agents',
    key: 'agents',
  },
  {
    title: 'Tools',
    hint: 'built-in, plugins, MCP',
    accessibilityLabel: 'Open tools',
    key: 'tools',
  },
  {
    title: 'Skills',
    hint: 'built-in, custom, workspace',
    accessibilityLabel: 'Open skills',
    key: 'skills',
  },
  {
    title: 'MCPs',
    hint: 'external servers, add/remove/enable',
    accessibilityLabel: 'Open MCPs',
    key: 'mcps',
  },
  {
    title: 'Devices',
    hint: 'paired phones and browsers, pairing approval',
    accessibilityLabel: 'Open devices',
    key: 'devices',
  },
  {
    title: 'Config',
    hint: 'the raw config.json',
    accessibilityLabel: 'Open config',
    key: 'config',
  },
  {
    title: 'Other',
    hint: 'appearance, troubleshooting',
    accessibilityLabel: 'Open other',
    key: 'other',
  },
];

/**
 * The settings index: every category is a row that opens its own page, so the back key can
 * always walk one level at a time instead of closing the whole app on a habit press.
 */
export function SettingsScreen({
  skillsCount,
  toolsCount,
  providersCount,
  onBack,
  onOpenCategory,
}: {
  skillsCount: number;
  toolsCount: number;
  providersCount: number;
  onBack: () => void;
  onOpenCategory: (
    category: 'general' | 'providers' | 'agents' | 'tools' | 'skills' | 'devices' | 'mcps' | 'workspaces' | 'config' | 'other',
  ) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to chat">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>categories</Text>
        <View style={styles.card}>
          {CATEGORIES.map((category, index) => (
            <Pressable
              key={category.key}
              style={[styles.row, index === CATEGORIES.length - 1 && styles.rowLast]}
              onPress={() => onOpenCategory(category.key)}
              accessibilityRole="button"
              accessibilityLabel={category.accessibilityLabel}>
              <View style={styles.rowMain}>
                <View style={styles.rowTitleLine}>
                  <Text style={styles.rowTitle}>{category.title}</Text>
                  {category.key === 'skills' && skillsCount > 0 ? (
                    <Text style={styles.badge}>{skillsCount}</Text>
                  ) : null}
                  {category.key === 'tools' && toolsCount > 0 ? (
                    <Text style={styles.badge}>{toolsCount}</Text>
                  ) : null}
                  {category.key === 'providers' && providersCount > 0 ? (
                    <Text style={styles.badge}>{providersCount}</Text>
                  ) : null}
                </View>
                <Text style={styles.rowHint} numberOfLines={1}>
                  {category.key === 'skills' && skillsCount > 0
                    ? `${skillsCount} skill${skillsCount === 1 ? '' : 's'} · ${category.hint}`
                    : category.key === 'tools' && toolsCount > 0
                      ? `${toolsCount} tool${toolsCount === 1 ? '' : 's'} · ${category.hint}`
                      : category.key === 'providers' && providersCount > 0
                        ? `${providersCount} provider${providersCount === 1 ? '' : 's'} · ${category.hint}`
                        : category.hint}
                </Text>
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          ))}
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
  body: { paddingBottom: space.xl },
  section: {
    marginTop: space.lg,
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, gap: 1 },
  rowTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  rowTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  badge: {
    fontSize: font.micro,
    color: palette.accent,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  rowHint: { fontSize: font.small, color: palette.textFaint },
  linkGlyph: { fontSize: font.screen, color: palette.textFaint },
});
