import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View, type ViewStyle } from 'react-native';
import { Bubble } from '../components/Bubble';
import { ToolCard } from '../components/ToolCard';
import { Composer } from '../components/Composer';
import type { ChatItem, TextItem } from '../core/chat';
import type { DeviceInfo } from '../core/device';
import { connection } from '../core/connection';
import { useCommands } from '../core/commands';
import { encodeCommandsList } from '../core/protocol';
import type { WsState } from '../core/types';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

const GROUP_WINDOW_MS = 120_000;

function statusColor(state: WsState, styles: ReturnType<typeof createStyles>): ViewStyle | null {
  switch (state) {
    case 'connected':
      return styles.statusOk;
    case 'disconnected':
      return styles.statusBad;
    case 'connecting':
      return styles.statusWarn;
    default:
      return styles.statusOff;
  }
}

/** Same author, close in time and not split by a tool card: render as one visual block. */
function isGrouped(items: ChatItem[], index: number): boolean {
  const item = items[index];
  const previous = items[index - 1];
  if (!item || !previous || item.kind !== 'text' || previous.kind !== 'text') return false;
  return previous.role === item.role && item.ts - previous.ts < GROUP_WINDOW_MS;
}

export function ChatScreen({
  threadId,
  title,
  subtitle,
  connectionState,
  items,
  mediaBase,
  deviceInfo,
  hint,
  autoFocusHero,
  onOpenDrawer,
  onStatusPress,
  onSend,
  onBubbleMenu,
}: {
  threadId: string;
  title: string;
  subtitle: string;
  connectionState: WsState;
  items: ChatItem[];
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  hint?: string;
  autoFocusHero: boolean;
  onOpenDrawer: () => void;
  onStatusPress: () => void;
  onSend: (text: string) => void;
  onBubbleMenu: (item: TextItem) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const commands = useCommands();
  const inCommandRef = useRef(false);

  useEffect(() => {
    if (!atBottom) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(timer);
  }, [items, atBottom]);

  // Re-fetch the catalog every time the user starts a command: a command added on the server
  // is visible on the next "/" without an app release.
  useEffect(() => {
    const inCommand = draft.trim().startsWith('/');
    if (inCommand && !inCommandRef.current) connection.send(encodeCommandsList());
    inCommandRef.current = inCommand;
  }, [draft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }, [draft, onSend]);

  const empty = items.length === 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onOpenDrawer}
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
        <Pressable
          onPress={onStatusPress}
          hitSlop={10}
          style={styles.statusButton}
          accessibilityRole="button"
          accessibilityLabel={`Connection status: ${connectionState}`}>
          <View style={[styles.statusDot, statusColor(connectionState, styles)]} />
        </Pressable>
      </View>

      {empty ? (
        // New conversation: the composer itself is the screen. Keyed by thread so switching
        // straight from one empty thread to another re-focuses the field.
        <View style={styles.hero}>
          <Composer
            key={threadId}
            hero
            autoFocus={autoFocusHero}
            value={draft}
            onChange={setDraft}
            onSend={submit}
            hint={hint}
            commands={commands}
          />
        </View>
      ) : (
        <>
          <View style={styles.listWrap}>
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
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

        <Composer value={draft} onChange={setDraft} onSend={submit} hint={hint} commands={commands} />
        </>
      )}
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
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  menuGlyph: { fontSize: 20, lineHeight: 22, color: palette.text },
  headerText: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  statusButton: { padding: 2 },
  statusDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: palette.surface },
  statusOk: { backgroundColor: palette.ok },
  statusOff: { backgroundColor: palette.textFaint },
  statusWarn: { backgroundColor: palette.warn },
  statusBad: { backgroundColor: palette.danger },
  listWrap: { flex: 1 },
  listContent: { paddingTop: space.md, paddingBottom: space.sm },
  hero: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
  },
  jump: {
    position: 'absolute' as const,
    right: 0,
    bottom: space.md,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  jumpGlyph: { fontSize: 16, color: palette.text, lineHeight: 20 },
});
