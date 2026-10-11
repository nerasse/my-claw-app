import React from 'react';
import { Text, View } from 'react-native';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * The scanner is Android only, and this file is why the web build never pulls expo-camera in.
 *
 * A browser pairing another browser has no reason to involve a camera: the page it is looking at
 * already shows the code, and the two windows are on the same screen.
 */

export function codeFromScan(raw: string): string | null {
  const value = raw.trim();
  const fragment = value.includes('#') ? value.slice(value.lastIndexOf('#') + 1) : value;
  const cleaned = fragment.trim().toUpperCase().replace(/[\s-]/g, '');
  return /^[0-9A-Z]{8}$/.test(cleaned) ? cleaned : null;
}

export function PairScanner({ onClose: _onClose }: {
  onCode: (code: string, server: string | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <Text style={styles.message}>Scanning is done from the phone app. Type the code here.</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { paddingVertical: space.sm },
  message: { fontSize: font.small, color: palette.textMuted },
});
