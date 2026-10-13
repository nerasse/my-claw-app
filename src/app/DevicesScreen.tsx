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
import { SvgXml } from 'react-native-svg';
import Clipboard from '@react-native-clipboard/clipboard';

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

/** When an invitation stops working, as a clock time: a countdown would redraw the page every second. */
function until(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The devices paired to this server, and the two ways to add one (docs/web-pairing.md): an
 * invitation this device shows and the new one scans or types, or a request the new one shows and
 * this device approves after comparing three digits.
 */
export function DevicesScreen({
  onBack,
  connected,
  serverOrigin,
  startInviting = false,
}: {
  onBack: () => void;
  /** Opened from the get started: the invitation card is what the step is for. */
  startInviting?: boolean;
  connected: boolean;
  /** The address this device reaches the server at: what an invitation names unless changed. */
  serverOrigin: string;
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
  const [mode, setMode] = useState<'none' | 'invite' | 'approve'>(startInviting ? 'invite' : 'none');
  const [inviteName, setInviteName] = useState('');
  const [inviteOrigin, setInviteOrigin] = useState(serverOrigin);

  useEffect(() => {
    if (connected) devicesStore.refresh();
  }, [connected]);
  useEffect(
    () => () => {
      devicesStore.clearMessages();
      devicesStore.clearInvite();
    },
    [],
  );
  useEffect(() => setInviteOrigin(serverOrigin), [serverOrigin]);
  // A device added, either way: the card it was added from has done its job.
  useEffect(() => {
    if (state.notice === 'device added') setMode('none');
  }, [state.notice]);
  const invite = state.invite;

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
        {candidate ? null : (
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.grow, mode === 'invite' && styles.approve]}
              onPress={() => setMode(current => (current === 'invite' ? 'none' : 'invite'))}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'invite' }}
              accessibilityLabel="Add a device">
              <Text style={styles.buttonText}>Add a device</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.grow, mode === 'approve' && styles.approve]}
              onPress={() => setMode(current => (current === 'approve' ? 'none' : 'approve'))}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'approve' }}
              accessibilityLabel="Approve a request">
              <Text style={styles.buttonText}>Approve a request</Text>
            </Pressable>
          </View>
        )}
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        {state.notice ? <Text style={styles.notice}>{state.notice}</Text> : null}

        {candidate ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{candidate.kind === 'native' ? 'Approve this phone?' : 'Approve this browser?'}</Text>
            {/* The digits are the whole defence: without comparing them, someone else's code
                pairs their browser to this account and the screen looks identical. */}
            <View style={styles.verifyBox}>
              <Text style={styles.verifyLabel}>{candidate.kind === 'native' ? 'the phone must show' : 'the browser must show'}</Text>
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
                  devicesStore.approve(name.trim());
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
        ) : mode === 'invite' ? (
          invite ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Invitation</Text>
              <Text style={styles.hint}>
                On the new phone, open my-claw and scan this code. On a computer, open the link, or type the code on its pairing page.
              </Text>
              {invite.qrSvg ? (
                <View style={styles.qr} accessibilityLabel="Invitation QR code">
                  <SvgXml xml={invite.qrSvg} width="100%" height="100%" />
                </View>
              ) : null}
              <Text style={[styles.verify, styles.centered]} selectable accessibilityLabel="Invitation code">
                {formatCode(invite.code)}
              </Text>
              <Text style={styles.detail} selectable numberOfLines={2}>
                {invite.url}
              </Text>
              <Text style={styles.detail}>{`single use · valid until ${until(invite.expiresAt)}`}</Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.grow]}
                  onPress={() => Clipboard.setString(invite.url)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy the invitation link">
                  <Text style={styles.buttonText}>Copy link</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.grow]}
                  onPress={() => {
                    devicesStore.clearInvite();
                    setMode('none');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close the invitation">
                  <Text style={styles.buttonText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add a device</Text>
              <Text style={styles.hint}>
                An invitation shows a QR and a code the new device uses once, within ten minutes. It joins your conversations.
              </Text>
              <TextInput
                style={styles.input}
                value={inviteName}
                onChangeText={setInviteName}
                placeholder="its name, e.g. Papa's phone"
                autoCorrect={false}
                accessibilityLabel="Name of the new device"
              />
              <Text style={styles.detail}>The address the new device reaches the server at</Text>
              <TextInput
                style={styles.input}
                value={inviteOrigin}
                onChangeText={setInviteOrigin}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Address for the new device"
              />
              <Pressable
                style={[styles.button, styles.approve, (state.busy || !connected) && styles.busy]}
                onPress={() => devicesStore.invite(inviteOrigin.trim(), inviteName)}
                disabled={state.busy || !connected || inviteOrigin.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Create the invitation">
                {state.busy ? <ActivityIndicator size="small" /> : <Text style={styles.buttonText}>Create the invitation</Text>}
              </Pressable>
            </View>
          )
        ) : mode !== 'approve' ? null : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Approve a request</Text>
            <Text style={styles.hint}>
              {scannerSupported
                ? 'The new device shows a code and three digits: scan or type the code, then check the digits.'
                : 'The new device shows a code and three digits: type the code, then check the digits.'}
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
  grow: { flex: 1, alignItems: 'center' as const },
  centered: { textAlign: 'center' as const },
  // White whatever the theme: a QR is read by contrast, and every scanner reads dark on light.
  qr: { alignSelf: 'center' as const, width: 220, height: 220, padding: space.sm, backgroundColor: '#ffffff', borderRadius: radius.sm },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  actions: { flexDirection: 'row' as const, gap: space.sm },
  button: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
