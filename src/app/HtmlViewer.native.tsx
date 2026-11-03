import { CloseIcon } from '../components/icons';
/**
 * The Android host for a web page: a WebView with JavaScript off.
 *
 * The owner asked for a preview, not a way to run a document (2026-09-23). Two fences, on
 * purpose: `javaScriptEnabled={false}` here, and the `default-src 'none'` the server sends with
 * the page -- so a `<script>` in the file runs neither in this view nor in anything else that
 * opens the same URL. A page's own images and fonts are remote and stay blocked for the same
 * reason: a preview must not reach the network.
 *
 * `originWhitelist` is `['*']` because the document's own origin is the server's, and a redirect
 * inside it should not blank the view; nothing is loaded but that one URL.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { DownloadControl } from '../components/DownloadControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

export function HtmlViewer({
  url,
  filename,
  embedded = false,
  onToggleFullscreen,
  onClose,
}: {
  url: string;
  filename: string;
  /** Drawn inside the right-hand pane instead of over the window. See ViewerChrome. */
  embedded?: boolean;
  onToggleFullscreen?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  return (
    <ViewerStage embedded={embedded} insetTop style={styles.stage}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
        <Text style={styles.note}>no scripts</Text>
        <DownloadControl targets={[{ url, filename }]} />
        {onToggleFullscreen ? <FullscreenToggle embedded={embedded} onPress={onToggleFullscreen} /> : null}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close file view"
        >
          <CloseIcon size={18} tone="text" />
        </Pressable>
      </View>

      <View style={styles.body}>
        <WebView
          source={{ uri: url }}
          javaScriptEnabled={false}
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          onLoadEnd={() => setStatus(current => (current === 'error' ? current : 'ready'))}
          onError={() => setStatus('error')}
          style={styles.web}
        />
        {status === 'loading' ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color="#888" />
          </View>
        ) : null}
        {status === 'error' ? (
          <View style={styles.overlay}>
            <Text style={styles.error}>could not open this page</Text>
          </View>
        ) : null}
      </View>
    </ViewerStage>
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
  note: { fontSize: font.small, color: palette.textFaint },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 14, lineHeight: 16, color: palette.text },
  body: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#ffffff' },
  overlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.lg,
  },
  error: { textAlign: 'center' as const, fontSize: font.meta, color: palette.textFaint },
});
