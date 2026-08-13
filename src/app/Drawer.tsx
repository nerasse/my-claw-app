import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Sortable, { type SortableFlexDragEndParams } from 'react-native-sortables';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionSummary } from '../core/protocol';
import { ThreadRow } from '../components/ThreadRow';
import { PlusIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { pinnedStore, usePinnedOrder } from '../core/pinned';
import { DRAWER_WIDTH, font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import type { WsState } from '../core/types';

const STATE_LABEL: Record<WsState, string> = {
  idle: 'offline',
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'reconnecting',
};

function Separator(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
}

const keyOfThread = (item: SessionSummary): string => item.threadId;

/**
 * Left slide-over: conversations first, pinned entries (Sub-Agents, Archived, Jobs, Settings) at
 * the bottom. Stays mounted so the panel animates both ways and swallows no touches while closed.
 */
export function Drawer({
  open,
  sessions,
  unread,
  activeThread,
  connectionState,
  pending,
  subagentCount,
  onOpenSubAgents,
  onClose,
  onOpenThread,
  onNewThread,
  onThreadMenu,
  onOpenSettings,
  onOpenJobs,
  archivedCount,
  onOpenArchives,
}: {
  open: boolean;
  sessions: SessionSummary[];
  unread: string[];
  activeThread: string | null;
  connectionState: WsState;
  pending: number;
  /** Shared sub-agents (visibility global). The button stays, the count comes and goes. */
  subagentCount: number;
  onOpenSubAgents: () => void;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onNewThread: () => void;
  onThreadMenu: (thread: SessionSummary) => void;
  onOpenSettings: () => void;
  onOpenJobs: () => void;
  archivedCount: number;
  onOpenArchives: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState('');
  const { scrollProps, indicator } = useScrollIndicator();
  // The panel stays mounted, so opening it is a prop change, not a mount. Its search field is
  // never focused on the way in: whatever keyboard is up belongs to the composer behind it.
  useDismissKeyboard(open);

  const threadsById = useMemo(() => new Map(sessions.map(session => [session.threadId, session])), [sessions]);
  // Membership as a Set, not `unread.includes` per row: that scan ran once per visible row on
  // every render of a panel that never unmounts, i.e. on every streaming token.
  const unreadIds = useMemo(() => new Set(unread), [unread]);

  // The pinned set is a per-device preference, the sessions come from the server: the merge
  // happens here. Pinned rows follow the user's order, the rest keeps the server's.
  const pinnedOrder = usePinnedOrder();
  const pinnedIds = useMemo(() => new Set(pinnedOrder), [pinnedOrder]);
  const { pinnedRows, restRows, pinnedTotal, restTotal } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (session: SessionSummary) =>
      !needle || session.title.toLowerCase().includes(needle);
    const pinned: SessionSummary[] = [];
    for (const threadId of pinnedOrder) {
      const session = threadsById.get(threadId);
      if (session && match(session)) pinned.push(session);
    }
    const rest = sessions.filter(session => match(session) && !pinnedIds.has(session.threadId));
    const pinnedCount = sessions.reduce(
      (count, session) => count + (pinnedIds.has(session.threadId) ? 1 : 0),
      0,
    );
    return { pinnedRows: pinned, restRows: rest, pinnedTotal: pinnedCount, restTotal: sessions.length - pinnedCount };
  }, [sessions, threadsById, pinnedOrder, pinnedIds, query]);

  // Sessions that vanished (deleted, archived) leave a stale id behind; prune once the server
  // has spoken, and never before: the list starts empty on boot and would wipe the pins.
  useEffect(() => {
    if (sessions.length === 0) return;
    const kept = pinnedOrder.filter(threadId => threadsById.has(threadId));
    if (kept.length !== pinnedOrder.length) pinnedStore.setOrder(kept);
  }, [sessions, pinnedOrder, threadsById]);

  const handleDragEnd = useCallback(
    (params: SortableFlexDragEndParams) => {
      // The rendered order is the truth: `order` reshuffles what we hand it to match the new
      // children order, and stale ids are not among the children.
      pinnedStore.setOrder(params.order(pinnedRows.map(session => session.threadId)));
    },
    [pinnedRows],
  );

  const sectionCount = (count: number, total: number): string =>
    query.trim() ? `${count} / ${total}` : String(total);

  const renderThread = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <ThreadRow
        item={item}
        active={item.threadId === activeThread}
        unread={unreadIds.has(item.threadId)}
        draggable={false}
        onOpen={onOpenThread}
        onMenu={onThreadMenu}
      />
    ),
    [activeThread, onOpenThread, onThreadMenu, unreadIds],
  );

  useEffect(() => {
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [open, progress]);

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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          // The panel is absolutely positioned, so the shell's safe-area padding does not
          // apply to it: the phone's status bar and gesture bar have to be padded here.
          { paddingTop: insets.top + space.sm, transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}>
        <View style={styles.head}>
          <Text style={styles.brand}>MyClaw</Text>
          <Pressable
            onPress={onNewThread}
            hitSlop={8}
            style={styles.newButton}
            accessibilityRole="button"
            accessibilityLabel="New conversation">
            <PlusIcon size={20} color={palette.accent} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>{`conversations · ${sectionCount(restRows.length, restTotal)}`}</Text>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="search"
          placeholderTextColor={palette.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search conversations"
        />

        <View style={styles.listArea}>
          <FlatList
            {...scrollProps}
            style={styles.list}
            data={restRows}
            keyExtractor={keyOfThread}
            ItemSeparatorComponent={Separator}
            keyboardShouldPersistTaps="handled"
            // Virtualized by default; tuned so a long list scrolls without re-rendering
            // everything, and the memoized rows only update when their own props move.
            initialNumToRender={14}
            maxToRenderPerBatch={14}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            ListHeaderComponent={
              pinnedRows.length > 0 ? (
                <View style={styles.pinnedSection}>
                  <Text style={styles.sectionLabel}>
                    {`pinned · ${sectionCount(pinnedRows.length, pinnedTotal)}`}
                  </Text>
                  {/* Content-sized by design: the rows are the whole scroll range, so this
                      inner scroll view never scrolls and the outer list keeps the wheel. */}
                  <Sortable.Flex
                    customHandle
                    dragActivationDelay={200}
                    hapticsEnabled
                    onDragEnd={handleDragEnd}>
                    {pinnedRows.map(session => (
                      <ThreadRow
                        key={session.threadId}
                        item={session}
                        active={session.threadId === activeThread}
                        unread={unreadIds.has(session.threadId)}
                        draggable
                        onOpen={onOpenThread}
                        onMenu={onThreadMenu}
                      />
                    ))}
                  </Sortable.Flex>
                  <Separator />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.trim()
                  ? 'no match'
                  : pinnedRows.length > 0
                    ? 'no more conversations'
                    : 'no conversations'}
              </Text>
            }
            renderItem={renderThread}
            updateCellsBatchingPeriod={50}
          />
          {indicator}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          {/* Always shown: an entry that appears only once it has content is an entry nobody
              finds, and the screen says plainly when there is nothing in it. */}
          <Pressable
            style={[styles.footerRow, styles.archivedRow]}
            onPress={onOpenArchives}
            accessibilityRole="button"
            accessibilityLabel="Open archived conversations">
            <View style={styles.footerMain}>
              <Text style={styles.footerTitle}>Archived</Text>
            </View>
            {archivedCount > 0 ? <Text style={styles.footerCount}>{archivedCount}</Text> : null}
            <Text style={styles.footerGlyph}>›</Text>
          </Pressable>

          <Pressable
            style={[styles.footerRow, styles.archivedRow]}
            onPress={onOpenSubAgents}
            accessibilityRole="button"
            accessibilityLabel={`Open shared agents${subagentCount > 0 ? `, ${subagentCount}` : ''}`}>
            <View style={styles.footerMain}>
              <Text style={styles.footerTitle}>Agents</Text>
              <Text style={styles.footerMeta}>shared workers</Text>
            </View>
            {subagentCount > 0 ? <Text style={styles.footerCount}>{subagentCount}</Text> : null}
            <Text style={styles.footerGlyph}>›</Text>
          </Pressable>

          <Pressable
            style={[styles.footerRow, styles.jobsRow]}
            onPress={onOpenJobs}
            accessibilityRole="button"
            accessibilityLabel="Open jobs">
            <View style={styles.footerMain}>
              <Text style={styles.footerTitle}>Jobs</Text>
              <Text style={styles.footerMeta}>scheduled tasks</Text>
            </View>
            <Text style={styles.footerGlyph}>›</Text>
          </Pressable>

          <Pressable
            style={styles.footerRow}
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings">
            <View style={styles.footerMain}>
              <Text style={styles.footerTitle}>Settings</Text>
              <Text style={styles.footerMeta}>
                <Text style={{ color: connectionState === 'connected' ? palette.ok : palette.textFaint }}>●</Text>{' '}
                {STATE_LABEL[connectionState]}
                {pending > 0 ? ` · ${pending} pending` : ''}
              </Text>
            </View>
            <Text style={styles.footerGlyph}>›</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  backdrop: { backgroundColor: palette.overlay },
  panel: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: palette.surface,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  brand: { fontSize: font.screen, fontWeight: '700' as const, color: palette.text, letterSpacing: 0.2 },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionLabel: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  listArea: { flex: 1 },
  list: { paddingHorizontal: space.sm },
  pinnedSection: { paddingBottom: space.xs },
  search: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  separator: { height: 1, backgroundColor: palette.border, marginHorizontal: space.sm },
  empty: { padding: space.lg, fontSize: font.meta, color: palette.textFaint },
  footer: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
  },
  footerRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  archivedRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    paddingBottom: space.md,
  },
  jobsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    paddingBottom: space.md,
  },
  footerMain: { flex: 1, gap: 1 },
  footerTitle: { fontSize: font.body, color: palette.text },
  footerMeta: { fontSize: font.small, color: palette.textMuted },
  footerCount: { fontSize: font.small, color: palette.textFaint, marginRight: space.sm },
  footerGlyph: { fontSize: font.screen, color: palette.textFaint },
});
