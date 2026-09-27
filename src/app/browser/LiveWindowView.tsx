import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../../theme';
import { shownTab, useLiveFrame } from '../../core/browserLive';
import type { BrowserControlAction, BrowserInput, BrowserLiveWindow } from '../../core/protocol';
import { LiveSurface } from './LiveSurface';
import { stateLabel } from './BrowserWall';
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

/** A second press within this closes a window an agent works in: one press alone would be a slip. */
const CONFIRM_MS = 3000;

/**
 * One window at full size, and the owner's hand in it. Nothing here takes the window from the
 * agent working in it: the owner helps (a button the agent cannot find, a captcha) and the agent
 * carries on.
 */
export function LiveWindowView({
  window,
  vnc,
  connected,
  onBack,
  control,
  input,
}: {
  window: BrowserLiveWindow;
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
  const [room, setRoom] = useState(0);
  const onRoom = useCallback((e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.height), []);
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
        <Pressable onPress={onBack} style={styles.button} accessibilityRole="button" accessibilityLabel="Back to all windows">
          <Text style={styles.buttonText}>‹ All</Text>
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.title}>Window {window.alias}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {stateLabel(window)}
            {window.onStage ? ' · on the VNC screen' : ''}
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
          <Pressable onPress={popOut} style={styles.button} accessibilityRole="button" accessibilityLabel="Open in a new browser window">
            <Text style={styles.buttonText}>Pop out</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={closeWindow} style={styles.button} accessibilityRole="button" accessibilityLabel="Close window">
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
                <Text style={styles.tabClose}>×</Text>
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
            style={styles.navButton}
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
        <LiveSurface frame={picture} interactive={interactive} onInput={send} maxHeight={room || undefined} />
      </View>
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
          style={styles.typing}
          accessibilityLabel="Type into the page"
        />
      )}
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
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  view: { flex: 1, gap: space.sm },
  room: { flex: 1, minHeight: 120, overflow: 'hidden' as const },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  titleBox: { flex: 1, minWidth: 120 },
  title: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  sub: { fontSize: font.small, color: palette.textFaint },
  task: { fontSize: font.small, color: palette.text },
  note: { fontSize: font.small, color: palette.textFaint },
  danger: { fontSize: font.body, color: palette.danger },
  button: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
  buttonText: { fontSize: font.body, color: palette.text },
  primary: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: palette.accent },
  primaryText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
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
  nav: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  navButton: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
  address: {
    flex: 1,
    fontSize: font.small,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  typing: {
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  keys: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  key: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
});
