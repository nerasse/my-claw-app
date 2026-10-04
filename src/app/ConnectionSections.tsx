import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { WsStatusPayload } from '../core/types';
import type { DeviceInfo } from '../core/device';
import { appUpdateSupported } from '../core/appUpdateRuntime';
import { useTheme } from '../theme';
import { Section, useSettingsStyles } from './settingsParts';

/** Keeps the last four characters visible so the pair can be recognized, nothing more. */
function maskToken(token: string): string {
  return `${'•'.repeat(Math.max(token.length - 4, 0))}${token.slice(-4)}`;
}

/** The credential this device talks with, on the Devices page above the ones it paired. */
export function ThisDeviceSection({
  deviceInfo,
  appVersion,
}: {
  deviceInfo: DeviceInfo | null;
  /** The running build's version name; null until the native side answers. */
  appVersion: string | null;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  const [showToken, setShowToken] = useState(false);
  return (
    <Section title="this device">
      {deviceInfo ? (
        <>
          <View style={styles.kv}>
            <Text style={styles.key}>app</Text>
            <Text style={styles.value}>{appVersion ?? '…'}</Text>
          </View>
          {deviceInfo.deviceId ? (
            <>
              <View style={styles.kv}>
                <Text style={styles.key}>device</Text>
                <Text style={[styles.value, styles.mono]} selectable>
                  {deviceInfo.deviceId}
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.key}>token</Text>
                <Text style={[styles.value, styles.mono]} selectable={showToken}>
                  {showToken ? deviceInfo.token : maskToken(deviceInfo.token)}
                </Text>
                <Pressable
                  onPress={() => setShowToken(value => !value)}
                  hitSlop={8}
                  style={styles.toggle}
                  accessibilityRole="button"
                  accessibilityLabel={showToken ? 'Hide token' : 'Show token'}>
                  <Text style={styles.toggleText}>{showToken ? 'hide' : 'show'}</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.button, styles.buttonGhost]}
                onPress={() => Clipboard.setString(`device: ${deviceInfo.deviceId}\ntoken: ${deviceInfo.token}`)}
                accessibilityRole="button"
                accessibilityLabel="Copy device and token">
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Copy device & token</Text>
              </Pressable>
              <Text style={styles.hint}>paste into channels["my-claw-app"].devices on the server</Text>
            </>
          ) : (
            // A browser has no credential to show: the session cookie is HttpOnly, which is the
            // point. Blank device and token rows would read as a broken pairing.
            <Text style={styles.hint}>browser session · paired device managed server side</Text>
          )}
        </>
      ) : (
        <Text style={styles.hint}>device not initialized</Text>
      )}
    </Section>
  );
}

/** Which server this device talks to, and the buttons that change it. */
export function ServerSection({
  url,
  onUrlChange,
  status,
  serverVersion,
  onConnect,
  onDisconnect,
  onOpenPairing,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  status: WsStatusPayload;
  /** The version the connected server announced (`hello` frame); null until it speaks. */
  serverVersion: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Opens the native pairing screen (claim a server-minted device). */
  onOpenPairing: () => void;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  const { palette } = useTheme();
  const connected = status.state === 'connected';
  const busy = connected || status.state === 'connecting';
  // The socket keeps running on the address it was started with, so editing the field alone would
  // leave the screen showing one server while the app talks to another.
  const elsewhere = busy && Boolean(status.url) && status.url !== url.trim();
  return (
    <Section title="server">
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={onUrlChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="wss://server/my-claw-app"
        placeholderTextColor={palette.textFaint}
        accessibilityLabel="Server address"
      />
      <Text style={styles.hint}>{`${status.state}${serverVersion ? ` · my-claw ${serverVersion}` : ''}`}</Text>
      {elsewhere ? (
        <Text style={styles.hint} accessibilityLabel="Live server differs">
          {`still talking to ${status.url} · reconnect to apply`}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.button, busy && !elsewhere && styles.buttonOff]}
          onPress={onConnect}
          disabled={busy && !elsewhere}
          accessibilityRole="button"
          accessibilityLabel={elsewhere ? 'Reconnect to the new server' : 'Connect'}>
          <Text style={styles.buttonText}>{elsewhere ? 'Reconnect' : 'Connect'}</Text>
        </Pressable>
        {/* A browser pairs on the server's own /pair page: it cannot store a token. */}
        {appUpdateSupported ? (
          <Pressable
            style={[styles.button, styles.buttonGhost]}
            onPress={onOpenPairing}
            accessibilityRole="button"
            accessibilityLabel="Pair this device with a server-minted code">
            <Text style={[styles.buttonText, styles.buttonGhostText]}>Pair</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.button, styles.buttonGhost, !busy && styles.buttonOff]}
          onPress={onDisconnect}
          disabled={!busy}
          accessibilityRole="button">
          <Text style={[styles.buttonText, styles.buttonGhostText]}>Disconnect</Text>
        </Pressable>
      </View>
    </Section>
  );
}

/** The socket's own state, for when something is wrong: on the Advanced page. */
export function ConnectionSection({
  status,
  serverVersion,
  pending,
  onClearOutbox,
}: {
  status: WsStatusPayload;
  serverVersion: string | null;
  pending: number;
  onClearOutbox: () => void;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  return (
    <Section title="connection">
      <View style={styles.kv}>
        <Text style={styles.key}>state</Text>
        <Text style={styles.value}>
          {`${status.state}${serverVersion ? ` · v${serverVersion}` : ''}${status.attempts ? ` · attempt ${status.attempts}` : ''}`}
        </Text>
      </View>
      {status.reason ? (
        <View style={styles.kv}>
          <Text style={styles.key}>reason</Text>
          <Text style={styles.value} numberOfLines={2}>
            {status.reason}
          </Text>
        </View>
      ) : null}
      <View style={styles.kv}>
        <Text style={styles.key}>send queue</Text>
        <Text style={styles.value}>{pending === 0 ? 'empty' : `${pending} pending`}</Text>
      </View>
      {pending > 0 ? (
        <Pressable style={[styles.button, styles.buttonGhost]} onPress={onClearOutbox} accessibilityRole="button">
          <Text style={[styles.buttonText, styles.buttonGhostText]}>Clear queue</Text>
        </Pressable>
      ) : null}
    </Section>
  );
}
