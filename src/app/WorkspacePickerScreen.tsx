import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { WorkspaceEntry } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The workspace picker of one agent: the dynamic `config.workspaces` list plus the default
 * workspace, "default" removing the pin. A key the agent references but the list no longer
 * carries is pinned on top in red: the resolver throws on it at run time, so it has to stay
 * visible to be fixed. The server refuses unknown keys on save anyway.
 *
 * The default gets its own section at the top and never rows with the named ones: the listing
 * carries it as a `default: true` entry, so mapping the whole list under the "no pin" row showed
 * "default" twice. Its own section also keeps it first whatever order the server sends.
 */
export function WorkspacePickerScreen({
  workspaces,
  current,
  unknown,
  error,
  saving,
  subtitle,
  backLabel,
  onBack,
  onSave,
}: {
  workspaces: WorkspaceEntry[];
  /** The agent's current pin, null when it inherits the default. */
  current: string | null;
  /** Whether the current key is absent from config.workspaces. */
  unknown: boolean;
  error: string | null;
  saving: boolean;
  /** What the page explains; the agent page and the jobs editor say different things. */
  subtitle: string;
  /** Where back lands; the agent page and the jobs editor stack differently. */
  backLabel: string;
  onBack: () => void;
  onSave: (workspace: string | null) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);

  const pick = (key: string | null): void => onSave(key);
  const isCurrent = (key: string | null): boolean => (key ?? null) === (current ?? null);
  const named = workspaces.filter(workspace => !workspace.default && workspace.key !== 'default');
  const defaultPath = workspaces.find(workspace => workspace.default)?.path ?? '';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={backLabel}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Workspace</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Workspace error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {unknown && current ? (
          <View style={styles.category}>
            <Text style={styles.section}>no longer exists</Text>
            <View style={[styles.card, styles.cardRemoved]}>
              <Pressable
                style={[styles.row, styles.link]}
                onPress={() => pick(null)}
                accessibilityRole="button"
                accessibilityLabel={`Drop removed workspace ${current}`}>
                <View style={styles.itemMain}>
                  <Text style={[styles.itemName, styles.removed]}>{current}</Text>
                  <Text style={[styles.itemHint, styles.removed]}>not in config.workspaces anymore</Text>
                </View>
                <Text style={styles.itemHint}>drop</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>default</Text>
          <View style={[styles.card, styles.cardDefault]}>
            <Pressable
              style={[styles.row, styles.link]}
              onPress={() => pick(null)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Use the default workspace"
              accessibilityState={{ selected: isCurrent(null) }}>
              <View style={styles.itemMain}>
                <Text style={[styles.itemName, styles.itemNameDefault]}>default</Text>
                <Text style={styles.itemHint} numberOfLines={1}>
                  {defaultPath}
                </Text>
                <Text style={styles.itemHint}>no pin · what every agent falls back to</Text>
              </View>
              <Text style={styles.glyph}>{isCurrent(null) ? '✓' : ''}</Text>
            </Pressable>
          </View>
        </View>

        {named.length > 0 ? (
          <View style={styles.category}>
            <Text style={styles.section}>named</Text>
            <View style={styles.card}>
              {named.map((workspace, index) => (
                <View key={workspace.key}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => pick(workspace.key)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Use workspace ${workspace.key}`}
                    accessibilityState={{ selected: isCurrent(workspace.key) }}>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName}>{workspace.key}</Text>
                      <Text style={styles.itemHint} numberOfLines={1}>
                        {workspace.path}
                      </Text>
                    </View>
                    <Text style={styles.glyph}>{isCurrent(workspace.key) ? '✓' : ''}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}
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
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: { fontSize: font.micro, color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  cardRemoved: { borderColor: palette.danger },
  cardDefault: { borderColor: palette.accent },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  itemNameDefault: { color: palette.accent },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  removed: { color: palette.danger },
  glyph: { fontSize: 18, color: palette.accent, width: 22, textAlign: 'center' as const },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
