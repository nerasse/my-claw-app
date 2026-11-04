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
          <Text style={[styles.title, unread && styles.titleUnread, active && styles.titleActive]} numberOfLines={1}>
            {item.title}
          </Text>
          {/* A blocked run is not "activity", it is a run waiting on this person: it earns a
              mark of its own, or the only place the question exists is the thread it is in. */}
          {question ? <Text style={styles.question}>?</Text> : null}
          <Text style={styles.date}>{formatDate(item.lastMessageAt ?? item.lastActiveAt)}</Text>
        </View>
        {/* One metadata line, and only when it has something to say: the workspace in a chip, a
            dot, the draft, a dot, the count. The POC stacks nothing -- three separate blocks under
            one title made a 40 pt row hold a title and three captions, which is a card, not a row
            of a list. */}
        {item.workspace !== undefined || item.hasDraft || item.messageCount > 0 ? (
          <View style={styles.metaRow}>
            {item.workspace && item.workspace !== 'default' ? (
              <Text style={styles.workspace} numberOfLines={1}>
                {item.workspace}
              </Text>
            ) : null}
            {item.workspace && item.workspace !== 'default' && (item.hasDraft || item.messageCount > 0) ? (
              <Text style={styles.sep}>·</Text>
            ) : null}
            {item.hasDraft ? <Text style={styles.meta}>draft</Text> : null}
            {item.hasDraft && item.messageCount > 0 ? <Text style={styles.sep}>·</Text> : null}
            {item.messageCount > 0 ? <Text style={styles.meta}>{`${item.messageCount} messages`}</Text> : null}
          </View>
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
  rowActive: { backgroundColor: palette.surfaceAlt, overflow: 'hidden' as const },
  /**
   * The accent bar of the row the reader is in.
   *
   * Full height, 3 pt, no radius of its own: the row's `overflow: hidden` cuts it, so it follows
   * the row's curve instead of drawing its own above it. The POC carries two versions of this --
   * `base.css` insets it 2 pt wide and 7 pt from each end, `theme.css` runs it the full height --
   * and `theme.css` is the one loaded last, so that is the one the validated screen shows. Inset,
   * against a two-line row, it read as a floating tick rather than as a position.
   */
  activeBar: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: palette.accent,
  },
  main: { flex: 1, paddingVertical: space.sm, paddingHorizontal: 8, gap: 1 },
  mainDense: { paddingVertical: space.xs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  title: { flex: 1, fontSize: 13.5, color: palette.text },
  // Unread is heavier, and so is the row you are in: the bar says where you are, the weight says
  // it again in the type, which is what makes an active row readable at a glance down the column.
  titleUnread: { fontWeight: '600' as const },
  titleActive: { fontWeight: '600' as const },
  date: { fontSize: 10.5, color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
  meta: { fontSize: font.small, color: palette.textMeta },
  /** One line of facts under the title, the way a row of a list reads. */
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginTop: 1,
    overflow: 'hidden' as const,
  },
  sep: { fontSize: font.small, color: palette.textFaint },
  /**
   * A named workspace, as the POC draws it: a chip of its own tone, not a bordered box.
   *
   * The outline was a second frame inside a row that already has a surface and a bar: three
   * edges for one word. A `surfaceRaised` pill says "this is a label" and takes no room.
   */
  workspace: {
    fontSize: 10,
    fontWeight: '500' as const,
    color: palette.textMuted,
    backgroundColor: palette.surfaceRaised,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden' as const,
  },
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
  menu: { paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center' as const, justifyContent: 'center' as const },
});
