import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { searchSettings } from '../core/settingsSearch';
import type { SettingsPage } from './settingsPages';
import { multiServerSupported } from '../core/servers';

interface Category {
  page: SettingsPage;
  title: string;
  hint: string;
}

/**
 * The index, by what a setting is about: the app on this device, the AI behind it, what the agent
 * may use, and who may reach it. Fourteen rows in one list read as chaos (owner, 2026-10-04); a
 * subject is now one page, and every page sits under the question it answers.
 */
export const GROUPS: ReadonlyArray<{ title: string; categories: readonly Category[] }> = [
  {
    title: 'this app',
    categories: [
      { page: 'appearance', title: 'Appearance', hint: 'theme, text size, folding' },
      { page: 'notifications', title: 'Notifications', hint: 'permission and sounds' },
      { page: 'updates', title: 'Updates', hint: 'the server and the app' },
    ],
  },
  {
    // Not "AI": the whole app is. These three are what the agent is made of: which model thinks,
    // how each agent is set, and the services it reaches (owner, 2026-10-04).
    title: 'the agent',
    categories: [
      { page: 'models', title: 'Models', hint: 'default, providers and plans, tags' },
      { page: 'agents', title: 'Agents', hint: 'the orchestrator and each agent: model, effort, scope' },
      { page: 'services', title: 'Services', hint: 'voice, location, search, memory, browser' },
    ],
  },
  {
    title: 'what the agent can use',
    categories: [
      { page: 'workspaces', title: 'Workspaces', hint: 'folders and their instructions' },
      { page: 'skills', title: 'Skills', hint: 'built-in, custom, workspace' },
      { page: 'tools', title: 'Tools', hint: 'on or off, ask before running, MCP servers' },
    ],
  },
  {
    // Where this app connects and who else may: the server, the devices paired to it, and what
    // only matters when the connection is wrong (owner, 2026-10-13: "connexion", not "security").
    title: 'connection',
    categories: [
      multiServerSupported
        ? { page: 'servers', title: 'Servers', hint: 'this one, the others, switch, join with an invitation' }
        : { page: 'servers', title: 'Server', hint: 'address, connect, join with an invitation' },
      { page: 'devices', title: 'Devices', hint: 'add a device, approve a request, paired devices' },
      // The other side of "who reaches this server": machines it reaches, through the client they
      // install themselves. Kept beside Devices because both are the connection, not the agent.
      { page: 'nodes', title: 'Nodes', hint: 'remote machines: add one, its tools, revoke' },
      { page: 'advanced', title: 'Advanced', hint: 'connection state, this device, diagnostics, raw config' },
    ],
  },
];

export function SettingsScreen({
  skillsCount,
  toolsCount,
  setup,
  nativeApp,
  onBack,
  onOpen,
}: {
  skillsCount: number;
  toolsCount: number;
  /** The first-run setup while it is not finished: a banner above everything. Null once done. */
  setup: { settled: number; total: number } | null;
  /** The Android app: the search offers what only it has (the APK, its download on mobile data). */
  nativeApp: boolean;
  onBack: () => void;
  onOpen: (page: SettingsPage) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  useDismissKeyboard();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchSettings(query, nativeApp), [query, nativeApp]);
  /** The catalogs say how much they hold, ahead of what they are: "12 skills · built-in, …". */
  const hintOf = (category: Category): string => {
    const count = category.page === 'skills' ? skillsCount : category.page === 'tools' ? toolsCount : 0;
    const noun = category.page === 'skills' ? 'skill' : 'tool';
    return count > 0 ? `${count} ${noun}${count === 1 ? '' : 's'} · ${category.hint}` : category.hint;
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to chat">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={palette.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (results[0]) onOpen(results[0].page);
            }}
            accessibilityLabel="Search settings"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear the search">
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {query.trim() ? (
          results.length === 0 ? (
            <Text style={styles.empty}>{`No setting matches “${query.trim()}”`}</Text>
          ) : (
            <View style={[styles.card, styles.firstCard]}>
              {results.map((entry, index) => (
                <Pressable
                  key={`${entry.page}-${entry.title}`}
                  style={[styles.row, index === results.length - 1 && styles.rowLast]}
                  onPress={() => onOpen(entry.page)}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${entry.title}`}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{entry.title}</Text>
                    <Text style={styles.rowHint}>{entry.where}</Text>
                  </View>
                  <Text style={styles.linkGlyph}>›</Text>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          <>
            {/* The setup sits on top until it is done or passed, then lives under Advanced. */}
            {setup ? (
              <Pressable
                style={[styles.card, styles.firstCard, styles.banner]}
                onPress={() => onOpen('setup')}
                accessibilityRole="button"
                accessibilityLabel="Open get started">
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>Get started</Text>
                  <Text style={styles.rowHint}>{`${setup.settled} of ${setup.total} done or skipped`}</Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
            ) : null}
            {GROUPS.map(group => (
              <View key={group.title}>
                <Text style={styles.section}>{group.title}</Text>
                <View style={styles.card}>
                  {group.categories.map((category, index) => (
                      <Pressable
                        key={category.page}
                        style={[styles.row, index === group.categories.length - 1 && styles.rowLast]}
                        onPress={() => onOpen(category.page)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${category.title.toLowerCase()}`}>
                        <View style={styles.rowMain}>
                          <Text style={styles.rowTitle}>{category.title}</Text>
                          <Text style={styles.rowHint} numberOfLines={1}>
                            {hintOf(category)}
                          </Text>
                        </View>
                        <Text style={styles.linkGlyph}>›</Text>
                      </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
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
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.md,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
  },
  searchGlyph: { fontSize: font.body, color: palette.textFaint },
  searchInput: { flex: 1, paddingVertical: space.sm, fontSize: font.body, color: palette.text },
  searchClear: { fontSize: font.meta, color: palette.textFaint },
  empty: { marginTop: space.lg, paddingHorizontal: space.xs, fontSize: font.meta, color: palette.textFaint },
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
  firstCard: { marginTop: space.md },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.md,
    borderColor: palette.accent,
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
  rowTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  rowHint: { fontSize: font.small, color: palette.textFaint },
  linkGlyph: { fontSize: font.screen, color: palette.textFaint },
});
