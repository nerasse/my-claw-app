import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionSummary } from '../core/protocol';
import { formatDate } from '../core/utils';
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
  pinned,
  onOpen,
  onMenu,
}: {
  item: SessionSummary;
  active: boolean;
  unread: boolean;
  /** Pinned rows read as cards and reorder; the whole row is the grab area. */
  pinned: boolean;
  onOpen: (threadId: string) => void;
  onMenu: (thread: SessionSummary) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
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
    <View style={[styles.row, pinned && styles.rowPinned, active && styles.rowActive]}>
      <Pressable
        style={styles.main}
        onPress={() => onOpen(item.threadId)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Conversation ${item.title}${unread ? ', unread' : ''}${pinned ? ', hold to reorder' : ''}`}>
        <View style={styles.titleRow}>
          {unread ? <View style={styles.dot} /> : null}
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.date}>{formatDate(item.lastActiveAt)}</Text>
        </View>
        {item.messageCount > 0 ? <Text style={styles.meta}>{item.messageCount} messages</Text> : null}
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
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  title: { flex: 1, fontSize: font.body, color: palette.text },
  titleUnread: { fontWeight: '700' as const },
  date: { fontSize: font.micro, color: palette.textFaint, fontVariant: ['tabular-nums' as const] },
  meta: { fontSize: font.small, color: palette.textFaint },
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
