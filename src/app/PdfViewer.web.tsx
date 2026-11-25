import { CloseIcon } from '../components/icons';
/**
 * The web host for a PDF: the browser already has a renderer, so this is an `iframe` on the media
 * URL and nothing else. Bundling pdf.js for the web build would be a second copy of a megabyte and
 * a half to draw what Chrome draws better.
 *
 * Same contract as the Android host: the file's name, a close cross, and the reader filling what
 * is left. The server serves a PDF inline, so the iframe gets a document rather than a download.
 *
 * A pane that stays dark is the failure this host has to name rather than draw: an iframe given an
 * HTML page instead of a document (a session that expired under the reader and answered with a
 * login page, a proxy in front of the agent) renders a blank stage with nothing to read and no way
 * to tell it from a PDF that failed to paint. One `HEAD` on the same URL says which it is -- the
 * plugin's own document is not readable from here, the response's `Content-Type` is.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DownloadControl } from '../components/DownloadControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** CSS on purpose: an `iframe` is a DOM element, not a React Native view. */
const IFRAME_STYLE = { flex: 1, width: '100%', border: 'none' } as const;

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
  /**
   * What the URL answered, when it was not a document.
   *
   * Asked with `HEAD` because the bytes are the plugin's business: this only reads the declared
   * type, and a server that refuses `HEAD` (or a network that fails) leaves the pane as it was --
   * silence is right there, since the plugin may well be drawing the file from its own cache.
   */
  const [notADocument, setNotADocument] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setNotADocument(null);
    fetch(url, { method: 'HEAD' })
      .then(response => {
        if (!live) return;
        const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        if (response.ok && type && !type.includes('pdf')) setNotADocument(type);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <ViewerStage embedded={embedded} insetTop style={styles.stage}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
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
        <iframe src={url} title={filename} style={IFRAME_STYLE} />
        {notADocument ? (
          <View style={styles.notice} pointerEvents="none">
            <Text style={styles.noticeTitle}>This is not a document</Text>
            <Text style={styles.noticeBody}>
              {`The address answered ${notADocument} instead of the PDF. A session that expired under the reader, or a proxy in front of the agent, answers with a page. Reload the conversation and open it again.`}
            </Text>
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
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  body: { flex: 1, backgroundColor: '#202124' },
  notice: {
    position: 'absolute' as const,
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  noticeTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  noticeBody: { fontSize: font.meta, color: palette.textMuted },
});
