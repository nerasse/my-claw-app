import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionSummary, SubAgentEntry } from '../core/protocol';
import { ThreadRow } from '../components/ThreadRow';
import { PlusIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
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

/**
 * The shared sub-agents, pinned above the footer. They are global workers, so the drawer -- the
 * app's global panel -- is where they live; a conversation's own private ones stay in its roster.
 * Bounded so a long row of agents never squeezes the conversation list out of the panel, and
 * hidden while a search is active: a needle is about conversations.
 */
function AgentsSection({
  agents,
  onOpenAgent,
}: {
  agents: SubAgentEntry[];
  onOpenAgent: (entry: SubAgentEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  if (agents.length === 0) return <></>;
  return (
    <View style={styles.agentsSection}>
      <Text style={styles.sectionLabel}>{`agents · ${agents.length}`}</Text>
      <ScrollView style={styles.agentsScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {agents.map((agent, index) => (
          <View key={agent.id}>
            {index > 0 ? <Separator /> : null}
            <Pressable
              style={styles.agentRow}
              onPress={() => onOpenAgent(agent)}
              accessibilityRole="button"
              accessibilityLabel={`Open shared sub-agent ${agent.id}, ${agent.status}`}>
              <Text style={styles.agentGlyph}>◈</Text>
              {/* The id, not the display name: the model picks names and repeats them. */}
              <Text style={styles.agentTitle} numberOfLines={1}>
                {agent.id.replace(/^subagent\//, '')}
              </Text>
              {agent.status === 'running' ? <Text style={styles.agentRunning}>●</Text> : null}
              <Text style={styles.agentMeta}>{`${agent.messageCount} msg${agent.messageCount === 1 ? '' : 's'}`}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Left slide-over: conversations first, shared sub-agents pinned above the footer, settings pinned
 * at the bottom. Stays mounted so the panel animates both ways and swallows no touches while
 * closed.
 */
export function Drawer({
  open,
  sessions,
  unread,
  activeThread,
  connectionState,
  pending,
  agents,
  onOpenAgent,
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
  /** Shared sub-agents (visibility global), from the active conversation's roster. */
  agents: SubAgentEntry[];
  onOpenAgent: (entry: SubAgentEntry) => void;
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter(session => session.title.toLowerCase().includes(needle));
  }, [sessions, query]);

  // Stable identities so React.memo on the rows keeps working while the list is long.
  const threadsById = useMemo(() => new Map(sessions.map(session => [session.threadId, session])), [sessions]);
  const handleOpen = useCallback((threadId: string) => onOpenThread(threadId), [onOpenThread]);
  const handleMenu = useCallback(
    (threadId: string) => {
      const thread = threadsById.get(threadId);
      if (thread) onThreadMenu(thread);
    },
    [onThreadMenu, threadsById],
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

        <Text style={styles.sectionLabel}>
          conversations · {filtered.length === sessions.length ? sessions.length : `${filtered.length} / ${sessions.length}`}
        </Text>

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
            data={filtered}
            keyExtractor={item => item.threadId}
            ItemSeparatorComponent={Separator}
            keyboardShouldPersistTaps="handled"
            // Virtualized by default; tuned so a long list scrolls without re-rendering
            // everything, and the memoized rows only update when their own props move.
            initialNumToRender={14}
            maxToRenderPerBatch={14}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.trim() ? 'no match' : 'no conversations'}
              </Text>
            }
            renderItem={({ item }) => (
              <ThreadRow
                item={item}
                active={item.threadId === activeThread}
                unread={unread.includes(item.threadId)}
                onOpen={handleOpen}
                onMenu={handleMenu}
              />
            )}
          />
          {indicator}
        </View>

        {query.trim() ? null : <AgentsSection agents={agents} onOpenAgent={onOpenAgent} />}

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
  agentsSection: {
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    maxHeight: '42%' as const,
    flexShrink: 0,
  },
  agentsScroll: {
    flexGrow: 0,
  },
  agentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  agentGlyph: { fontSize: font.meta, color: palette.accent },
  agentTitle: { flex: 1, fontSize: font.meta, fontWeight: '600' as const, color: palette.text, fontFamily: 'monospace' },
  agentRunning: { fontSize: font.micro, color: palette.accent },
  agentMeta: { fontSize: font.small, color: palette.textFaint },
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
