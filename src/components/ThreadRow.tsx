import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Sortable from 'react-native-sortables';
import type { SessionSummary } from '../core/protocol';
import { formatDate } from '../core/utils';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * Memoized: with hundreds of sessions, a scroll or an unread change must not re-render every
 * row. The handlers take the threadId instead of a per-row closure so their identity is stable.
 * When `draggable`, the actions button doubles as the drag handle: a hold becomes a drag, a
 * quick tap still opens the menu.
 */
export const ThreadRow = React.memo(function ThreadRowRow({
  item,
  active,
  unread,
  draggable,
  onOpen,
  onMenu,
}: {
  item: SessionSummary;
  active: boolean;
  unread: boolean;
  /** The actions button is the drag handle; only pinned rows are draggable. */
  draggable: boolean;
  onOpen: (threadId: string) => void;
  onMenu: (threadId: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const menuButton = (
    <Pressable
      hitSlop={6}
      style={styles.menu}
      onPress={() => onMenu(item.threadId)}
      accessibilityRole="button"
      accessibilityLabel={`Actions for conversation ${item.title}${draggable ? ', hold to reorder' : ''}`}>
      <Text style={styles.menuGlyph}>⋯</Text>
    </Pressable>
  );
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <Pressable
        style={styles.main}
        onPress={() => onOpen(item.threadId)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Conversation ${item.title}${unread ? ', unread' : ''}`}>
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
      {draggable ? <Sortable.Handle>{menuButton}</Sortable.Handle> : menuButton}
    </View>
  );
});

const createStyles = (palette: Palette) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: radius.sm },
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
