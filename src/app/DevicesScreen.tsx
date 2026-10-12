import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { devicesStore, useDevices } from '../core/devices';
import type { DeviceRecord } from '../core/protocol';
import { BackButton, headerStyle } from '../components/BackButton';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { ActionSheet } from '../components/ActionSheet';
import { PairScanner } from '../components/PairScanner';
import { scannerSupported } from '../core/platform';
import { CloseButton } from '../components/CloseButton';
import { useDismissKeyboard } from '../core/keyboard';

/** "3 hours ago" beats an ISO string on a phone: the question is always how stale a device is. */
function since(iso: string | undefined): string {
  if (!iso) return 'never seen';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'never seen';
  const minutes = Math.floor((Date.now() - at) / 60000);
  if (minutes < 2) return 'seen just now';
  if (minutes < 60) return `seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `seen ${hours} h ago`;
  return `seen ${Math.floor(hours / 24)} d ago`;
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function DevicesScreen({
  onBack,
  head,
  connected,
}: {
  onBack: () => void;
  connected: boolean;
  /** This device and its server, above the devices it paired: one page for every device. */
  head?: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // The server field sits on top: the page must not open with the keyboard over it.
  useDismissKeyboard();
  const { scrollProps, indicator } = useScrollIndicator();
  const state = useDevices();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<DeviceRecord | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (connected) devicesStore.refresh();
  }, [connected]);
  useEffect(() => () => devicesStore.clearMessages(), []);

  const submitCode = useCallback(() => {
    devicesStore.lookup(code);
    setCode('');
  }, [code]);

  const candidate = state.candidate;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label="Back to settings" />
        <Text style={styles.title}>Devices</Text>
        <CloseButton />
      </View>

      {/* Without this the first tap on Check only dismisses the keyboard: the scroll view eats
          it as a blur and the owner has to press twice. */}
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {head}
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        {state.notice ? <Text style={styles.notice}>{state.notice}</Text> : null}

        {candidate ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Approve this browser?</Text>
            {/* The digits are the whole defence: without comparing them, someone else's code
                pairs their browser to this account and the screen looks identical. */}
            <View style={styles.verifyBox}>
              <Text style={styles.verifyLabel}>the browser must show</Text>
              <Text style={styles.verify}>{candidate.verification}</Text>
            </View>
            <Text style={styles.detail}>code {formatCode(candidate.code)}</Text>
            {candidate.origin ? <Text style={styles.detail}>{candidate.origin}</Text> : null}
            {candidate.ip ? <Text style={styles.detail}>from {candidate.ip}</Text> : null}
            {candidate.userAgent ? (
              <Text style={styles.detail} numberOfLines={2}>
                {candidate.userAgent}
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="name this device"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.actions}>
              {/* Both buttons carry the same weight: an approval must be a decision, not a
                  default. */}
              <Pressable
                style={[styles.button, styles.deny]}
                onPress={() => devicesStore.deny()}
                disabled={state.busy}
                accessibilityRole="button"
                accessibilityLabel="Refuse this pairing"
              >
                <Text style={styles.buttonText}>Refuse</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.approve, state.busy && styles.busy]}
                onPress={() => {
                  devicesStore.approve(name.trim() || 'browser');
                  setName('');
                }}
                disabled={state.busy}
                accessibilityRole="button"
                accessibilityLabel="Approve this pairing"
              >
                {state.busy ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.buttonText}>Approve</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pair a browser</Text>
            <Text style={styles.hint}>
              {scannerSupported
                ? 'Scan the code on the browser, or type it.'
                : 'Open the pairing page on the browser and type the code it shows.'}
            </Text>
            {scanning ? (
              <PairScanner
                onCode={scanned => {
                  setScanning(false);
                  devicesStore.lookup(scanned);
                }}
                onClose={() => setScanning(false)}
              />
            ) : scannerSupported ? (
              <Pressable
                style={styles.button}
                onPress={() => setScanning(true)}
                accessibilityRole="button"
                accessibilityLabel="Scan a pairing code"
              >
                <Text style={styles.buttonText}>Scan</Text>
              </Pressable>
            ) : null}
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={submitCode}
                returnKeyType="go"
              />
              <Pressable
                style={[styles.button, styles.approve, state.busy && styles.busy]}
                onPress={submitCode}
                disabled={state.busy || code.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Look up this pairing code"
              >
                {state.busy ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.buttonText}>Check</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>PAIRED · {state.devices.length}</Text>
        {state.status === 'unknown' ? (
          <Text style={styles.hint}>{connected ? 'loading' : 'Connect to your server to load paired devices.'}</Text>
        ) : state.devices.length === 0 ? (
          <Text style={styles.hint}>no device</Text>
        ) : null}

        {state.devices.map(device => (
          <View key={device.deviceId} style={styles.deviceRow}>
            <View style={styles.deviceMain}>
              <View style={styles.deviceTitleLine}>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {device.name}
                </Text>
                <Text style={styles.badge}>{device.kind}</Text>
                {device.self ? <Text style={styles.badge}>this one</Text> : null}
                {device.enabled ? null : <Text style={styles.badge}>disabled</Text>}
              </View>
              <Text style={styles.detail}>
                {device.deviceId} · {since(device.lastSeenAt)}
              </Text>
            </View>
            {device.self ? null : (
              <Pressable
                style={styles.revoke}
                onPress={() => setConfirming(device)}
                accessibilityRole="button"
                accessibilityLabel={`Revoke ${device.name}`}
              >
                <Text style={styles.buttonText}>Revoke</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
      {indicator}

      {confirming ? (
        <ActionSheet
          preview={`Revoke "${confirming.name}"? Its sockets close at once, its browser sessions are dropped, and it has to be paired again to come back.`}
          options={[
            {
              label: 'Revoke',
              danger: true,
              onPress: () => {
                devicesStore.revoke(confirming.deviceId);
                setConfirming(null);
              },
            },
          ]}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: headerStyle(palette),

  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  content: { paddingVertical: space.md, gap: space.sm, paddingBottom: space.xl },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  verifyBox: {
    alignItems: 'center' as const,
    gap: 2,
    paddingVertical: space.sm,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
  },
  verifyLabel: {
    fontSize: font.micro,
    color: palette.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  verify: {
    fontSize: 34,
    fontWeight: '700' as const,
    letterSpacing: 6,
    color: palette.text,
  },
  hint: { fontSize: font.small, color: palette.textMuted },
  detail: { fontSize: font.small, color: palette.textFaint },
  error: { fontSize: font.small, color: palette.danger },
  notice: { fontSize: font.small, color: palette.accent },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    color: palette.text,
    backgroundColor: palette.bg,
    fontSize: font.body,
  },
  codeInput: { flex: 1, letterSpacing: 2 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  actions: { flexDirection: 'row' as const, gap: space.sm },
  button: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  approve: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  busy: { opacity: 0.7 },
  // Not `button` with `flex: 0` on top: on the web that is a zero basis, and the word overflowed
  // a sliver of a box.
  revoke: {
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  deny: { borderColor: palette.danger },
  buttonText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  sectionLabel: {
    marginTop: space.md,
    fontSize: font.micro,
    color: palette.textMuted,
    letterSpacing: 0.5,
  },
  deviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  deviceMain: { flex: 1, gap: 2 },
  deviceTitleLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  deviceName: { flexShrink: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
  },
});
