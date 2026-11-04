import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, PixelRatio, Platform, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useBrowserInfo } from '../core/browser';
import { connection } from '../core/connection';
import {
  encodeBrowserControl,
  encodeBrowserInfo,
  encodeBrowserInput,
  encodeBrowserUnblock,
  encodeBrowserWatch,
  type BrowserControlAction,
  type BrowserWatchQuality,
  type BrowserInput,
  type BrowserUnblockResultFrame,
} from '../core/protocol';
import {
  BROWSER_HASH,
  browserLiveStore,
  setShownWindowCloser,
  shownTab,
  useLiveFrame,
  useLiveNotice,
  useLiveWindows,
} from '../core/browserLive';
import { ChevronIcon, CollapseIcon, ExpandIcon, OpenInNewIcon, PlusIcon, RefreshIcon } from '../components/icons';
import { useTheme } from '../theme';
import { BrowserWall, wallOrder } from './browser/BrowserWall';
import { DEFAULT_RATIO, wallLayout } from './browser/wallLayout';
import { LiveWindowView } from './browser/LiveWindowView';

/** How long a "copied" mark stays up. Long enough to be read, short enough not to look stuck. */
const COPIED_MS = 1500;

function useCopy(): { copied: string | null; copy: (key: string, value: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return {
    copied,
    copy: useCallback((key: string, value: string) => {
      Clipboard.setString(value);
      setCopied(key);
    }, []),
  };
}

let controlSeq = 0;

/** The full-size picture's width (`CAST_PRESETS.focus` on the server): past it, the page's own. */
const FOCUS_LARGE_PIXELS = 1600;

/**
 * What the page watches, as the server takes it: the listing always, and the pictures of what is
 * on screen -- every window's shown tab as a tile, or one window's at full size.
 *
 * A tile asks for the size it draws (`tile`, `tile-large`), and so does a window shown large
 * (`focus`, `focus-large`): a picture stretched past its own resolution reads as a blur, on a wide
 * desk as much as on a phone.
 */
export function watchFor(
  windows: ReturnType<typeof useLiveWindows>['windows'],
  open: number | null,
  quality: 'tile' | 'tile-large',
  focus: 'focus' | 'focus-large' = 'focus',
): Array<{ pageId: string; quality: BrowserWatchQuality }> {
  if (!windows) return [];
  if (open !== null) {
    const window = windows.find(w => w.windowId === open);
    const tab = window ? shownTab(window) : undefined;
    return tab ? [{ pageId: tab.pageId, quality: focus }] : [];
  }
  return windows.flatMap(w => {
    const tab = shownTab(w);
    return tab ? [{ pageId: tab.pageId, quality }] : [];
  });
}

/**
 * The live view: every window of the browser as it is now, what the agents do in it, and the
 * owner's hand in any of them -- docs/browser-live.md in the server repo. Watching and acting hold
 * nothing: an agent keeps its window while the owner looks, or helps.
 */
function LivePane({
  connected,
  initialWindow,
  vnc,
}: {
  connected: boolean;
  initialWindow: number | null;
  vnc: { host: string; port: number } | null;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { windows, error } = useLiveWindows();
  const notice = useLiveNotice();
  const [open, setOpen] = useState<number | null>(initialWindow);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [newUrl, setNewUrl] = useState('');
  // The pane, and the fields above the wall inside it: what is left is the room the grid has.
  const [pane, setPane] = useState({ width: 0, height: 0 });
  const [above, setAbove] = useState({ y: 0, width: 0, height: 0 });
  const onPane = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPane(current => (current.width === width && current.height === height ? current : { width, height }));
  }, []);
  const onAbove = useCallback((e: LayoutChangeEvent) => {
    const { y, width, height } = e.nativeEvent.layout;
    setAbove(current => (current.y === y && current.width === width && current.height === height ? current : { y, width, height }));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  // The page's shape comes from the browser's own pictures: the tile box is the viewport's, and one
  // shape serves the whole wall (every window holds the same screen).
  const first = windows ? wallOrder(windows)[0] : undefined;
  const firstFrame = useLiveFrame(first ? shownTab(first)?.pageId : undefined);
  const ratio = firstFrame && firstFrame !== 'gone' && firstFrame.height > 0 ? firstFrame.width / firstFrame.height : DEFAULT_RATIO;
  // What the body leaves under the fields: its gap, then the padding at the end of the scroll.
  const room = Math.max(0, pane.height - above.y - above.height - space.md - space.xl);
  const layout = wallLayout({
    count: windows?.length ?? 0,
    // The fields span the scroll view's content, which is what the rows have: the pane less the
    // scrollbar a desk browser draws in it.
    width: above.width || pane.width,
    room,
    ratio,
    pixelRatio: PixelRatio.get(),
  });

  // A window shown large is drawn at most the pane's width: past 1600 device pixels that is the
  // page's own 1920, below it the smaller picture a phone has always had.
  const focusQuality = pane.width * PixelRatio.get() > FOCUS_LARGE_PIXELS ? 'focus-large' : 'focus';
  const streams = useMemo(
    () => watchFor(windows, open, layout.quality, focusQuality),
    [windows, open, layout.quality, focusQuality],
  );
  const key = JSON.stringify(streams);
  const lastSent = useRef<string | null>(null);
  // Sent again on every change of what is shown, and on every reconnect: the server forgets a
  // device's watch with its socket. A phone in the background watches nothing.
  useEffect(() => {
    const message = active && connected ? encodeBrowserWatch(true, streams) : encodeBrowserWatch(false, []);
    if (!connected) {
      lastSent.current = null;
      return;
    }
    if (message === lastSent.current) return;
    lastSent.current = message;
    connection.send(message).catch(() => {});
    browserLiveStore.keepFrames(streams.map(s => s.pageId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, connected]);
  useEffect(
    () => () => {
      connection.send(encodeBrowserWatch(false, [])).catch(() => {});
    },
    [],
  );

  const control = useCallback(
    (action: BrowserControlAction, target: { windowId?: number; pageId?: string; url?: string } = {}) => {
      browserLiveStore.setNotice(null);
      controlSeq += 1;
      connection.send(encodeBrowserControl(`c${controlSeq}`, action, target)).catch(() => {});
    },
    [],
  );
  const input = useCallback(
    (pageId: string, i: BrowserInput) => {
      // Never queued: the outbox would replay a tap long after the page moved under it.
      if (connected) connection.send(encodeBrowserInput(pageId, i)).catch(() => {});
    },
    [connected],
  );

  const focused = open === null ? undefined : windows?.find(w => w.windowId === open);
  // The window closed while it was open: back to the wall.
  useEffect(() => {
    if (open !== null && windows && !windows.some(w => w.windowId === open)) setOpen(null);
  }, [open, windows]);
  // Escape and the back keys return to the wall before they leave the page.
  const shown = focused !== undefined;
  useEffect(() => {
    if (!shown) return;
    setShownWindowCloser(() => setOpen(null));
    return () => setShownWindowCloser(null);
  }, [shown]);

  const notices = (
    <>
      {notice ? (
        <Text style={styles.error} accessibilityLabel={`Browser notice ${notice}`}>
          {notice}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );

  // A window at full size is not in a scroll view: a finger dragged on the page scrolls the page,
  // and a scroll view around it would take the drag for itself.
  if (focused) {
    return (
      <View style={[styles.body, styles.live, styles.fill]} onLayout={onPane}>
        {notices}
        <LiveWindowView
          window={focused}
          windows={windows ? [...windows].sort((a, b) => a.alias - b.alias) : [focused]}
          onSwitch={setOpen}
          vnc={vnc}
          connected={connected}
          onBack={() => setOpen(null)}
          control={control}
          input={input}
        />
      </View>
    );
  }
  return (
    <View style={styles.fill} onLayout={onPane} testID="browser-live-pane">
      <ScrollView style={styles.wallScroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.above} onLayout={onAbove} testID="browser-live-fields">
          {notices}
          {windows === null ? (
            <Text style={styles.empty}>{connected ? 'asking the browser…' : 'offline'}</Text>
          ) : (
            <View style={styles.newRow}>
              <TextInputRow
                value={newUrl}
                onChange={setNewUrl}
                onSubmit={() => {
                  control('new_window', newUrl.trim() ? { url: newUrl.trim() } : {});
                  setNewUrl('');
                }}
              />
            </View>
          )}
        </View>
        {windows === null ? null : (
          <BrowserWall windows={windows} layout={layout} ratio={ratio} onOpen={setOpen} onStage={windowId => control('stage', { windowId })} />
        )}
      </ScrollView>
    </View>
  );
}

/** The installer's units, in words; another name shows as itself. */
const UNIT_LABELS: Record<string, string> = {
  'my-claw-xvfb': 'Virtual display',
  'my-claw-chromium': 'Chromium',
  'my-claw-browser-sidecar': 'Agent control',
  'my-claw-vnc': 'VNC server',
  'my-claw-novnc': 'Web client (noVNC)',
};

/** One line under the title: what needs the owner, else what is open. */
export function headerSummary(
  info: ReturnType<typeof useBrowserInfo>,
  windows: ReturnType<typeof useLiveWindows>['windows'],
): { text: string; alert: boolean } {
  if (info && !info.enabled) return { text: 'disabled on the server', alert: true };
  const down = info?.services.filter(service => !service.active).length ?? 0;
  if (down) return { text: `${down} service${down > 1 ? 's' : ''} down`, alert: true };
  if (!windows) return { text: 'loading', alert: false };
  const waiting = windows.filter(w => w.state === 'waiting').length;
  const working = windows.filter(w => w.state === 'working').length;
  const parts = [`${windows.length} window${windows.length === 1 ? '' : 's'}`];
  if (working) parts.push(`${working} at work`);
  if (waiting) parts.push(`${waiting} waiting for you`);
  return { text: parts.join(' · '), alert: waiting > 0 };
}

/**
 * How to drive the browser by hand: the noVNC link, the address a native VNC client dials, the
 * password, and enough state to know whether connecting is worth it.
 *
 * The password is hidden until asked for. Not as a secret from the owner -- this device already
 * runs the agent, and the agent has a shell -- but because a screen that displays it unasked is
 * one someone else reads over a shoulder.
 */
export function BrowserScreen({
  error,
  unblock,
  onClose,
  connected = true,
  initialWindow = null,
  fullScreen = false,
  onToggleFullScreen,
}: {
  error: string | null;
  /** What the last unlock did, handed down by the shell: a result is a moment, not a state. */
  unblock?: BrowserUnblockResultFrame | null;
  onClose: () => void;
  /** The socket is up: a tap sent without it would be replayed by the outbox long after. */
  connected?: boolean;
  /** Opened on one window (a web tab popped out for another screen). */
  initialWindow?: number | null;
  /** The page has the whole window to itself, the conversation list and the conversation hidden. */
  fullScreen?: boolean;
  /** Given where there is something to take the window from (a desktop): a phone is full screen already. */
  onToggleFullScreen?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const info = useBrowserInfo();
  const { copied, copy } = useCopy();
  const [revealed, setRevealed] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const [pane, setPane] = useState<'live' | 'connect'>('live');
  useDismissKeyboard();

  const unlock = useCallback(() => {
    setUnsent(false);
    // The answer arrives as its own frame and lands in `unblock`; a send that could not even be
    // queued would otherwise look like a button that does nothing.
    connection.send(encodeBrowserUnblock()).catch(() => setUnsent(true));
  }, []);

  const refresh = useCallback(() => {
    connection.send(encodeBrowserInfo()).catch(() => {});
  }, []);

  // Asked on open and on every reopen: units start and stop between two visits, so a cached
  // answer would state a browser is up long after it went down.
  useEffect(refresh, [refresh]);

  const vncAddress = info?.vncHost ? `${info.vncHost}:${info.vncPort}` : null;
  const { windows } = useLiveWindows();
  const summary = headerSummary(info, windows);
  const down = info?.services.filter(service => !service.active) ?? [];

  // Every window, full screen, in a tab of its own: one to leave on a screen of its own.
  const openInTab = useCallback(() => {
    const w = globalThis as unknown as { open?: (url: string, target: string) => void; location?: { origin: string; pathname: string } };
    if (w.open && w.location) w.open(`${w.location.origin}${w.location.pathname}${BROWSER_HASH}`, '_blank');
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Close browser">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title} numberOfLines={1}>Browser</Text>
          <Text style={[styles.headerSub, summary.alert && styles.headerAlert]} numberOfLines={1}>
            {summary.text}
          </Text>
        </View>
        {/* One control with two halves: which pane is showing reads at a glance. */}
        <View style={styles.segment}>
          {(['live', 'connect'] as const).map(p => (
            <Pressable
              key={p}
              onPress={() => setPane(p)}
              style={[styles.segmentItem, pane === p && styles.segmentOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: pane === p }}
              accessibilityLabel={p === 'live' ? 'Live view' : 'Connect with VNC'}>
              <Text style={pane === p ? styles.segmentOnText : styles.segmentText}>{p === 'live' ? 'Live' : 'VNC'}</Text>
            </Pressable>
          ))}
        </View>
        {onToggleFullScreen ? (
          <Pressable
            onPress={onToggleFullScreen}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={fullScreen ? 'Exit full screen' : 'Full screen'}>
            {fullScreen ? <CollapseIcon size={18} tone="text" /> : <ExpandIcon size={18} tone="text" />}
          </Pressable>
        ) : null}
        {Platform.OS === 'web' ? (
          <Pressable onPress={openInTab} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Open the browser in a new tab">
            <OpenInNewIcon size={18} tone="text" />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Browser error ${error}`}>
          {error}
        </Text>
      ) : null}

      {pane === 'live' ? (
        <LivePane
          connected={connected}
          initialWindow={initialWindow}
          vnc={info?.vncHost ? { host: info.vncHost, port: info.vncPort } : null}
        />
      ) : info === null ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Take the screen by VNC</Text>
            {info.webUrl ? (
              <View style={styles.line}>
                <View style={styles.lineMain}>
                  <Text style={styles.label}>Web client</Text>
                  <Text style={styles.value} numberOfLines={1}>{info.webUrl.replace(/^https?:\/\//, '')}</Text>
                </View>
                <Pressable
                  onPress={() => copy('web', info.webUrl ?? '')}
                  style={styles.button}
                  accessibilityRole="button"
                  accessibilityLabel="Copy noVNC link">
                  <Text style={styles.buttonText}>{copied === 'web' ? 'Copied' : 'Copy'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => Linking.openURL(info.webUrl ?? '').catch(() => {})}
                  style={styles.primaryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Open noVNC">
                  <Text style={styles.primaryText}>Open</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.hint}>No web client configured on the server (browser.novncUrl).</Text>
            )}

            {vncAddress ? (
              <View style={styles.line}>
                <View style={styles.lineMain}>
                  <Text style={styles.label}>VNC app</Text>
                  <Text style={styles.value} numberOfLines={1}>{vncAddress}</Text>
                </View>
                <Pressable
                  onPress={() => copy('vnc', vncAddress)}
                  style={styles.button}
                  accessibilityRole="button"
                  accessibilityLabel="Copy VNC address">
                  <Text style={styles.buttonText}>{copied === 'vnc' ? 'Copied' : 'Copy'}</Text>
                </Pressable>
              </View>
            ) : null}

            {info.password ? (
              <>
                <View style={styles.line}>
                  <View style={styles.lineMain}>
                    <Text style={styles.label}>Password</Text>
                    <Text style={revealed ? styles.password : styles.value}>{revealed ? info.password : '········'}</Text>
                  </View>
                  <Pressable
                    onPress={() => setRevealed(current => !current)}
                    style={styles.button}
                    accessibilityRole="button"
                    accessibilityLabel={revealed ? 'Hide password' : 'Show password'}>
                    <Text style={styles.buttonText}>{revealed ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => copy('password', info.password ?? '')}
                    style={styles.button}
                    accessibilityRole="button"
                    accessibilityLabel="Copy password">
                    <Text style={styles.buttonText}>{copied === 'password' ? 'Copied' : 'Copy'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>
                  VNC sends the screen unencrypted: reach it over the LAN or a VPN only.
                </Text>
              </>
            ) : (
              <Text style={styles.warn}>No password set: anyone who reaches the port takes the screen.</Text>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Services</Text>
              <Text style={down.length ? styles.down : styles.up}>
                {info.services.length === 0 ? '' : down.length ? `${down.length} down` : 'all running'}
              </Text>
              <Pressable
                onPress={refresh}
                style={styles.iconButtonSmall}
                accessibilityRole="button"
                accessibilityLabel="Refresh browser state">
                <RefreshIcon size={16} tone="text" />
              </Pressable>
            </View>
            {info.services.length === 0 ? (
              <Text style={styles.hint}>
                No unit to check here: a compose install runs the browser in its own container.
              </Text>
            ) : (
              info.services.map(service => (
                <View key={service.unit} style={styles.serviceRow}>
                  <View style={[styles.dot, service.active ? styles.dotUp : styles.dotDown]} />
                  <View style={styles.lineMain}>
                    <Text style={styles.value}>{UNIT_LABELS[service.unit] ?? service.unit}</Text>
                    <Text style={styles.unit}>{service.unit}</Text>
                  </View>
                  <Text style={service.active ? styles.up : styles.down}>{service.active ? 'up' : 'down'}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Clicks do nothing?</Text>
            {/*
              The way out of the one failure this page cannot be diagnosed from: a native file
              picker opens behind the browser window (nothing on that display raises it, there is
              no window manager), its modal grab eats every click, and the screen looks normal.
            */}
            <Text style={styles.hint}>
              A file picker or a dialog is probably open behind the window. Unlock raises it, closes
              a file picker nobody asked for, and puts the browser back in front.
            </Text>
            <Pressable
              onPress={unlock}
              style={[styles.button, styles.alignStart]}
              accessibilityRole="button"
              accessibilityLabel="Unlock the browser">
              <Text style={styles.buttonText}>Unlock</Text>
            </Pressable>
            {unblock ? (
              <Text style={unblock.ok ? styles.hint : styles.error} accessibilityLabel="Browser unlock result">
                {unblock.message}
              </Text>
            ) : null}
            {unsent ? <Text style={styles.error}>could not reach the server</Text> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  // A page of the shell's own column, not a layer over the window: it flows inside the pane the
  // shell opened for it, which is already placed beside the conversation list and already padded.
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerMain: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  headerSub: { fontSize: font.small, color: palette.textFaint },
  headerAlert: { color: palette.danger },
  segment: {
    flexDirection: 'row' as const,
    padding: 2,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
  },
  segmentItem: { height: 36, justifyContent: 'center' as const, paddingHorizontal: space.md, borderRadius: radius.sm },
  segmentOn: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  segmentText: { fontSize: font.small, color: palette.textMuted },
  segmentOnText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  live: { gap: space.md },
  fill: { flex: 1 },
  // The scrollbar's room is kept whether the wall scrolls or not: a wall that grew a scrollbar
  // would be measured narrower, shrink its tiles, lose the scrollbar, and grow again.
  wallScroll: Platform.OS === 'web' ? ({ scrollbarGutter: 'stable' } as object) : {},
  above: { gap: space.md },
  error: {
    marginTop: space.md,
    color: palette.danger,
    fontSize: font.small,
  },
  empty: { paddingVertical: space.lg, color: palette.textFaint, fontSize: font.body },
  body: { gap: space.md, paddingTop: space.md, paddingBottom: space.xl },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: { flex: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  label: { fontSize: font.small, color: palette.textFaint },
  value: { fontSize: font.body, color: palette.text },
  password: {
    fontSize: font.body,
    color: palette.text,
    fontFamily: 'monospace' as const,
    letterSpacing: 2,
  },
  hint: { fontSize: font.small, color: palette.textFaint },
  row: { flexDirection: 'row' as const, gap: space.sm, flexWrap: 'wrap' as const },
  newRow: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'center' as const },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  lineMain: { flex: 1, minWidth: 0 },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  alignStart: { alignSelf: 'flex-start' as const },
  warn: { fontSize: font.small, color: palette.danger },
  unit: { fontSize: font.micro, color: palette.textFaint },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUp: { backgroundColor: palette.ok },
  dotDown: { backgroundColor: palette.danger },
  primaryButton: {
    height: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  primaryText: { fontSize: font.small, fontWeight: '600' as const, color: palette.accentText },
  button: {
    height: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  buttonText: { fontSize: font.small, color: palette.text },
  serviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  up: { fontSize: font.small, color: palette.ok },
  down: { fontSize: font.small, color: palette.danger },
  newWindow: {
    flex: 1,
    height: 40,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

/** A window of the owner's own, on the VNC screen: to log in to a site once, or look something up. */
function TextInputRow({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Open a page in a new window"
        placeholderTextColor={palette.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        style={styles.newWindow}
        accessibilityLabel="New window address"
      />
      <Pressable onPress={onSubmit} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Open a new window">
        <PlusIcon size={20} color={palette.accentText} />
      </Pressable>
    </>
  );
}
