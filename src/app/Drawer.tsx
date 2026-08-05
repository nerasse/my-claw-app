import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, FlatList, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionSummary } from '../core/protocol';
import { ThreadRow } from '../components/ThreadRow';
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
 * Left slide-over: conversations first, settings pinned at the bottom. Stays mounted so the
 * panel animates both ways and swallows no touches while closed.
 */
export function Drawer({
  open,
  sessions,
  unread,
  activeThread,
  connectionState,
  pending,
  onClose,
  onOpenThread,
  onNewThread,
  onThreadMenu,
  onOpenSettings,
}: {
  open: boolean;
  sessions: SessionSummary[];
  unread: string[];
  activeThread: string | null;
  connectionState: WsState;
  pending: number;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onNewThread: () => void;
  onThreadMenu: (thread: SessionSummary) => void;
  onOpenSettings: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

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

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <View style={styles.head}>
          <Text style={styles.brand}>MyClaw</Text>
          <Pressable
            onPress={onNewThread}
            hitSlop={10}
            style={styles.newButton}
            accessibilityRole="button"
            accessibilityLabel="New conversation">
            <Text style={styles.newGlyph}>+</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>conversations · {sessions.length}</Text>

        <FlatList
          style={styles.list}
          data={sessions}
          keyExtractor={item => item.threadId}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={<Text style={styles.empty}>no conversations</Text>}
          renderItem={({ item }) => (
            <ThreadRow
              item={item}
              active={item.threadId === activeThread}
              unread={unread.includes(item.threadId)}
              onOpen={() => onOpenThread(item.threadId)}
              onMenu={() => onThreadMenu(item)}
            />
          )}
        />

        <Pressable
          style={styles.footer}
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
    paddingTop: space.xl,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  brand: { fontSize: font.screen, fontWeight: '700' as const, color: palette.text, letterSpacing: 0.2 },
  newButton: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  newGlyph: { fontSize: font.screen, lineHeight: 19, color: palette.accent, fontWeight: '700' as const },
  sectionLabel: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  list: { flex: 1, paddingHorizontal: space.sm },
  separator: { height: 1, backgroundColor: palette.border, marginHorizontal: space.sm },
  empty: { padding: space.lg, fontSize: font.meta, color: palette.textFaint },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  footerMain: { flex: 1, gap: 1 },
  footerTitle: { fontSize: font.body, color: palette.text },
  footerMeta: { fontSize: font.small, color: palette.textMuted },
  footerGlyph: { fontSize: font.screen, color: palette.textFaint },
});
