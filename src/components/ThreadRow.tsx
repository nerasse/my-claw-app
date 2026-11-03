import { MoreIcon } from './icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { SessionSummary } from '../core/protocol';
import { formatDate } from '../core/utils';
import { useLayout } from '../core/layout';
import { contextMenuProps } from '../core/webProps';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * Memoized: with hundreds of sessions, a scroll or an unread change must not re-render every
 * row. The handlers take what they need from the row rather than a per-row closure, so their
 * identity is stable — `onMenu` gets the whole session, which spares its owner a lookup table
 * whose identity would have moved with the list.
 */
export const ThreadRow = React.memo(function ThreadRowRow({
  item,
  active,
  unread,
  running,
  question,
  onOpen,
  onMenu,
}: {
  item: SessionSummary;
  active: boolean;
  unread: boolean;
  /** A run is answering in this conversation right now. */
  running?: boolean;
  /** A run in this conversation is blocked on a question: it is answerable from here. */
  question?: boolean;
  onOpen: (threadId: string) => void;
  onMenu: (thread: SessionSummary) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  // A 44pt tap target is wasted on a mouse, and it costs a third of the rows on screen.
  const { dense } = useLayout();
  const menuButton = (
    <Pressable
      hitSlop={6}
      style={styles.menu}
      onPress={() => onMenu(item)}
      accessibilityRole="button"
      accessibilityLabel={`Actions for conversation ${item.title}`}>
      <MoreIcon size={16} tone="faint" />
    </Pressable>
  );
  return (
    // Right-click is the desktop form of the long press the ⋯ button stands in for.
    <View
      style={[styles.row, active && styles.rowActive]}
      {...contextMenuProps(() => onMenu(item))}>
      {/* An accent bar, not a tinted background. A tint reads as a mood; a bar reads as a
          position, and it still says where you are when every palette tints differently.
          The bar carries no radius of its own: the row's overflow shapes it, otherwise it
          overflows the curve and reads as a tab glued to the side (POC, 2026-11-02). */}
      {active ? <View style={styles.activeBar} /> : null}
      <Pressable
        style={[styles.main, dense && styles.mainDense]}
        onPress={() => onOpen(item.threadId)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Conversation ${item.title}${unread ? ', unread' : ''}${running ? ', answering' : ''}${question ? ', a question is waiting' : ''}${item.hasDraft ? ', unsent draft' : ''}`}>
        <View style={styles.titleRow}>
          {/* A run in flight takes the slot of the unread dot, and one mark is enough: a
              conversation being answered is not one to catch up on, and the bold title still says
              it was unread. This is the row half of what a folder's badge counts, so the badge is
              never a claim the list below cannot account for. */}
          {running ? (
            <ActivityIndicator size={DOT_SPINNER} color={palette.accent} />
          ) : unread ? (
            <View style={styles.dot} />
          ) : null}
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {/* A blocked run is not "activity", it is a run waiting on this person: it earns a
              mark of its own, or the only place the question exists is the thread it is in. */}
          {question ? <Text style={styles.question}>?</Text> : null}
          <Text style={styles.date}>{formatDate(item.lastMessageAt ?? item.lastActiveAt)}</Text>
        </View>
        {item.messageCount > 0 ? <Text style={styles.meta}>{item.messageCount} messages</Text> : null}
        {/* Server-side, so a message begun on another device is findable from this one. */}
        {item.hasDraft ? <Text style={styles.draft}>draft</Text> : null}
        {item.workspace && item.workspace !== 'default' ? (
          <Text style={styles.workspace}>{item.workspace}</Text>
        ) : null}
      </Pressable>
      {menuButton}
    </View>
  );
});

/** A pixel taller than the unread dot, which is 6: a spinner smaller than that reads as dust. */
const DOT_SPINNER = 11;

const createStyles = (palette: Palette) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
  },
  rowActive: { backgroundColor: palette.surfaceRaised },
  activeBar: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: palette.accent,
  },
  main: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.sm, gap: 1 },
  mainDense: { paddingVertical: space.xs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  title: { flex: 1, fontSize: font.body, color: palette.text },
  titleUnread: { fontWeight: '700' as const },
  date: { fontSize: font.micro, color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
  meta: { fontSize: font.small, color: palette.textMeta },
  question: {
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
  },
  draft: { alignSelf: 'flex-start' as const, fontSize: font.micro, color: palette.accent },
  /** The named workspace a conversation runs in; the default one stays unlabelled. */
  workspace: {
    alignSelf: 'flex-start' as const,
    fontSize: font.micro,
    color: palette.textMeta,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  menu: { paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center' as const, justifyContent: 'center' as const },
  menuGlyph: { fontSize: 17, lineHeight: 20, color: palette.textFaint },
});
