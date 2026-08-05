import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Bubble } from '../components/Bubble';
import { ToolCard } from '../components/ToolCard';
import { Composer } from '../components/Composer';
import type { ChatItem, TextItem } from '../core/chat';
import type { DeviceInfo } from '../core/device';
import type { WsState } from '../core/types';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

const GROUP_WINDOW_MS = 120_000;

/** Same author, close in time and not split by a tool card: render as one visual block. */
function isGrouped(items: ChatItem[], index: number): boolean {
  const item = items[index];
  const previous = items[index - 1];
  if (!item || !previous || item.kind !== 'text' || previous.kind !== 'text') return false;
  return previous.role === item.role && item.ts - previous.ts < GROUP_WINDOW_MS;
}

export function ChatScreen({
  title,
  subtitle,
  connectionState,
  items,
  mediaBase,
  deviceInfo,
  hint,
  onOpenDrawer,
  onSend,
  onBubbleMenu,
}: {
  title: string;
  subtitle: string;
  connectionState: WsState;
  items: ChatItem[];
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  hint?: string;
  onOpenDrawer: () => void;
  onSend: (text: string) => void;
  onBubbleMenu: (item: TextItem) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    if (!atBottom) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(timer);
  }, [items, atBottom]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }, [draft, onSend]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onOpenDrawer}
          hitSlop={12}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open conversations">
          <Text style={styles.menuGlyph}>☰</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={[styles.statusDot, connectionState === 'connected' ? styles.statusOk : styles.statusOff]} />
      </View>

      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>empty conversation — write something</Text>}
          onContentSizeChange={() => {
            if (atBottom) listRef.current?.scrollToEnd({ animated: false });
          }}
          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
            if (nearBottom !== atBottom) setAtBottom(nearBottom);
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) =>
            item.kind === 'tool' ? (
              <ToolCard item={item} />
            ) : (
              <Bubble
                item={item}
                mediaBase={mediaBase}
                deviceInfo={deviceInfo}
                grouped={isGrouped(items, index)}
                showTime={!isGrouped(items, index + 1)}
                onMenu={() => onBubbleMenu(item)}
              />
            )
          }
        />

        {!atBottom && items.length > 0 ? (
          <Pressable
            style={styles.jump}
            onPress={() => {
              setAtBottom(true);
              listRef.current?.scrollToEnd({ animated: true });
            }}
            accessibilityRole="button"
            accessibilityLabel="Jump to latest message">
            <Text style={styles.jumpGlyph}>↓</Text>
          </Pressable>
        ) : null}
      </View>

      <Composer value={draft} onChange={setDraft} onSend={submit} hint={hint} />
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  menuButton: { paddingVertical: 2 },
  menuGlyph: { fontSize: font.screen, color: palette.text },
  headerText: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusOk: { backgroundColor: palette.ok },
  statusOff: { backgroundColor: palette.textFaint },
  listWrap: { flex: 1 },
  listContent: { paddingTop: space.md, paddingBottom: space.sm },
  empty: { paddingTop: space.xl, textAlign: 'center' as const, fontSize: font.meta, color: palette.textFaint },
  jump: {
    position: 'absolute' as const,
    right: 0,
    bottom: space.md,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  jumpGlyph: { fontSize: font.meta, color: palette.text, lineHeight: 16 },
});
