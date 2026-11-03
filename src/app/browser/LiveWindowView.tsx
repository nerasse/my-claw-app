import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../../theme';
import { shownTab, useLiveFrame } from '../../core/browserLive';
import type { BrowserControlAction, BrowserInput, BrowserLiveWindow } from '../../core/protocol';
import { LiveSurface } from './LiveSurface';
import { hostOf, stateLabel } from './BrowserWall';
import { ChevronIcon, CloseIcon, OpenInNewIcon } from '../../components/icons';
import { useTheme } from '../../theme';
import { textEdit } from './surfaceMath';

/** Keys a phone keyboard does not have, or does not send to a field. */
const KEYS: Array<{ key: string; label: string }> = [
  { key: 'Enter', label: 'Enter' },
  { key: 'Backspace', label: '⌫' },
  { key: 'Tab', label: 'Tab' },
  { key: 'Escape', label: 'Esc' },
  { key: 'ArrowLeft', label: '←' },
  { key: 'ArrowUp', label: '↑' },
  { key: 'ArrowDown', label: '↓' },
  { key: 'ArrowRight', label: '→' },
];

/** Below this width the page has no keyboard of its own worth trusting: the extra keys are shown. */
const KEYS_BELOW = 720;

/** A second press within this closes a window an agent works in: one press alone would be a slip. */
const CONFIRM_MS = 3000;

/**
 * One window at full size, and the owner's hand in it. Nothing here takes the window from the
 * agent working in it: the owner helps (a button the agent cannot find, a captcha) and the agent
 * carries on.
 */
