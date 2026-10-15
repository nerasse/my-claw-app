/**
 * The web host for a web page: an `iframe` with an empty `sandbox`, which is the browser's own
 * "no scripts, no forms, no navigation" -- the same fence the Android host builds by hand.
 *
 * The server also sends `default-src 'none'` with the page, so a `<script>` in the file runs in
 * neither host, and a remote image or font never loads.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { DownloadControl } from '../components/DownloadControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** CSS on purpose: an `iframe` is a DOM element, not a React Native view. */
const IFRAME_STYLE = { flex: 1, width: '100%', border: 'none', background: '#ffffff' } as const;

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
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        <iframe src={url} title={filename} sandbox="" style={IFRAME_STYLE} />
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
});
