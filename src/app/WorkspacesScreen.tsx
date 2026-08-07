import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { WorkspaceEntry } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * The server's workspaces, read-only. Each is a directory with its own prompt files and
 * skills; a cron job references the key, never the path. The default workspace is where
 * the owner's conversations and memory live.
 */
export function WorkspacesScreen({
  workspaces,
  onBack,
}: {
  workspaces: WorkspaceEntry[];
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // nothing to type into on this page.
  useDismissKeyboard();
  const { scrollProps, indicator } = useScrollIndicator();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Workspaces</Text>
          <Text style={styles.subtitle}>
            {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <View style={styles.listArea}>
        <FlatList
          {...scrollProps}
          style={styles.list}
          data={workspaces}
          keyExtractor={entry => entry.key}
          contentContainerStyle={workspaces.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>no workspaces found</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <View style={styles.rowTitleLine}>
                  <Text style={styles.key} numberOfLines={1}>
                    {item.key}
                  </Text>
                  {item.default ? <Text style={styles.badge}>default</Text> : null}
                </View>
                <Text style={styles.path} numberOfLines={1} selectable>
                  {item.path}
                </Text>
              </View>
            </View>
          )}
        />
        {indicator}
      </View>
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
  listArea: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: space.xl },
  emptyContent: { flexGrow: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  empty: { fontSize: font.meta, color: palette.textFaint },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  key: {
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  path: { fontSize: font.small, color: palette.textMuted, fontFamily: 'monospace' },
});
