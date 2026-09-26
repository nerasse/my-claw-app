/**
 * The web host for a PDF: the browser already has a renderer, so this is an `iframe` on the media
 * URL and nothing else. Bundling pdf.js for the web build would be a second copy of a megabyte and
 * a half to draw what Chrome draws better.
 *
 * Same contract as the Android host: the file's name, a close cross, and the reader filling what
 * is left. The server serves a PDF inline, so the iframe gets a document rather than a download.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DownloadControl } from '../components/DownloadControl';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** CSS on purpose: an `iframe` is a DOM element, not a React Native view. */
const IFRAME_STYLE = { flex: 1, width: '100%', border: 'none' } as const;

export function PdfViewer({
  url,
  filename,
  onClose,
}: {
  url: string;
  filename: string;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const insets = useSafeAreaInsets();

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { top: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
        <DownloadControl targets={[{ url, filename }]} />
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close file view"
        >
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        <iframe src={url} title={filename} style={IFRAME_STYLE} />
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: palette.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  title: { flex: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 14, lineHeight: 16, color: palette.text },
  body: { flex: 1, backgroundColor: '#202124' },
});
