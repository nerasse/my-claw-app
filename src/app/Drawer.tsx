import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Sortable, { type SortableGridDragEndParams } from 'react-native-sortables';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionSummary } from '../core/protocol';
import { ThreadRow } from '../components/ThreadRow';
import { GearIcon, PlusIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { isPinned, pinnedOf, setOrder } from '../core/pinned';
import { pointerFine } from '../core/platform';
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

const keyOfThread = (item: SessionSummary): string => item.threadId;

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
  unread,
  questionThreads,
  activeThread,
  connectionState,
  pending,
  onClose,
  onOpenThread,
  onNewThread,
  onThreadMenu,
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
  unread: string[];
  /** Conversations whose run is blocked on a question, badged in the list. */
  questionThreads: string[];
  activeThread: string | null;
  connectionState: WsState;
  pending: number;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onNewThread: () => void;
  onThreadMenu: (thread: SessionSummary) => void;
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
  const questionIds = useMemo(() => new Set(questionThreads), [questionThreads]);

  // Pins and their order come from the server, on the summaries themselves: nothing to merge and
  // nothing to prune, since a thread that is gone from the listing takes its rank with it.
  const { pinnedRows, restRows, pinnedTotal, restTotal } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (session: SessionSummary) =>
      !needle || session.title.toLowerCase().includes(needle);
    const onTop = pinnedOf(sessions);
    return {
      pinnedRows: onTop.filter(match),
      restRows: sessions.filter(session => match(session) && !isPinned(session)),
      pinnedTotal: onTop.length,
      restTotal: sessions.length - onTop.length,
    };
  }, [sessions, query]);

  const handleDragEnd = useCallback((params: SortableGridDragEndParams<SessionSummary>) => {
    // The grid hands back the rows already reshuffled, so the drop reads straight off them
    // rather than replaying an index permutation over a captured list.
    setOrder(params.data.map(session => session.threadId));
  }, []);

  const sectionCount = (count: number, total: number): string =>
    query.trim() ? `${count} / ${total}` : String(total);

  const renderThread = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <ThreadRow
        item={item}
        active={item.threadId === activeThread}
        unread={unreadIds.has(item.threadId)}
        question={questionIds.has(item.threadId)}
        pinned={false}
        onOpen={onOpenThread}
        onMenu={onThreadMenu}
      />
    ),
    [activeThread, onOpenThread, onThreadMenu, questionIds, unreadIds],
  );

  const renderPinned = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <ThreadRow
        item={item}
        active={item.threadId === activeThread}
        unread={unreadIds.has(item.threadId)}
        question={questionIds.has(item.threadId)}
        pinned
        onOpen={onOpenThread}
        onMenu={onThreadMenu}
      />
    ),
    [activeThread, onOpenThread, onThreadMenu, questionIds, unreadIds],
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
          <Pressable
            onPress={onNewThread}
            hitSlop={8}
            style={styles.newButton}
            accessibilityRole="button"
            accessibilityLabel="New conversation">
            <PlusIcon size={20} color={palette.accent} />
          </Pressable>
        </View>

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
            // Each heading sits on the list it counts, which is the whole separation: a
            // labelled break reads as a break, where the hairline that used to stand here was
            // the very rule the plain rows use between themselves and so said nothing.
            ListHeaderComponent={
              <View>
                {pinnedRows.length > 0 ? (
                  <View style={styles.pinnedSection}>
                    <Text style={styles.sectionLabel}>
                      {`pinned · ${sectionCount(pinnedRows.length, pinnedTotal)}`}
                    </Text>
                    {/* A single column, not a Flex: Flex defaults to a wrapping row and leaves
                        item width uncontrolled, so each row sized itself to its own title and
                        pushed its actions button past the panel. A vertical grid owns the width,
                        which is what makes `numberOfLines` bite. The whole row is the handle —
                        holding a row is how a human expects to reorder one, and the gap is what
                        makes the cards legible as separate things to pick up. */}
                    <Sortable.Grid
                      columns={1}
                      data={pinnedRows}
                      keyExtractor={keyOfThread}
                      rowGap={space.xs}
                      // A mouse drags on the spot; only a finger needs to say "this is a drag and
                      // not a scroll" by holding still first. Under a cursor the 400ms wait was
                      // the whole feature failing: the pointer moves at once, more than the 5px
                      // activation fail offset, so the press was cancelled before it ever became
                      // a drag and the rows simply refused to move.
                      dragActivationDelay={pointerFine ? 0 : 400}
                      // And the offset that cancels an activation has to grow with it: a cursor
                      // yanked across the panel travels 20pt between two frames, which the 5pt
                      // default reads as "not a drag" even with no delay left to wait for.
                      dragActivationFailOffset={pointerFine ? 60 : 5}
                      hapticsEnabled
                      renderItem={renderPinned}
                      onDragEnd={handleDragEnd}
                    />
                  </View>
                ) : null}
                <Text style={styles.sectionLabel}>
                  {`conversations · ${sectionCount(restRows.length, restTotal)}`}
                </Text>
              </View>
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
  newButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  /** Indented onto the rows it heads: the list already pads by `md`, the row's own main pads
   *  by `sm` again, so the heading starts where the titles under it start. */
  sectionLabel: {
    paddingHorizontal: space.md + space.sm,
    paddingTop: space.xs,
    paddingBottom: space.xxs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  listArea: { flex: 1 },
  list: { paddingHorizontal: space.md },
  /** Just enough under the cards that the next heading is not glued to the last one. */
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
