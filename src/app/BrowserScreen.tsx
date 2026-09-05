import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useBrowserInfo } from '../core/browser';
import { connection } from '../core/connection';
import { encodeBrowserInfo } from '../core/protocol';

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

/**
 * How to drive the browser by hand: the noVNC link, the address a native VNC client dials, the
 * password, and enough state to know whether connecting is worth it.
 *
 * The password is hidden until asked for. Not as a secret from the owner -- this device already
 * runs the agent, and the agent has a shell -- but because a screen that displays it unasked is
 * one someone else reads over a shoulder.
 */
export function BrowserScreen({ error, onClose }: { error: string | null; onClose: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const info = useBrowserInfo();
  const { copied, copy } = useCopy();
  const [revealed, setRevealed] = useState(false);
  useDismissKeyboard();

  const refresh = useCallback(() => {
    connection.send(encodeBrowserInfo()).catch(() => {});
  }, []);

  // Asked on open and on every reopen: units start and stop between two visits, so a cached
  // answer would state a browser is up long after it went down.
  useEffect(refresh, [refresh]);

  const vncAddress = info?.vncHost ? `${info.vncHost}:${info.vncPort}` : null;

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
          <Text style={styles.title}>Browser</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {info === null ? 'loading' : info.enabled ? 'take the session over' : 'browser disabled on the server'}
          </Text>
        </View>
        <Pressable
          onPress={refresh}
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh browser state">
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Browser error ${error}`}>
          {error}
        </Text>
      ) : null}

      {info === null ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Open tabs</Text>
            {info.tabsError ? (
              <Text style={styles.hint}>{info.tabsError}</Text>
            ) : info.tabs.length === 0 ? (
              <Text style={styles.hint}>no tab open</Text>
            ) : (
              info.tabs.map(tab => (
                <View key={tab.id} style={styles.tab}>
                  <Text style={styles.tabTitle} numberOfLines={1}>
                    {tab.title || 'untitled'}
                  </Text>
                  <Text style={styles.tabUrl} numberOfLines={1}>
                    {tab.url}
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
    gap: space.md,
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
  tab: { gap: 1 },
  tabTitle: { fontSize: font.small, color: palette.text },
  tabUrl: { fontSize: font.small, color: palette.textFaint },
});
