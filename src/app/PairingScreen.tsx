import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PairScanner } from '../components/PairScanner';
import { scannerSupported } from '../core/platform';
import { isValidServerUrl } from '../core/serverUrl';
import { pairingStatus, startPairing, cancelPairing, onPairingStatus, type PairingStatus } from '../core/pairingClient';
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
      return `Waiting for the code ${formatCode(status.code)}…`;
    case 'granted':
      return `Paired as ${status.deviceId}`;
    case 'error':
      return status.reason;
    default:
      return '';
  }
}

/**
 * Pairs this device with a server-minted credential.
 *
 * The flow: `myclaw setup` (or `myclaw device add --kind app`) prints a code and a QR. The
 * owner scans it (or types it), the server hands this app the minted token, and the app
 * reconnects with it. No copy-paste of credentials, no manual config edit.
 */
export function PairingScreen({
  serverUrl,
  onUrlChange,
  pairing,
  onClose,
}: {
  serverUrl: string;
  onUrlChange: (url: string) => void;
  pairing: PairingStatus;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [started, setStarted] = useState(false);
  useDismissKeyboard();

  useEffect(() => {
    // Leave the screen when the pairing lands: the chat socket is reconnecting already.
    if (pairing.phase === 'granted') setStarted(false);
  }, [pairing.phase]);

  const hasServer = isValidServerUrl(serverUrl);
  const submit = useCallback(() => {
    if (code.trim().length > 0 && hasServer && !started) {
      setStarted(true);
      startPairing(serverUrl, code);
    }
  }, [code, serverUrl, started, hasServer]);

  const busy = pairing.phase === 'connecting' || pairing.phase === 'waiting';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={onClose} label="Back to settings" />
        <Text style={styles.title}>{hasServer ? 'Pair device' : 'Connect to your server'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{hasServer ? 'Pair this device' : 'Connect this app to your my-claw'}</Text>
          <Text style={styles.hint}>
            On the server, run: myclaw setup (the first device), or myclaw device add --kind app --name &quot;Phone&quot;
          </Text>
          <Text style={styles.hint}>
            {hasServer
              ? 'Then scan the QR it prints, or type the eight-character code.'
              : 'Then scan the QR it prints: it holds the server address and the code. Or type both below.'}
          </Text>
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
            accessibilityLabel="Scan a pairing code"
          >
            <Text style={styles.buttonText}>Scan the code</Text>
          </Pressable>
        ) : null}

        <Text style={styles.orLabel}>or type the code</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={setCode}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <Pressable
            style={[styles.button, styles.approve, busy && styles.busy]}
            onPress={submit}
            disabled={busy || code.trim().length === 0 || !hasServer}
            accessibilityRole="button"
            accessibilityLabel="Submit this pairing code"
          >
            {busy ? <ActivityIndicator size="small" /> : <Text style={styles.buttonText}>Pair</Text>}
          </Pressable>
        </View>

        {busy || pairing.phase === 'error' || pairing.phase === 'granted' ? (
          <Text style={[styles.status, pairing.phase === 'error' && styles.error]}>{statusText(pairing)}</Text>
        ) : null}

        {started && !busy ? (
          <Pressable onPress={() => { setStarted(false); cancelPairing(); }} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}

        {!started ? (
          <View style={styles.serverCard}>
            <Text style={styles.cardTitle}>Server</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={onUrlChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ws://server:8080/my-claw-app"
              placeholderTextColor="#888"
              accessibilityLabel="Server address"
            />
          </View>
        ) : null}
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
  serverCard: { marginTop: space.lg },
  cardTitle: { color: palette.text, fontSize: font.body, fontWeight: '600' as const, marginBottom: space.xs },
  hint: { color: palette.textFaint, fontSize: font.small, marginTop: space.xxs, lineHeight: 16 },
  orLabel: { color: palette.textFaint, fontSize: font.small, marginVertical: space.sm, textAlign: 'center' as const },
  row: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'center' as const },
  input: { flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, color: palette.text },
  codeInput: { letterSpacing: 2 },
  button: { backgroundColor: palette.accent, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, alignItems: 'center' as const },
  buttonText: { color: palette.accentText, fontWeight: '600' as const },
  approve: { minWidth: 88 },
  busy: { opacity: 0.6 },
  status: { color: palette.textFaint, fontSize: font.small, marginTop: space.sm },
  error: { color: palette.danger },
  cancel: { marginTop: space.sm, alignSelf: 'center' as const },
  cancelText: { color: palette.textFaint, fontSize: font.small },
});
