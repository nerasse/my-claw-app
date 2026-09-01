import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionSummary } from '../core/protocol';
import { formatDate } from '../core/utils';
import { useLayout } from '../core/layout';
import { contextMenuProps } from '../core/webProps';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * Memoized: with hundreds of sessions, a scroll or an unread change must not re-render every
 * row. The handlers take what they need from the row rather than a per-row closure, so their
 * identity is stable — `onMenu` gets the whole session, which spares its owner a lookup table
 * whose identity would have moved with the list.
 * When `pinned`, the row carries no handle of its own: its sortable parent makes the whole cell
 * the grab area, so a hold anywhere starts a drag and a tap still opens the thread. It also
 * wears a card, which is what tells the eye where the pinned block ends and the plain list
 * begins — and it says so out loud, because a gesture nobody announces is a gesture nobody
 * finds.
 */
export const ThreadRow = React.memo(function ThreadRowRow({
  item,
  active,
  unread,
  question,
  pinned,
  onOpen,
  onMenu,
}: {
  item: SessionSummary;
  active: boolean;
  unread: boolean;
  /** A run in this conversation is blocked on a question: it is answerable from here. */
  question?: boolean;
  /** Pinned rows read as cards and reorder; the whole row is the grab area. */
  pinned: boolean;
  onOpen: (threadId: string) => void;
  onMenu: (thread: SessionSummary) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // A 44pt tap target is wasted on a mouse, and it costs a third of the rows on screen.
  const { dense } = useLayout();
  const menuButton = (
    <Pressable
      hitSlop={6}
      style={styles.menu}
      onPress={() => onMenu(item)}
      accessibilityRole="button"
      accessibilityLabel={`Actions for conversation ${item.title}`}>
      <Text style={styles.menuGlyph}>⋯</Text>
    </Pressable>
  );
  return (
    // Right-click is the desktop form of the long press the ⋯ button stands in for.
    <View
      style={[styles.row, pinned && styles.rowPinned, active && styles.rowActive]}
      {...contextMenuProps(() => onMenu(item))}>
      <Pressable
        style={[styles.main, dense && styles.mainDense]}
        onPress={() => onOpen(item.threadId)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Conversation ${item.title}${unread ? ', unread' : ''}${question ? ', a question is waiting' : ''}${item.hasDraft ? ', unsent draft' : ''}${pinned ? ', hold to reorder' : ''}`}>
        <View style={styles.titleRow}>
          {unread ? <View style={styles.dot} /> : null}
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {/* A blocked run is not "activity", it is a run waiting on this person: it earns a
              mark of its own, or the only place the question exists is the thread it is in. */}
          {question ? <Text style={styles.question}>?</Text> : null}
          <Text style={styles.date}>{formatDate(item.lastActiveAt)}</Text>
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

const createStyles = (palette: Palette) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: radius.sm },
  /** A pinned row is a card: the plain list below is flat, so the block reads as its own. The
   *  edge is a hairline, like the drawer's own footer rules — enough to define the card without
   *  spending two pixels of row height on it. */
  rowPinned: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  rowActive: { backgroundColor: palette.accentSoft },
  main: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.sm, gap: 1 },
  mainDense: { paddingVertical: space.xs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  title: { flex: 1, fontSize: font.body, color: palette.text },
  titleUnread: { fontWeight: '700' as const },
  date: { fontSize: font.micro, color: palette.textFaint, fontVariant: ['tabular-nums' as const] },
  meta: { fontSize: font.small, color: palette.textFaint },
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
    color: palette.textFaint,
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
