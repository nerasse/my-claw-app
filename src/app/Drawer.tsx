import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FolderSummary, SessionSummary } from '../core/protocol';
import { ThreadRow } from '../components/ThreadRow';
import { FilterIcon, GearIcon, NewFolderIcon, PlusIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { drawerSections, sectionBadge, type SectionBadge } from '../core/folders';
import { matchesWorkspace } from '../core/workspaceFilter';
import { DRAWER_WIDTH, font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import type { WsState } from '../core/types';

const STATE_LABEL: Record<WsState, string> = {
  idle: 'offline',
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'reconnecting',
};

export { STATE_LABEL as CONNECTION_LABEL };

function Separator(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
}

/**
 * One line of the list: a section header, a conversation, or the sentence that says the list is
 * empty. Flattened rather than handed to a SectionList so the drawer keeps the one virtualized list
 * it has always had -- its tuning, its separators and its scroll are all built around a flat data
 * array, and a folded section is then just a header with no rows after it.
 */
type DrawerEntry =
  | {
      kind: 'header';
      key: string;
      label: string;
      folder: FolderSummary | null;
      folded: boolean;
      badge: SectionBadge | null;
    }
  | { kind: 'row'; key: string; session: SessionSummary }
  | { kind: 'empty'; key: string; text: string };

/** What a screen reader hears of a folder's badge, after its name. */
const badgeWords = (badge: SectionBadge | null): string => {
  if (badge === null) return '';
  if (badge.kind === 'question') {
    return `, ${badge.count} question${badge.count === 1 ? '' : 's'} waiting`;
  }
  return `, ${badge.count} with activity`;
};

/**
 * The count a section header carries. While a search is narrowing the list it also says what it is
 * narrowing: "two of nine" is a section with seven answers missing, and "two" is a claim.
 */
const sectionCount = (count: number, total: number, searching: boolean): string =>
  searching ? `${count} / ${total}` : String(total);

/**
 * The conversation list: conversations first, fixed entries (Sub-Agents, Archived, Jobs,
 * Settings) at the bottom.
 *
 * Three shapes, same panel. On a phone it is a slide-over that stays mounted, so it animates both
 * ways and swallows no touches while closed. Wide enough and it is `pinned` instead: a column of
 * the layout, always there, no backdrop and no swipe, because hiding the list behind a button is
 * a concession to a 400pt screen and nothing else. With no active thread it is `home`: the same
 * list fills the phone or tablet instead of leaving an empty chat pane.
 */
export function Drawer({
  open,
  pinned = false,
  focusSearch = 0,
  sessions,
  folders,
  unread,
  running,
  questionThreads,
  workspaceFilter,
  collapsedFolders,
  activeThread,
  connectionState,
  pending,
  onClose,
  onOpenThread,
  onNewThread,
  onThreadMenu,
  onOpenWorkspaceFilter,
  onClearWorkspaceFilter,
  onToggleFolder,
  onNewFolder,
  onFolderMenu,
  onOpenMore,
  onOpenSettings,
  home,
  onHome,
}: {
  open: boolean;
  /** Standing column instead of a slide-over. `open` and `onClose` are then meaningless. */
  pinned?: boolean;
  /** Bumped by the Ctrl+K shortcut: the search field takes the caret. */
  focusSearch?: number;
  sessions: SessionSummary[];
  /** The owner's folders, in rank order: the sections the list is cut into. */
  folders: FolderSummary[];
  unread: string[];
  /** Conversations a run is answering on right now: part of what a folder counts as activity. */
  running: string[];
  /** Conversations whose run is blocked on a question, badged in the list. */
  questionThreads: string[];
  /**
   * The workspace the list is narrowed to, or null for all of them. Held by the shell and not by
   * this panel: the drawer and the home screen are two mounts of one list, and a filter that
   * survived one of them and not the other would be two lists.
   */
  workspaceFilter: string | null;
  /** Folder ids the owner folded away. Held by the shell, like the filter, for the same reason. */
  collapsedFolders: string[];
  activeThread: string | null;
  connectionState: WsState;
  pending: number;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onNewThread: () => void;
  onThreadMenu: (thread: SessionSummary) => void;
  onOpenWorkspaceFilter: () => void;
  onClearWorkspaceFilter: () => void;
  onToggleFolder: (folderId: string) => void;
  onNewFolder: () => void;
  onFolderMenu: (folder: FolderSummary) => void;
  /** The one footer entry: opens the sheet with Archived, Agents, Jobs and Settings. */
  onOpenMore: () => void;
  /** Jump straight to Settings from the home footer. */
  onOpenSettings: () => void;
  /** Full-screen list on phone/tablet when no thread is open. */
  home?: boolean;
  /** Back to home (no-op when already home). */
  onHome: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const { scrollProps, indicator } = useScrollIndicator();
  // The panel stays mounted, so opening it is a prop change, not a mount. Its search field is
  // never focused on the way in: whatever keyboard is up belongs to the composer behind it.
  // A pinned panel never "opens", so it never takes the keyboard away from the composer.
  useDismissKeyboard(home || (!pinned && open));

  // Membership as a Set, not `unread.includes` per row: that scan ran once per visible row on
  // every render of a panel that never unmounts, i.e. on every streaming token.
  const unreadIds = useMemo(() => new Set(unread), [unread]);
  const runningIds = useMemo(() => new Set(running), [running]);
  const questionIds = useMemo(() => new Set(questionThreads), [questionThreads]);

  /**
   * The list, cut into sections.
   *
   * Two passes over the same filter: one keeps the search, and one does not. The second is what a
   * header counts against, so a folded folder says how many of its conversations the search left --
   * "two of nine" -- instead of claiming the folder holds two.
   */
  const entries = useMemo((): DrawerEntry[] => {
    const needle = query.trim().toLowerCase();
    const searching = needle !== '';
    const byWorkspace = sessions.filter(session => matchesWorkspace(session, workspaceFilter));
    const searched = needle
      ? byWorkspace.filter(session => session.title.toLowerCase().includes(needle))
      : byWorkspace;
    const sections = drawerSections(searched, folders, workspaceFilter);
    const totals = new Map(
      drawerSections(byWorkspace, folders, workspaceFilter).map(section => [section.folder?.id ?? '', section.rows.length]),
    );
    const out: DrawerEntry[] = [];
    for (const section of sections) {
      const id = section.folder?.id ?? '';
      const folded = section.folder !== null && collapsedFolders.includes(section.folder.id);
      out.push({
        kind: 'header',
        key: `section:${id}`,
        label: `${section.label} · ${sectionCount(section.rows.length, totals.get(id) ?? section.rows.length, searching)}`,
        folder: section.folder,
        folded,
        // Counted here, with the sections: the drawer re-renders on every token of a streaming
        // run, and walking the rows again per render is the one cost this list cannot pay.
        badge: section.folder === null
          ? null
          : sectionBadge(
              section.rows,
              threadId => questionIds.has(threadId),
              threadId => unreadIds.has(threadId) || runningIds.has(threadId),
            ),
      });
      if (folded) continue;
      for (const row of section.rows) out.push({ kind: 'row', key: row.threadId, session: row });
    }
    // A list with no conversations still says so: with sections it always has a header, so the
    // sentence the FlatList used to draw for an empty data array has to be an entry of its own.
    if (searched.length === 0) {
      out.push({ kind: 'empty', key: 'empty', text: searching ? 'no match' : 'no conversations' });
    }
    return out;
  }, [sessions, folders, query, workspaceFilter, collapsedFolders, questionIds, runningIds, unreadIds]);

  const renderEntry = useCallback(
    ({ item }: { item: DrawerEntry }) => {
      if (item.kind === 'empty') return <Text style={styles.empty}>{item.text}</Text>;
      if (item.kind === 'header') {
        const folder = item.folder;
        return (
          <View style={styles.sectionRow}>
            <Pressable
              onPress={folder ? () => onToggleFolder(folder.id) : undefined}
              disabled={folder === null}
              style={styles.sectionHeader}
              accessibilityRole={folder ? 'button' : undefined}
              accessibilityState={folder ? { expanded: !item.folded } : undefined}
              accessibilityLabel={folder ? `Folder ${folder.name}${badgeWords(item.badge)}` : undefined}>
              {folder ? (
                <Text style={styles.sectionFold}>{item.folded ? '▸' : '▾'}</Text>
              ) : (
                <Text style={styles.sectionFold}>{''}</Text>
              )}
              <Text style={styles.sectionLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
            {item.badge === null ? null : item.badge.kind === 'question' ? (
              <Text style={styles.sectionQuestion}>{`?${item.badge.count}`}</Text>
            ) : (
              <View style={styles.sectionActivity}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionActivityCount}>{item.badge.count}</Text>
              </View>
            )}
            {folder ? (
              <Pressable
                onPress={() => onFolderMenu(folder)}
                hitSlop={6}
                style={styles.sectionMenu}
                accessibilityRole="button"
                accessibilityLabel={`Actions for folder ${folder.name}`}>
                <Text style={styles.sectionMenuGlyph}>⋯</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }
      return (
        <ThreadRow
          item={item.session}
          active={item.session.threadId === activeThread}
          unread={unreadIds.has(item.session.threadId)}
          question={questionIds.has(item.session.threadId)}
          onOpen={onOpenThread}
          onMenu={onThreadMenu}
        />
      );
    },
    [activeThread, onFolderMenu, onOpenThread, onThreadMenu, onToggleFolder, questionIds, unreadIds, styles],
  );

  useEffect(() => {
    if (pinned) return;
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 200,
      // There is no native animation module in a browser: asking for one is a console warning
      // on every open, and the fallback it then takes is the JS driver anyway.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, pinned, progress]);

  // Counter, not a boolean: pressing the shortcut twice must focus twice, and there is no state
  // to reset in between.
  useEffect(() => {
    if (focusSearch > 0) searchRef.current?.focus();
  }, [focusSearch]);

  // Horizontal drag closes the panel; vertical drags stay with the conversation list.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dx < -50 || gesture.vx < -0.4) onClose();
        },
      }),
    [onClose],
  );

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH, 0] });

  const content = (
    <>
        <View style={styles.head}>
          <Pressable
            onPress={onHome}
            hitSlop={8}
            style={styles.homeButton}
            accessibilityRole="button"
            accessibilityLabel="Home">
            <Text style={styles.brand}>MyClaw</Text>
          </Pressable>
          <View style={styles.headActions}>
            <Pressable
              onPress={onNewFolder}
              hitSlop={8}
              style={styles.folderButton}
              accessibilityRole="button"
              accessibilityLabel="New folder">
              <NewFolderIcon size={20} color={palette.textFaint} />
            </Pressable>
            <Pressable
              onPress={onNewThread}
              hitSlop={8}
              style={styles.newButton}
              accessibilityRole="button"
              accessibilityLabel="New conversation">
              <PlusIcon size={20} color={palette.accent} />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            ref={searchRef}
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="search"
            placeholderTextColor={palette.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search conversations"
          />
          <Pressable
            onPress={onOpenWorkspaceFilter}
            hitSlop={8}
            style={styles.filterButton}
            accessibilityRole="button"
            accessibilityLabel={
              workspaceFilter ? `Filter by workspace, ${workspaceFilter} selected` : 'Filter by workspace'
            }>
            <FilterIcon size={18} color={workspaceFilter ? palette.accent : palette.textMuted} />
          </Pressable>
        </View>

        {/* What is masked, and the tap that stops masking it. A filter with no trace on screen is
            a list that has lost conversations for no reason the owner can see. */}
        {workspaceFilter !== null ? (
          <Pressable
            onPress={onClearWorkspaceFilter}
            hitSlop={6}
            style={styles.filterChip}
            accessibilityRole="button"
            accessibilityLabel={`Clear the ${workspaceFilter} filter`}>
            <Text style={styles.filterChipText} numberOfLines={1}>
              {workspaceFilter}
            </Text>
            <Text style={styles.filterChipGlyph}>✕</Text>
          </Pressable>
        ) : null}

        <View style={styles.listArea}>
          <FlatList
            {...scrollProps}
            style={styles.list}
            data={entries}
            keyExtractor={item => item.key}
            ItemSeparatorComponent={Separator}
            keyboardShouldPersistTaps="handled"
            // Virtualized by default; tuned so a long list scrolls without re-rendering
            // everything, and the memoized rows only update when their own props move.
            initialNumToRender={14}
            maxToRenderPerBatch={14}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            // Each heading sits on the list it counts, which is the whole separation: a
            // labelled break reads as a break, where the hairline that used to stand here was
            // the very rule the plain rows use between themselves and so said nothing. Every
            // section carries its own, so the list needs no header of its own.
            renderItem={renderEntry}
            updateCellsBatchingPeriod={50}
          />
          {indicator}
        </View>

        <View style={styles.footerRule} />
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          {/* One row: More opens the sheet with the remaining destinations (Archived, Agents,
              Jobs); the gear jumps straight to Settings. The state line stays here because
              connection state is the one thing a footer is for. */}
          <View style={styles.footerBar}>
            <Pressable
              style={styles.footerMore}
              onPress={onOpenMore}
              accessibilityRole="button"
              accessibilityLabel="More">
              <View style={styles.footerMain}>
                <Text style={styles.footerTitle}>More</Text>
                <Text style={styles.footerMeta}>
                  <Text style={{ color: connectionState === 'connected' ? palette.ok : palette.textFaint }}>●</Text>{' '}
                  {STATE_LABEL[connectionState]}
                  {pending > 0 ? ` · ${pending} pending` : ''}
                </Text>
              </View>
              <Text style={styles.footerGlyph}>›</Text>
            </Pressable>
            <Pressable
              style={styles.settingsButton}
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel="Open settings">
              <GearIcon size={22} color={palette.text} />
            </Pressable>
          </View>
        </View>
    </>
  );

  // Pinned: part of the layout, laid out by the row it sits in. The safe-area padding is the
  // shell's job there, which is why only the slide-over pays the status bar itself.
  if (pinned) {
    return <View style={[styles.panel, styles.panelPinned]}>{content}</View>;
  }
  // Home: full-screen list on phone/tablet when no thread is open. It sits inside the shell's
  // SafeAreaView and `container` (both already pay the top inset and its own padding), so it
  // must not add insets.top again or the list starts a band of empty space below the status
  // bar. Only the slide-over is absolutely positioned and has to pay the status bar itself.
  if (home) {
    return (
      <View
        testID="home-screen"
        style={styles.homePanel}
      >
        {content}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          styles.panelFloating,
          // Closed, the panel sits at translateX(-DRAWER_WIDTH): shifted out of the window, but
          // its 1pt right border still lands at x=0 and shows as a stray vertical line. Fading
          // with the same progress that slides it hides the border when closed.
          { opacity: progress, paddingTop: insets.top + space.sm, transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}>
        {content}
      </Animated.View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  backdrop: { backgroundColor: palette.overlay },
  panel: {
    width: DRAWER_WIDTH,
    backgroundColor: palette.surface,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  panelFloating: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    left: 0,
  },
  panelPinned: { paddingTop: space.sm },
  homePanel: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  brand: { fontSize: 27, fontWeight: '800' as const, color: palette.text, letterSpacing: 0.2 },
  homeButton: {
    padding: 0,
    backgroundColor: 'transparent' as const,
    alignSelf: 'flex-start' as const,
  },
  /** The two ways in: a conversation, or a place to put one. The accent stays on the first. */
  headActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  folderButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  sectionMenu: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionMenuGlyph: { fontSize: 17, lineHeight: 20, color: palette.textFaint },
  /** The same pill a blocked row wears, with the count in it: one vocabulary, two scales. */
  sectionQuestion: {
    fontSize: font.micro,
    fontWeight: '700' as const,
    color: palette.surface,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    minWidth: 16,
    textAlign: 'center' as const,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden' as const,
    marginRight: space.xs,
  },
  sectionActivity: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginRight: space.xs },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  sectionActivityCount: { fontSize: font.micro, color: palette.textFaint },
  /** Indented onto the rows it heads, and the fold glyph takes the same room whether the section
   *  can be folded or not: the unfiled heading has to sit where the folder names do. */
  sectionHeader: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingLeft: space.md },
  sectionFold: { width: 14, fontSize: font.micro, color: palette.textFaint },
  sectionLabel: {
    paddingRight: space.md,
    paddingTop: space.xs,
    paddingBottom: space.xxs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  listArea: { flex: 1 },
  list: { paddingHorizontal: space.md },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
  },
  search: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    fontSize: font.body,
    color: palette.text,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.surfaceAlt,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
  },
  filterChipText: { fontSize: font.small, color: palette.text },
  filterChipGlyph: { fontSize: font.small, color: palette.textMuted },
  separator: { height: 1, backgroundColor: palette.border, marginHorizontal: 0 },
  empty: { padding: space.lg, fontSize: font.meta, color: palette.textFaint },
  /** The rule above the footer rides the same inset as the list separators and the footer's own
   *  hairlines, instead of running the full width of the panel. A borderTop on the footer would
   *  span the panel and clash with the two other rules it stands between. */
  footerRule: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginHorizontal: space.md,
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  footerBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  footerMore: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  footerMain: { flex: 1, gap: 1 },
  footerTitle: { fontSize: font.body, color: palette.text },
  footerMeta: { fontSize: font.small, color: palette.textMuted },
  footerGlyph: { fontSize: font.screen, color: palette.textFaint },
  settingsButton: {
    width: 56,
    height: 40,
    marginLeft: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
