import React, { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The pairing QR scanner.
 *
 * The QR the web page shows encodes the claim URL, not the credential, so what this reads is
 * only ever a code the server still has to recognise. Anything else scanned here is ignored
 * rather than sent: the approval path is the one place where a wrong value costs an account.
 */

/** `https://host/pair#K7QW3M2P` or the bare code, which is what a human might type into a QR. */
export function codeFromScan(raw: string): string | null {
  const value = raw.trim();
  const fragment = value.includes('#') ? value.slice(value.lastIndexOf('#') + 1) : value;
  const cleaned = fragment.trim().toUpperCase().replace(/[\s-]/g, '');
  return /^[0-9A-Z]{8}$/.test(cleaned) ? cleaned : null;
}

export function PairScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const [rejected, setRejected] = useState(false);
  // A camera fires the same barcode many times a second; the first one wins and the rest are
  // dropped, or the owner gets a dozen lookups for one scan.
  const handled = useRef(false);

  const onScan = useCallback(
    ({ data }: { data: string }) => {
      if (handled.current) return;
      const code = codeFromScan(data);
      if (!code) {
        setRejected(true);
        return;
      }
      handled.current = true;
      onCode(code);
    },
    [onCode],
  );

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <Text style={styles.message}>
          {permission.canAskAgain
            ? 'The scanner needs the camera. Nothing is recorded: the frame is read for a code and dropped.'
            : 'Camera access is off for this app. Enable it in the system settings, or type the code instead.'}
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the scanner">
            <Text style={styles.buttonText}>Close</Text>
          </Pressable>
          {permission.canAskAgain ? (
            <Pressable
              style={[styles.button, styles.primary]}
              onPress={() => {
                requestPermission().catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel="Allow the camera"
            >
              <Text style={styles.buttonText}>Allow</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.frame}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
      </View>
      <Text style={styles.hint}>
        {rejected ? 'that code is not a pairing code' : 'point the camera at the code on the browser'}
      </Text>
      <Pressable style={styles.button} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the scanner">
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { gap: space.sm },
  frame: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: palette.surfaceAlt,
  },
  camera: { flex: 1 },
  hint: { fontSize: font.small, color: palette.textMuted, textAlign: 'center' as const },
  message: { fontSize: font.small, color: palette.textMuted },
  actions: { flexDirection: 'row' as const, gap: space.sm },
  button: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  primary: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  buttonText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
});
