import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { devicesStore, useDevices } from '../core/devices';
import type { DeviceRecord } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { PairScanner } from '../components/PairScanner';
import { scannerSupported } from '../core/platform';

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

export function DevicesScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { scrollProps, indicator } = useScrollIndicator();
  const state = useDevices();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<DeviceRecord | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    devicesStore.refresh();
    return () => devicesStore.clearMessages();
  }, []);

  const submitCode = useCallback(() => {
    devicesStore.lookup(code);
    setCode('');
  }, [code]);

  const candidate = state.candidate;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Devices</Text>
      </View>

      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
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
                style={[styles.button, styles.approve]}
                onPress={() => {
                  devicesStore.approve(name.trim() || 'browser');
                  setName('');
                }}
                disabled={state.busy}
                accessibilityRole="button"
                accessibilityLabel="Approve this pairing"
              >
                <Text style={styles.buttonText}>Approve</Text>
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
                style={[styles.button, styles.approve]}
                onPress={submitCode}
                disabled={state.busy || code.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Look up this pairing code"
              >
                <Text style={styles.buttonText}>Check</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>PAIRED · {state.devices.length}</Text>
        {state.status === 'unknown' ? (
          <Text style={styles.hint}>loading</Text>
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
            {device.self ? null : confirming?.deviceId === device.deviceId ? (
              <View style={styles.row}>
                <Pressable
                  style={[styles.button, styles.deny]}
                  onPress={() => {
                    devicesStore.revoke(device.deviceId);
                    setConfirming(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm revoking ${device.name}`}
                >
                  <Text style={styles.buttonText}>Confirm</Text>
                </Pressable>
                <Pressable
                  style={styles.button}
                  onPress={() => setConfirming(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.button}
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
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  back: { fontSize: font.screen, color: palette.textFaint, paddingHorizontal: 4 },
  title: { fontSize: font.screen, fontWeight: '600' as const, color: palette.text },
  content: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
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
