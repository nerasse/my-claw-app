import React, { useCallback } from 'react';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { ThreadRow } from '../components/ThreadRow';
import type { SessionSummary } from '../core/protocol';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

const keyOfThread = (item: SessionSummary): string => item.threadId;

/**
 * The conversations the owner filed away. They are whole sessions, not snapshots: opening one
 * shows it as it was left, and Unarchive puts it straight back in the drawer.
 */
export function ArchivesScreen({
  sessions,
  onBack,
  onOpenThread,
  onThreadMenu,
}: {
  sessions: SessionSummary[];
  onBack: () => void;
  onOpenThread: (threadId: string) => void;
  onThreadMenu: (thread: SessionSummary) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // the archived list is reached from the drawer, with the composer's keyboard still up.
  useDismissKeyboard();
  const { scrollProps, indicator } = useScrollIndicator();

  // The row hands back the whole session, so this needs neither a lookup over the archive nor a
  // dependency on it — the identity holds, and the memoized rows hold with it.
  const renderThread = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <ThreadRow
        item={item}
        active={false}
        unread={false}
        onOpen={onOpenThread}
        onMenu={onThreadMenu}
      />
    ),
    [onOpenThread, onThreadMenu],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to chat">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Archived</Text>
          <Text style={styles.subtitle}>
            {sessions.length} conversation{sessions.length === 1 ? '' : 's'} · kept indefinitely
          </Text>
        </View>
      </View>

      <View style={styles.listArea}>
        <FlatList
          {...scrollProps}
          style={styles.list}
          data={sessions}
          keyExtractor={keyOfThread}
          contentContainerStyle={sessions.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>no archived conversations</Text>}
          renderItem={renderThread}
          keyboardShouldPersistTaps="handled"
          // The archive is kept indefinitely, so this is the thread list that grows without end.
          initialNumToRender={14}
          maxToRenderPerBatch={14}
          updateCellsBatchingPeriod={50}
          windowSize={9}
          removeClippedSubviews={Platform.OS === 'android'}
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
  headerText: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  listArea: { flex: 1 },
  list: {},
  listContent: { paddingTop: space.sm },
  emptyContent: { flexGrow: 1, justifyContent: 'center' as const },
  empty: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textFaint,
    padding: space.md,
  },
});
