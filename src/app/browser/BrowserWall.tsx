import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../../theme';
import { shownTab, useLiveFrame } from '../../core/browserLive';
import type { BrowserLiveWindow } from '../../core/protocol';
import { LiveImage } from './LiveImage';

/** A tile needs this much room to be read; the wall takes as many columns as fit. */
const TILE_MIN_WIDTH = 320;

export function stateLabel(window: BrowserLiveWindow): string {
  return window.state === 'working' ? 'agent at work' : window.state === 'waiting' ? 'waiting for you' : 'free';
}

/**
 * Every window of the browser, live, with what is happening in it. A tile opens the window at full
 * size, where the owner acts in it; watching holds nothing, so agents keep working meanwhile.
 */
export function BrowserWall({
  windows,
  onOpen,
  onStage,
}: {
  windows: BrowserLiveWindow[];
  onOpen: (windowId: number) => void;
  onStage: (windowId: number) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  const columns = Math.max(1, Math.floor((width + space.md) / (TILE_MIN_WIDTH + space.md)));
  // Before the wall is measured, one tile per row: a tile never waits on a layout to exist.
  const tileWidth: number | '100%' = width > 0 ? (width - space.md * (columns - 1)) / columns : '100%';

  return (
    <View style={styles.wall} onLayout={onLayout}>
      {windows.length === 0 ? <Text style={styles.empty}>no window open</Text> : null}
      {windows.map(w => (
        <WindowTile key={w.windowId} window={w} width={tileWidth} onOpen={onOpen} onStage={onStage} />
      ))}
    </View>
  );
}

function WindowTile({
  window,
  width,
  onOpen,
  onStage,
}: {
  window: BrowserLiveWindow;
  width: number | '100%';
  onOpen: (windowId: number) => void;
  onStage: (windowId: number) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const tab = shownTab(window);
  const frame = useLiveFrame(tab?.pageId);
  const picture = frame === 'gone' ? undefined : frame;
  const ratio = picture ? picture.width / Math.max(1, picture.height) : 16 / 9;
  return (
    <View style={[styles.tile, { width }, window.state === 'waiting' && styles.waitingTile]}>
      <Pressable
        onPress={() => onOpen(window.windowId)}
        accessibilityRole="button"
        accessibilityLabel={`Open window ${window.alias}`}>
        <View style={styles.tileHead}>
          <Text style={styles.tileTitle}>Window {window.alias}</Text>
          <Text style={[styles.badge, window.state === 'working' && styles.badgeWorking, window.state === 'waiting' && styles.badgeWaiting]}>
            {stateLabel(window)}
          </Text>
          {window.onStage ? <Text style={[styles.badge, styles.badgeStage]}>on VNC</Text> : null}
        </View>
        {window.task ? (
          <Text style={styles.task} numberOfLines={2}>
            {window.task}
          </Text>
        ) : null}
        <View style={[styles.picture, { aspectRatio: ratio }]}>
          <LiveImage frame={picture} style={StyleSheet.absoluteFill} label={`Live picture of window ${window.alias}`} />
          {picture ? null : <Text style={styles.waitingText}>{frame === 'gone' ? 'no picture' : 'waiting for a picture…'}</Text>}
        </View>
        <Text style={styles.tabTitle} numberOfLines={1}>
          {tab?.title || 'untitled'}
          {window.tabs.length > 1 ? `  +${window.tabs.length - 1}` : ''}
        </Text>
        <Text style={styles.tabUrl} numberOfLines={1}>
          {tab?.url ?? ''}
        </Text>
      </Pressable>
      {window.onStage ? null : (
        <Pressable
          onPress={() => onStage(window.windowId)}
          style={styles.stageButton}
          accessibilityRole="button"
          accessibilityLabel={`Show window ${window.alias} in VNC`}>
          <Text style={styles.stageText}>Show in VNC</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wall: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.md },
  empty: { color: palette.textFaint, fontSize: font.body, paddingVertical: space.lg },
  tile: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 0,
    gap: space.xs,
    overflow: 'hidden' as const,
    paddingBottom: space.sm,
  },
  waitingTile: { borderColor: palette.danger },
  tileHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.sm, flexWrap: 'wrap' as const },
  tileTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  badge: {
    fontSize: font.small,
    color: palette.textFaint,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    overflow: 'hidden' as const,
  },
  badgeWorking: { color: palette.accent },
  badgeWaiting: { color: palette.danger },
  badgeStage: { color: palette.text },
  task: { fontSize: font.small, color: palette.text, paddingHorizontal: space.sm },
  picture: { width: '100%' as const, backgroundColor: palette.surfaceAlt },
  waitingText: { position: 'absolute' as const, top: space.sm, left: space.sm, color: palette.textFaint, fontSize: font.small },
  tabTitle: { fontSize: font.small, color: palette.text, paddingHorizontal: space.sm },
  tabUrl: { fontSize: font.small, color: palette.textFaint, paddingHorizontal: space.sm },
  stageButton: {
    alignSelf: 'flex-start' as const,
    marginHorizontal: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  stageText: { fontSize: font.small, color: palette.text },
});
