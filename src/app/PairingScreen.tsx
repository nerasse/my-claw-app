import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PairScanner } from '../components/PairScanner';
import { scannerSupported } from '../core/platform';
import { isValidServerUrl } from '../core/serverUrl';
import { pairingStatus, startPairing, cancelPairing, onPairingStatus, requestAccess, type PairingStatus } from '../core/pairingClient';
import { BackButton, headerStyle } from '../components/BackButton';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function statusText(status: PairingStatus): string {
  switch (status.phase) {
    case 'connecting':
      return 'Connecting to the server…';
    case 'waiting':
      return `Joining with the code ${formatCode(status.code)}…`;
    case 'granted':
      return `Joined as ${status.deviceId}`;
    case 'error':
      return status.reason;
    default:
      return '';
  }
}

/**
 * Joins a my-claw server, the one screen a device without a credential sees.
 *
 * Two ways in (docs/web-pairing.md in the server repo). An invitation: a device that already uses
 * the server shows a QR and a code (Settings, Devices, Add a device; or `myclaw setup` on the
 * server), and this one scans or types it. A request, when nothing can be shown here: this device
 * shows a code and three digits, and one that uses the server approves them.
 */
export function PairingScreen({
  serverUrl,
  onUrlChange,
  pairing,
  onClose,
  unknownDevice = false,
}: {
  serverUrl: string;
  onUrlChange: (url: string) => void;
  pairing: PairingStatus;
  onClose: () => void;
  /** The server refused the credential this device holds: say so, it is why the screen is here. */
  unknownDevice?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [started, setStarted] = useState(false);
  useDismissKeyboard();

  useEffect(() => {
    // Leave the screen when the pairing lands: the chat socket is reconnecting already.
    if (pairing.phase === 'granted' || pairing.phase === 'error') setStarted(false);
  }, [pairing.phase]);

  const hasServer = isValidServerUrl(serverUrl);
  const validCode = /^[A-Z0-9]{8}$/.test(code.trim().toUpperCase().replace(/[\s-]/g, ''));
  const submit = useCallback(() => {
    if (validCode && hasServer && !started) {
      setStarted(true);
      startPairing(serverUrl, code);
    }
  }, [code, serverUrl, started, hasServer, validCode]);

  const busy = pairing.phase === 'connecting' || pairing.phase === 'waiting';
  const asking = pairing.phase === 'asking' ? pairing : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={onClose} label="Back to settings" />
        <Text style={styles.title}>Join a server</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {unknownDevice ? (
          <Text style={[styles.status, styles.error]} accessibilityLabel="Device unknown to the server">
            This server does not know this device (any more). Join it again below.
          </Text>
        ) : null}

        {asking ? (
          <View style={styles.askCard}>
            <Text style={styles.cardTitle}>Waiting for approval</Text>
            <Text style={styles.hint}>
              On a device that already uses this my-claw, open Settings, Devices, Approve a request, and type this code:
            </Text>
            <Text style={styles.bigCode} selectable accessibilityLabel="Request code">
              {formatCode(asking.code)}
            </Text>
            <Text style={styles.hint}>It must show the same three digits:</Text>
            <Text style={styles.digits} accessibilityLabel="Verification digits">
              {asking.verification}
            </Text>
            <View style={styles.waitingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {asking.seen ? 'a device is looking at your request…' : 'waiting for a device to look it up…'}
              </Text>
            </View>
            <Pressable onPress={() => cancelPairing()} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel the request">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>With an invitation</Text>
              <Text style={styles.hint}>
                Ask someone who uses this my-claw to open Settings, Devices, Add a device. Then scan the QR it shows.
              </Text>
              <Text style={styles.hint}>On the server itself, `myclaw setup` prints one too.</Text>
            </View>

            {scanning ? (
              <PairScanner
                onCode={(scanned, server) => {
                  setScanning(false);
                  setCode(scanned);
                  setStarted(true);
                  // The QR names the server: it wins over whatever the field held.
                  if (server) onUrlChange(server);
                  startPairing(server ?? serverUrl, scanned);
                }}
                onClose={() => setScanning(false)}
              />
            ) : scannerSupported ? (
              <Pressable
                style={styles.button}
                onPress={() => setScanning(true)}
                accessibilityRole="button"
                accessibilityLabel="Scan a pairing code">
                <Text style={styles.buttonText}>Scan the QR</Text>
              </Pressable>
            ) : null}

            <Text style={styles.orLabel}>or type it</Text>
            <View style={styles.serverCard}>
              <Text style={styles.cardTitle}>Server address</Text>
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={onUrlChange}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://myclaw.example.com"
                placeholderTextColor={styles.placeholder.color}
                accessibilityLabel="Server address"
              />
            </View>
            <Text style={styles.cardTitle}>Invitation code</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="XXXX-XXXX"
                placeholderTextColor={styles.placeholder.color}
                accessibilityLabel="Pairing code"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                onSubmitEditing={submit}
                returnKeyType="go"
              />
              <Pressable
                style={[styles.button, styles.approve, (busy || !validCode || !hasServer) && styles.busy]}
                onPress={submit}
                disabled={busy || !validCode || !hasServer}
                accessibilityRole="button"
                accessibilityLabel="Submit this pairing code">
                {busy ? <ActivityIndicator size="small" /> : <Text style={styles.buttonText}>Join</Text>}
              </Pressable>
            </View>

            {busy || pairing.phase === 'error' || pairing.phase === 'granted' ? (
              <Text style={[styles.status, pairing.phase === 'error' && styles.error]} accessibilityLiveRegion="polite">
                {statusText(pairing)}
              </Text>
            ) : null}

            {started ? (
              <Pressable
                onPress={() => {
                  setStarted(false);
                  cancelPairing();
                }}
                style={styles.cancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel pairing">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            ) : null}

            <View style={styles.askSection}>
              <Text style={styles.cardTitle}>No invitation?</Text>
              <Text style={styles.hint}>
                Ask for access: this phone shows a code, and someone who uses this my-claw approves it from their device.
              </Text>
              <Pressable
                style={[styles.ghostButton, (busy || !hasServer) && styles.busy]}
                onPress={() => requestAccess(serverUrl)}
                disabled={busy || !hasServer}
                accessibilityRole="button"
                accessibilityLabel="Ask for access">
                <Text style={styles.ghostText}>Ask for access</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export function usePairing(): PairingStatus {
  const [pairing, setPairing] = useState<PairingStatus>(pairingStatus());
  useEffect(() => onPairingStatus(setPairing), []);
  return pairing;
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: headerStyle(palette),
  title: { color: palette.text, fontSize: font.title, fontWeight: '600' as const },
  body: { paddingVertical: space.md, gap: space.sm },
  card: { marginBottom: space.xs },
  serverCard: { gap: space.xs, marginBottom: space.sm },
  placeholder: { color: palette.textFaint },
  cardTitle: { color: palette.text, fontSize: font.body, fontWeight: '600' as const, marginBottom: space.xs },
  hint: { color: palette.textFaint, fontSize: font.small, marginTop: space.xxs, lineHeight: 16 },
  orLabel: { color: palette.textFaint, fontSize: font.small, marginVertical: space.sm, textAlign: 'center' as const },
  row: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'center' as const },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, color: palette.text },
  codeInput: { flex: 1, letterSpacing: 2 },
  button: { minHeight: 48, justifyContent: 'center' as const, backgroundColor: palette.accent, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, alignItems: 'center' as const },
  buttonText: { color: palette.accentText, fontWeight: '600' as const },
  approve: { minWidth: 88 },
  busy: { opacity: 0.6 },
  status: { color: palette.textFaint, fontSize: font.small, marginTop: space.sm },
  error: { color: palette.danger },
  cancel: { minHeight: 44, justifyContent: 'center' as const, marginTop: space.sm, alignSelf: 'center' as const, paddingHorizontal: space.md },
  cancelText: { color: palette.textFaint, fontSize: font.small },
  askCard: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  askSection: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: palette.border, gap: space.xs },
  bigCode: { color: palette.text, fontSize: 30, fontWeight: '700' as const, letterSpacing: 3, textAlign: 'center' as const, fontFamily: 'monospace' },
  digits: { color: palette.accent, fontSize: 34, fontWeight: '700' as const, textAlign: 'center' as const },
  waitingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: space.sm },
  ghostButton: { minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, marginTop: space.xs },
  ghostText: { color: palette.text, fontWeight: '600' as const },
});