export function LiveWindowView({
  window,
  windows,
  onSwitch,
  vnc,
  connected,
  onBack,
  control,
  input,
}: {
  window: BrowserLiveWindow;
  /** Every window, by number: one is shown large, the others are a press away. */
  windows: BrowserLiveWindow[];
  onSwitch: (windowId: number) => void;
  vnc: { host: string; port: number } | null;
  connected: boolean;
  onBack: () => void;
  control: (action: BrowserControlAction, target?: { windowId?: number; pageId?: string; url?: string }) => void;
  input: (pageId: string, input: BrowserInput) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const tab = shownTab(window);
  const frame = useLiveFrame(tab?.pageId);
  const [address, setAddress] = useState(tab?.url ?? '');
  const [typed, setTyped] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [vncNote, setVncNote] = useState<string | null>(null);
  // The picture takes the room the controls leave, which shrinks when the keyboard comes up: the
  // field typed in and the page it types into stay on screen together.
  // The picture is fitted in what the controls under it leave, and they follow it right below
  // instead of sinking to the bottom of the pane with a gap between.
  const [room, setRoom] = useState(0);
  const [below, setBelow] = useState(0);
  const onRoom = useCallback((e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.height), []);
  const onBelow = useCallback((e: LayoutChangeEvent) => setBelow(e.nativeEvent.layout.height), []);
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const showKeys = Platform.OS !== 'web' || width < KEYS_BELOW;
  const typedRef = useRef(typed);
  typedRef.current = typed;

  // A tab that moved (a link, another tab) shows its own address, not the one typed for the last.
  useEffect(() => setAddress(tab?.url ?? ''), [tab?.pageId, tab?.url]);
  useEffect(() => {
    if (!confirmClose) return;
    const timer = setTimeout(() => setConfirmClose(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmClose]);

  const send = useCallback((i: BrowserInput) => tab && input(tab.pageId, i), [input, tab]);

  const onType = useCallback(
    (next: string) => {
      const { erase, insert } = textEdit(typedRef.current, next);
      for (let i = 0; i < erase; i++) send({ kind: 'key', key: 'Backspace' });
      if (insert) send({ kind: 'text', text: insert });
      setTyped(next);
    },
    [send],
  );

  const openVnc = useCallback(() => {
    if (!vnc) return;
    const url = `vnc://${vnc.host}:${vnc.port}`;
    Linking.openURL(url).catch(() => setVncNote(`no app opens vnc:// links here: connect your VNC app to ${vnc.host}:${vnc.port}`));
  }, [vnc]);

  const popOut = useCallback(() => {
    const w = globalThis as unknown as { open?: (url: string, target: string) => void; location?: { origin: string; pathname: string } };
    if (w.open && w.location) w.open(`${w.location.origin}${w.location.pathname}#browser-window=${window.windowId}`, '_blank');
  }, [window.windowId]);

  const closeWindow = () => {
    if (window.state === 'working' && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    control('close_window', { windowId: window.windowId });
    onBack();
  };

  const interactive = connected && tab !== undefined;
  const picture = frame === 'gone' ? undefined : frame;

  return (
    <View style={styles.view}>
      <View style={styles.bar}>
        {/* Words, not a second chevron under the page's own: this one goes back to the windows. */}
        <Pressable onPress={onBack} style={styles.button} accessibilityRole="button" accessibilityLabel="Back to all windows">
          <View style={styles.buttonLabel}>
            <ChevronIcon direction="left" size={14} tone="faint" />
            <Text style={styles.buttonText}>Windows</Text>
          </View>
        </Pressable>
        {windows.length > 1 ? (
          <View style={styles.switcher}>
            {windows.map(w => (
              <Pressable
                key={w.windowId}
                onPress={() => onSwitch(w.windowId)}
                style={[styles.switchItem, w.windowId === window.windowId && styles.switchOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: w.windowId === window.windowId }}
                accessibilityLabel={`Show window ${w.alias} large`}>
                <Text style={w.windowId === window.windowId ? styles.switchOnText : styles.switchText}>{w.alias}</Text>
                {w.state === 'free' ? null : <View style={[styles.switchDot, w.state === 'waiting' ? styles.dotWaiting : styles.dotWorking]} />}
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.titleBox}>
          <Text style={styles.title} numberOfLines={1}>
            Window {window.alias}
          </Text>
          <Text style={[styles.sub, window.state === 'waiting' && styles.subWaiting, window.state === 'working' && styles.subWorking]} numberOfLines={1}>
            {stateLabel(window)}
            {window.onStage ? ' · on VNC' : ''}
            {tab?.url ? ` · ${hostOf(tab.url)}` : ''}
          </Text>
        </View>
        {window.onStage ? null : (
          <Pressable
            onPress={() => control('stage', { windowId: window.windowId })}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Show in VNC">
            <Text style={styles.primaryText}>Show in VNC</Text>
          </Pressable>
        )}
        {vnc && Platform.OS !== 'web' ? (
          <Pressable onPress={openVnc} style={styles.button} accessibilityRole="button" accessibilityLabel="Open the VNC app">
            <Text style={styles.buttonText}>VNC app</Text>
          </Pressable>
        ) : null}
        {Platform.OS === 'web' ? (
          <Pressable onPress={popOut} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Open in a new browser window">
            <OpenInNewIcon size={18} tone="text" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={closeWindow}
          style={[styles.button, confirmClose && styles.dangerOutline]}
          accessibilityRole="button"
          accessibilityLabel="Close window">
          <Text style={confirmClose ? styles.danger : styles.buttonText}>{confirmClose ? 'Agent at work: close?' : 'Close'}</Text>
        </Pressable>
      </View>
      {window.task ? (
        <Text style={styles.task} numberOfLines={2}>
          {window.task}
        </Text>
      ) : null}
      {vncNote ? <Text style={styles.note}>{vncNote}</Text> : null}

      {window.tabs.length > 1 ? (
        <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabsRow} keyboardShouldPersistTaps="handled">
          {window.tabs.map(t => (
            <View key={t.pageId} style={[styles.tab, t.pageId === tab?.pageId && styles.tabActive]}>
              <Pressable
                onPress={() => control('focus_tab', { pageId: t.pageId })}
                accessibilityRole="button"
                accessibilityLabel={`Show tab ${t.title || t.url}`}>
                <Text style={styles.tabText} numberOfLines={1}>
                  {t.title || t.url || 'untitled'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => control('close_tab', { pageId: t.pageId })}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Close tab ${t.title || t.url}`}>
                <CloseIcon size={16} tone="faint" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.nav}>
        {(['back', 'forward', 'reload'] as const).map(action => (
          <Pressable
            key={action}
            onPress={() => tab && control(action, { pageId: tab.pageId })}
            style={styles.iconButtonSmall}
            accessibilityRole="button"
            accessibilityLabel={action === 'back' ? 'Back' : action === 'forward' ? 'Forward' : 'Reload'}>
            <Text style={styles.buttonText}>{action === 'back' ? '←' : action === 'forward' ? '→' : '↻'}</Text>
          </Pressable>
        ))}
        <TextInput
          value={address}
          onChangeText={setAddress}
          onSubmitEditing={() => tab && address.trim() && control('goto', { pageId: tab.pageId, url: address.trim() })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          style={styles.address}
          accessibilityLabel="Address"
        />
      </View>

      <View style={styles.room} onLayout={onRoom}>
        <LiveSurface
          frame={picture}
          interactive={interactive}
          onInput={send}
          maxHeight={room ? Math.max(120, room - below - space.sm) : undefined}
        />
        <View style={styles.below} onLayout={onBelow}>
          {frame === 'gone' ? <Text style={styles.note}>this tab is gone</Text> : null}
          {connected ? null : <Text style={styles.note}>offline: the page takes no tap or key until the connection is back</Text>}
          {Platform.OS === 'web' ? null : (
            <TextInput
              value={typed}
              onChangeText={onType}
              onKeyPress={e => {
                // An empty field sends no change for a backspace: the page still has to get it.
                if (e.nativeEvent.key === 'Backspace' && typedRef.current === '') send({ kind: 'key', key: 'Backspace' });
              }}
              onSubmitEditing={() => {
                send({ kind: 'key', key: 'Enter' });
                setTyped('');
              }}
              submitBehavior="submit"
              editable={interactive}
              placeholder="Type into the page (tap a field first)"
              placeholderTextColor={palette.textFaint}
              style={styles.typing}
              accessibilityLabel="Type into the page"
            />
          )}
          {showKeys ? (
            <View style={styles.keys}>
              {KEYS.map(k => (
                <Pressable
                  key={k.key}
                  onPress={() => send({ kind: 'key', key: k.key })}
                  disabled={!interactive}
                  style={styles.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Key ${k.key}`}>
                  <Text style={styles.buttonText}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  view: { flex: 1, gap: space.sm },
  room: { flex: 1, minHeight: 120, gap: space.sm },
  below: { gap: space.sm },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  switcher: { flexDirection: 'row' as const, padding: 2, gap: 2, borderRadius: radius.md, backgroundColor: palette.surfaceAlt },
  switchItem: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    borderRadius: radius.sm,
  },
  switchOn: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  switchText: { fontSize: font.small, color: palette.textMuted },
  switchOnText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  switchDot: { width: 6, height: 6, borderRadius: 3 },
  dotWorking: { backgroundColor: palette.accent },
  dotWaiting: { backgroundColor: palette.danger },
  titleBox: { flex: 1, minWidth: 0 },
  title: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  sub: { fontSize: font.small, color: palette.textFaint },
  subWorking: { color: palette.accent },
  subWaiting: { color: palette.danger },
  task: { fontSize: font.small, color: palette.accent },
  note: { fontSize: font.small, color: palette.textFaint },
  danger: { fontSize: font.small, color: palette.danger, fontWeight: '600' as const },
  dangerOutline: { borderWidth: 1, borderColor: palette.danger },
  iconButton: {
    width: 36,
    height: 36,
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
  button: {
    height: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  buttonLabel: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  buttonText: { fontSize: font.small, color: palette.text },
  primary: {
    height: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  primaryText: { fontSize: font.small, fontWeight: '600' as const, color: palette.accentText },
  tabs: { flexGrow: 0 },
  tabsRow: { gap: space.sm },
  tab: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    maxWidth: 220,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  tabActive: { borderWidth: 1, borderColor: palette.accent },
  tabText: { fontSize: font.small, color: palette.text, maxWidth: 170 },
  tabClose: { fontSize: font.body, color: palette.textFaint },
  nav: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  address: {
    flex: 1,
    height: 32,
    fontSize: font.small,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  typing: {
    minHeight: 40,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
  },
  keys: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs },
  key: {
    minWidth: 40,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
});
