import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../../theme';
import { shownTab, useLiveFrame } from '../../core/browserLive';
import type { BrowserLiveWindow } from '../../core/protocol';
import type { WallLayout } from './wallLayout';
import { LiveImage } from './LiveImage';

export function stateLabel(window: BrowserLiveWindow): string {
  return window.state === 'working' ? 'agent at work' : window.state === 'waiting' ? 'waiting for you' : 'free';
}

const RANK: Record<BrowserLiveWindow['state'], number> = { waiting: 0, working: 1, free: 2 };

/** What needs the owner first, then what an agent is doing, then the rest, each in its own order. */
export function wallOrder(windows: BrowserLiveWindow[]): BrowserLiveWindow[] {
  return windows
    .map((w, i) => ({ w, i }))
    .sort((a, b) => RANK[a.w.state] - RANK[b.w.state] || a.i - b.i)
    .map(e => e.w);
}

/** The site, not the whole address: a tile has room for one short line. */
export function hostOf(url: string | undefined): string {
  if (!url) return '';
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return (match ? match[1]! : url).replace(/^www\./, '');
}

/**
 * Every window of the browser, live, with what is happening in it. A tile opens the window at full
 * size, where the owner acts in it; watching holds nothing, so agents keep working meanwhile.
 *
 * The grid is the pane's, not the wall's: `wallLayout` decides the tile width and the room to
 * leave above. A tile takes the shape of the page it shows, which is the browser's viewport for
 * every window the agents open, and the shape of the pane's own viewport until its first picture.
 */
export function BrowserWall({
  windows,
  layout,
  ratio,
  onOpen,
  onStage,
}: {
  windows: BrowserLiveWindow[];
  layout: WallLayout;
  /** The shape of a picture, as the frames themselves state it. */
  ratio: number;
  onOpen: (windowId: number) => void;
  onStage: (windowId: number) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.wall, { paddingTop: layout.padTop }]}>
      {windows.length === 0 ? <Text style={styles.empty}>No window open. Open one above, or ask the agent.</Text> : null}
      {wallOrder(windows).map(w => (
        <WindowTile key={w.windowId} window={w} layout={layout} ratio={ratio} onOpen={onOpen} onStage={onStage} />
      ))}
    </View>
  );
}

function WindowTile({
  window,
  layout,
  ratio,
  onOpen,
  onStage,
}: {
  window: BrowserLiveWindow;
  layout: WallLayout;
  ratio: number;
  onOpen: (windowId: number) => void;
  onStage: (windowId: number) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const tab = shownTab(window);
  const frame = useLiveFrame(tab?.pageId);
  const picture = frame === 'gone' ? undefined : frame;
  const extraTabs = window.tabs.length - 1;
  return (
    <View
      style={[
        styles.tile,
        { width: layout.tileWidth },
        window.state === 'working' && styles.tileWorking,
        window.state === 'waiting' && styles.tileWaiting,
      ]}>
      <Pressable onPress={() => onOpen(window.windowId)} accessibilityRole="button" accessibilityLabel={`Open window ${window.alias}`}>
        <View style={[styles.picture, { aspectRatio: picture ? picture.width / picture.height : ratio }]}>
          <LiveImage frame={picture} style={StyleSheet.absoluteFill} label={`Live picture of window ${window.alias}`} />
          {picture ? null : <Text style={styles.noPicture}>{frame === 'gone' ? 'no picture' : 'loading…'}</Text>}
          {window.state === 'free' ? null : (
            <Text style={[styles.chip, styles.chipLeft, window.state === 'waiting' ? styles.chipWaiting : styles.chipWorking]}>
              {stateLabel(window)}
            </Text>
          )}
          {extraTabs > 0 ? (
            <Text style={[styles.chip, styles.chipRight]}>{`+${extraTabs} tab${extraTabs > 1 ? 's' : ''}`}</Text>
          ) : null}
        </View>
        {/* Room on the right for the VNC action, laid over the tile's corner: one row, not two. */}
        <View style={styles.caption}>
          <Text style={styles.title} numberOfLines={1}>
            <Text style={styles.alias}>{`Window ${window.alias}`}</Text>
            {`  ${tab?.title || hostOf(tab?.url) || 'blank'}`}
          </Text>
          <Text style={window.task ? styles.task : styles.host} numberOfLines={1}>
            {window.task ?? hostOf(tab?.url)}
          </Text>
        </View>
      </Pressable>
      <View style={styles.footer}>
        {window.onStage ? (
          <Text style={styles.onStage}>on VNC</Text>
        ) : (
          <Pressable
            onPress={() => onStage(window.windowId)}
            hitSlop={8}
            style={styles.stageButton}
            accessibilityRole="button"
            accessibilityLabel={`Show window ${window.alias} in VNC`}>
            <Text style={styles.stageText}>Show in VNC</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wall: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.md, justifyContent: 'center' as const },
  empty: { color: palette.textFaint, fontSize: font.body, paddingVertical: space.lg },
  tile: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden' as const,
  },
  tileWorking: { borderColor: palette.accent },
  tileWaiting: { borderColor: palette.danger, borderWidth: 2 },
  picture: { width: '100%' as const, backgroundColor: palette.surfaceAlt },
  noPicture: { position: 'absolute' as const, top: space.sm, left: space.sm, color: palette.textFaint, fontSize: font.small },
  chip: {
    position: 'absolute' as const,
    top: space.xs,
    fontSize: font.micro,
    fontWeight: '600' as const,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden' as const,
    color: palette.text,
    backgroundColor: palette.surface,
  },
  chipLeft: { left: space.xs },
  chipRight: { right: space.xs },
  chipWorking: { color: palette.accentText, backgroundColor: palette.accent },
  chipWaiting: { color: palette.accentText, backgroundColor: palette.danger },
  caption: { paddingLeft: space.sm, paddingRight: 104, paddingVertical: space.sm, gap: 2 },
  title: { fontSize: font.small, color: palette.text },
  alias: { fontWeight: '700' as const },
  task: { fontSize: font.small, color: palette.accent },
  host: { fontSize: font.small, color: palette.textFaint },
  footer: { position: 'absolute' as const, right: space.sm, bottom: space.sm + 2 },
  onStage: { fontSize: font.small, color: palette.textFaint },
  stageButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  stageText: { fontSize: font.small, color: palette.text },
});
