import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { DownloadControl } from '../components/DownloadControl';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * Full-screen reader for a drawing. The server serves an SVG inline (docs/file-preview.md) and
 * `react-native-svg` draws it natively, which is the one way to show it on a phone: the platform
 * image view renders nothing for an SVG, and a WebView would be a heavier door for the same
 * picture. Same layer trick as the other viewers, no Modal, inside the safe area.
 */
export function SvgViewer({
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
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        if (cancelled) return;
        // A drawing that carries no `<svg` is not one: drawing it would throw inside the native
        // view, and the download card is a better answer than a blank stage.
        if (!/<svg[\s>]/i.test(text)) {
          setContentError('not an SVG drawing');
          return;
        }
        setContent(text);
        setContentError(null);
      })
      .catch(err => {
        if (!cancelled) setContentError(err instanceof Error ? err.message : 'cannot fetch');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

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

      {content !== null ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <SvgXml xml={content} width="100%" />
        </ScrollView>
      ) : (
        <View style={styles.body}>
          {contentError ? (
            <Text style={styles.error}>could not draw this file ({contentError})</Text>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color="#888" />
            </View>
          )}
        </View>
      )}

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
  body: { flex: 1, backgroundColor: palette.bg },
  bodyContent: { padding: space.md, paddingBottom: space.xl, alignItems: 'center' as const },
  error: { textAlign: 'center' as const, fontSize: font.meta, color: palette.textFaint, padding: space.lg },
  loading: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  bottomBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  saved: { marginRight: 'auto' as const, fontSize: font.small, color: palette.textFaint },
  button: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  buttonOff: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: font.body, fontWeight: '600' as const },
});
