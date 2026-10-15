/**
 * The Android host for a PDF: a WebView running the bundled pdf.js page
 * (`assets/pdfviewer/index.html`, built by `scripts/build-pdfviewer.js`).
 *
 * The page does the fetching, which is why it is loaded from the app's assets and not handed the
 * bytes: pdf.js asks for the document itself, and Range requests are answered by the server
 * (docs/file-preview.md). The host's only job is to name the URL, and to say what the page says
 * back -- loading, the page count, or the reason it could not draw.
 *
 * iOS is not a target of this app, so the asset URI is the Android one and nothing branches.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { DownloadControl } from '../components/DownloadControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** Where the Gradle `copyPdfviewerAssets` task puts the page (android/app/build.gradle). */
const PDF_URI = 'file:///android_asset/pdfviewer/index.html';

type HostMessage = { type: 'ready' | 'progress' | 'done' | 'error'; pages?: number; page?: number; detail?: string };

export function PdfViewer({
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
  const [pages, setPages] = useState(0);
  const [drawn, setDrawn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // `JSON.stringify` and not a template: the URL carries the device's token, and a query string
  // is exactly where a raw interpolation would break the script.
  const open = useMemo(() => `window.__openPdf(${JSON.stringify(url)}); true;`, [url]);

  const onMessage = (event: WebViewMessageEvent): void => {
    let message: HostMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as HostMessage;
    } catch {
      return;
    }
    if (message.type === 'ready') {
      setPages(message.pages ?? 0);
      setStatus('ready');
    } else if (message.type === 'progress') {
      setDrawn(message.page ?? 0);
    } else if (message.type === 'done') {
      setStatus('ready');
    } else if (message.type === 'error') {
      setError(message.detail ?? 'cannot draw');
      setStatus('error');
    }
  };

  return (
    <ViewerStage embedded={embedded} insetTop style={styles.stage}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
        {pages > 0 ? (
          <Text style={styles.count}>
            {drawn > 0 && drawn < pages ? `${drawn}/${pages}` : `${pages} page${pages > 1 ? 's' : ''}`}
          </Text>
        ) : null}
        <DownloadControl targets={[{ url, filename }]} />
        {onToggleFullscreen ? <FullscreenToggle embedded={embedded} onPress={onToggleFullscreen} /> : null}
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
        <WebView
          source={{ uri: PDF_URI }}
          originWhitelist={['*']}
          injectedJavaScript={open}
          onMessage={onMessage}
          onError={() => {
            setError('the reader failed to load');
            setStatus('error');
          }}
          style={styles.web}
        />
        {status === 'loading' ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color="#888" />
          </View>
        ) : null}
        {status === 'error' ? (
          <View style={styles.overlay}>
            <Text style={styles.error}>could not draw this file ({error})</Text>
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
  count: { fontSize: font.small, color: palette.textFaint },
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
  web: { flex: 1, backgroundColor: '#202124' },
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
  error: { textAlign: 'center' as const, fontSize: font.meta, color: '#9aa0a6' },
});
