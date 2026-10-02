import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
  type BrowserInput,
  type BrowserUnblockResultFrame,
} from '../core/protocol';
import { BROWSER_HASH, browserLiveStore, shownTab, useLiveNotice, useLiveWindows } from '../core/browserLive';
import { CollapseIcon, ExpandIcon, OpenInNewIcon, RefreshIcon } from '../components/icons';
import { useTheme } from '../theme';
import { BrowserWall } from './browser/BrowserWall';
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

/**
 * What the page watches, as the server takes it: the listing always, and the pictures of what is
 * on screen -- every window's shown tab as a tile, or one window's at full size.
 */
export function watchFor(
  windows: ReturnType<typeof useLiveWindows>['windows'],
  open: number | null,
): Array<{ pageId: string; quality: 'tile' | 'focus' }> {
  if (!windows) return [];
  if (open !== null) {
    const window = windows.find(w => w.windowId === open);
    const tab = window ? shownTab(window) : undefined;
    return tab ? [{ pageId: tab.pageId, quality: 'focus' }] : [];
  }
  return windows.flatMap(w => {
    const tab = shownTab(w);
    return tab ? [{ pageId: tab.pageId, quality: 'tile' as const }] : [];
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

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const streams = useMemo(() => watchFor(windows, open), [windows, open]);
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
      <View style={[styles.body, styles.live, styles.fill]}>
        {notices}
        <LiveWindowView window={focused} vnc={vnc} connected={connected} onBack={() => setOpen(null)} control={control} input={input} />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {notices}
      {windows === null ? (
        <Text style={styles.empty}>{connected ? 'asking the browser…' : 'offline'}</Text>
      ) : (
        <>
          <View style={styles.row}>
            <TextInputRow
              value={newUrl}
              onChange={setNewUrl}
              onSubmit={() => {
                control('new_window', newUrl.trim() ? { url: newUrl.trim() } : {});
                setNewUrl('');
              }}
            />
          </View>
          <BrowserWall windows={windows} onOpen={setOpen} onStage={windowId => control('stage', { windowId })} />
        </>
      )}
    </ScrollView>
  );
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
  const { palette } = useTheme();
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
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close browser">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title} numberOfLines={1}>Browser</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {info === null ? 'loading' : info.enabled ? 'watch the agents, lend a hand' : 'browser disabled on the server'}
          </Text>
        </View>
        {(['live', 'connect'] as const).map(p => (
          <Pressable
            key={p}
            onPress={() => setPane(p)}
            style={[styles.refreshButton, pane === p && styles.paneOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: pane === p }}
            accessibilityLabel={p === 'live' ? 'Live view' : 'Connect with VNC'}>
            <Text style={pane === p ? styles.paneOnText : styles.refreshText}>{p === 'live' ? 'Live' : 'VNC'}</Text>
          </Pressable>
        ))}
        {/* Icons past the two panes: in a 460pt pane beside the conversation, words here took the
            title's room. */}
        <Pressable
          onPress={refresh}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh browser state">
          <RefreshIcon size={20} color={palette.text} />
        </Pressable>
        {onToggleFullScreen ? (
          <Pressable
            onPress={onToggleFullScreen}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={fullScreen ? 'Exit full screen' : 'Full screen'}>
            {fullScreen ? <CollapseIcon size={20} color={palette.text} /> : <ExpandIcon size={20} color={palette.text} />}
          </Pressable>
        ) : null}
        {Platform.OS === 'web' ? (
          <Pressable onPress={openInTab} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Open the browser in a new tab">
            <OpenInNewIcon size={20} color={palette.text} />
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
            <Text style={styles.cardTitle}>Unlock</Text>
            {/*
              The way out of the one failure this page cannot be diagnosed from: a native file
              picker opens behind the browser window (nothing on that display raises it, there is
              no window manager), its modal grab eats every click, and the screen looks normal.
            */}
            <Text style={styles.hint}>
              Nothing clickable, browser looking normal? A file picker or a dialog is probably
              open behind the window. This raises what is hiding, closes a file picker nobody
              asked for, and puts the browser back in front.
            </Text>
            <View style={styles.row}>
              <Pressable
                onPress={unlock}
                style={styles.primaryButton}
                accessibilityRole="button"
                accessibilityLabel="Unlock the browser">
                <Text style={styles.primaryText}>Unlock</Text>
              </Pressable>
            </View>
            {unblock ? (
              <Text
                style={unblock.ok ? styles.hint : styles.error}
                accessibilityLabel="Browser unlock result">
                {unblock.message}
              </Text>
            ) : null}
            {unsent ? <Text style={styles.error}>could not reach the server</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connect</Text>
            {info.webUrl ? (
              <>
                <Text style={styles.value} numberOfLines={2}>
                  {info.webUrl}
                </Text>
                <View style={styles.row}>
                  <Pressable
                    onPress={() => Linking.openURL(info.webUrl ?? '').catch(() => {})}
                    style={styles.primaryButton}
                    accessibilityRole="button"
                    accessibilityLabel="Open noVNC">
                    <Text style={styles.primaryText}>Open web client</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => copy('web', info.webUrl ?? '')}
                    style={styles.button}
                    accessibilityRole="button"
                    accessibilityLabel="Copy noVNC link">
                    <Text style={styles.buttonText}>{copied === 'web' ? 'Copied' : 'Copy link'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.hint}>no noVNC URL configured on the server (browser.novncUrl)</Text>
            )}

            {vncAddress ? (
              <>
                <Text style={styles.label}>VNC app</Text>
                <Text style={styles.value}>{vncAddress}</Text>
                <View style={styles.row}>
                  <Pressable
                    onPress={() => copy('vnc', vncAddress)}
                    style={styles.button}
                    accessibilityRole="button"
                    accessibilityLabel="Copy VNC address">
                    <Text style={styles.buttonText}>{copied === 'vnc' ? 'Copied' : 'Copy address'}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Password</Text>
            {info.password ? (
              <>
                <Text style={revealed ? styles.password : styles.value}>
                  {revealed ? info.password : '········'}
                </Text>
                <View style={styles.row}>
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
                  VNC keeps 8 characters and sends the screen unencrypted: this stops a stranger on
                  the network, it is not a lock. Reach it over the LAN or the VPN only.
                </Text>
              </>
            ) : (
              <Text style={styles.hint}>
                no password set: anyone who reaches the port takes the screen
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Services</Text>
            {info.services.length === 0 ? (
              <Text style={styles.hint}>none configured</Text>
            ) : (
              info.services.map(service => (
                <View key={service.unit} style={styles.serviceRow}>
                  <Text style={styles.serviceName} numberOfLines={1}>
                    {service.unit}
                  </Text>
                  <Text style={service.active ? styles.up : styles.down}>
                    {service.active ? 'up' : 'down'}
                  </Text>
                </View>
              ))
            )}
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  headerMain: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  headerSub: { fontSize: font.small, color: palette.textFaint },
  refreshButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  refreshText: { fontSize: font.body, color: palette.text },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  paneOn: { backgroundColor: palette.accent },
  paneOnText: { fontSize: font.body, color: palette.surface, fontWeight: '600' as const },
  live: { gap: space.md },
  fill: { flex: 1 },
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
  cardTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  label: { fontSize: font.small, color: palette.textFaint, marginTop: space.sm },
  value: { fontSize: font.body, color: palette.text },
  password: {
    fontSize: font.body,
    color: palette.text,
    fontFamily: 'monospace' as const,
    letterSpacing: 2,
  },
  hint: { fontSize: font.small, color: palette.textFaint },
  row: { flexDirection: 'row' as const, gap: space.sm, flexWrap: 'wrap' as const },
  primaryButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  primaryText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  button: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  buttonText: { fontSize: font.body, color: palette.text },
  serviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  serviceName: { flex: 1, fontSize: font.small, color: palette.text },
  up: { fontSize: font.small, color: palette.accent },
  down: { fontSize: font.small, color: palette.danger },
  newWindow: {
    flex: 1,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});

/** A window of the owner's own, on the VNC screen: to log in to a site once, or look something up. */
function TextInputRow({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="New window: an address, or empty"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        style={styles.newWindow}
        accessibilityLabel="New window address"
      />
      <Pressable onPress={onSubmit} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Open a new window">
        <Text style={styles.primaryText}>New window</Text>
      </Pressable>
    </>
  );
}
