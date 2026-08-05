import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SessionSummary } from '../core/protocol';
import { formatDate } from '../core/utils';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export function ThreadRow({
  item,
  active,
  unread,
  onOpen,
  onMenu,
}: {
  item: SessionSummary;
  active: boolean;
  unread: boolean;
  onOpen: () => void;
  onMenu: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <Pressable
        style={styles.main}
        onPress={onOpen}
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
      </Pressable>
      <Pressable
        hitSlop={10}
        style={styles.menu}
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`Actions for conversation ${item.title}`}>
        <Text style={styles.menuGlyph}>⋯</Text>
      </Pressable>
    </View>
  );
}

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
  menu: { paddingHorizontal: space.sm, paddingVertical: space.md },
  menuGlyph: { fontSize: font.body, color: palette.textFaint },
});
