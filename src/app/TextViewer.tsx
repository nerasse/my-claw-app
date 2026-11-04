import { CloseIcon } from '../components/icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { formatBytes } from '../core/utils';
import type { FileKind } from '../core/fileKind';
import { CopyButton } from '../components/CopyButton';
import { CsvTable } from '../components/CsvTable';
import { DownloadControl } from '../components/DownloadControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { CodeEditor } from '../components/CodeEditor';
import { DEFAULT_EDITOR_FONT_SIZE } from '../components/codeeditor/protocol';
import { languageForFile } from '../components/codeeditor/document';
import { DocumentMarkdown } from '../components/DocumentMarkdown';
import { DocZoomControl } from '../components/DocZoomControl';
import { useDocFontScale } from '../core/docZoom';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * Full-screen reader for everything made of text. Markdown is rendered, plain text is shown as it
 * is, and code -- any language the editor page knows -- opens in CodeMirror, read-only and
 * coloured. Same layer trick as the image viewer, no Modal, but it stays inside the safe area:
 * the phone's status bar keeps its icons, the top bar carries the name and the close cross, and
 * the hardware back quits. Download opens the system "Save as" dialog so the user picks the
 * destination.
 */
export function TextViewer({
  url,
  filename,
  kind,
  downloadUrl,
  embedded = false,
  onToggleFullscreen,
  onClose,
}: {
  url: string;
  filename: string;
  kind?: FileKind;
  /** What Download hands over, when `url` is a rendering of the file and not the file. */
  downloadUrl?: string;
  /** Drawn inside the right-hand pane instead of over the window. See ViewerChrome. */
  embedded?: boolean;
  /** Present on a window wide enough for both columns; absent hides the control. */
  onToggleFullscreen?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // opened from a bubble, with the composer's keyboard still up behind it.
  useDismissKeyboard();
  const { palette, dark } = useTheme();
  /** The reader's zoom, shared with the other readers: every kind drawn here follows it. */
  const scale = useDocFontScale();
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  /** Announced size from the response headers, so a big file shows what it is loading. */
  const [contentSize, setContentSize] = useState<number | null>(null);

  const isMarkdown = kind ? kind === 'markdown' : filename.toLowerCase().endsWith('.md');
  // A delimited file is read as a table: its columns are the point, and the code reader makes them
  // a wall of commas.
  const isTable = kind === 'csv';
  // The code reader is a WebView of its own: it scrolls itself, so it never goes inside the
  // ScrollView the prose needs.
  const isCode = kind === 'code' || kind === 'json' || kind === 'html';
  // Every kind this viewer draws is text -- markdown, plain text, code, a table, an office
  // document converted to it -- so the whole file is always one tap away (owner, 2026-10-28: a
  // `.sh` wants the same tile a README gets).
  const copyable = content !== null;

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const announced = res.headers.get('content-length');
        if (announced) setContentSize(Number(announced));
        return res.text();
      })
      .then(text => {
        if (!cancelled) {
          setContent(text);
          setContentError(null);
        }
      })
      .catch(err => {
        if (!cancelled)
          setContentError(err instanceof Error ? err.message : 'cannot fetch');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <ViewerStage embedded={embedded} insetTop style={styles.stage}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
        {filename ? <DocZoomControl /> : null}
        {copyable ? (
          <CopyButton value={content} variant="bar" accessibilityLabel="Copy the whole file" />
        ) : null}
        <DownloadControl targets={[{ url: downloadUrl ?? url, filename }]} />
        {onToggleFullscreen ? <FullscreenToggle embedded={embedded} onPress={onToggleFullscreen} /> : null}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close file view"
        >
          <CloseIcon size={18} tone="faint" />
        </Pressable>
      </View>

      {content !== null ? (
        isTable ? (
          <View style={styles.body}>
            <CsvTable value={content} scale={scale} />
          </View>
        ) : isCode ? (
          <View style={styles.body}>
            <CodeEditor
              value={content}
              language={languageForFile(filename)}
              readOnly
              dark={dark}
              fontSize={Math.round(DEFAULT_EDITOR_FONT_SIZE * scale)}
              onError={err => setContentError(err instanceof Error ? err.message : 'editor failed')}
            />
          </View>
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {isMarkdown ? (
              <DocumentMarkdown value={content} />
            ) : (
              <Text style={plainTextStyle(styles, scale)} selectable>
                {content}
              </Text>
            )}
          </ScrollView>
        )
      ) : (
        <View style={styles.body}>
          {contentError ? (
            <Text style={styles.error}>
              could not fetch content ({contentError})
            </Text>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.textFaint} />
              {contentSize ? (
                <Text style={styles.loadingText}>loading {formatBytes(contentSize)}…</Text>
              ) : null}
            </View>
          )}
        </View>
      )}

    </ViewerStage>
  );
}

const DOC_TEXT_SIZE = 14;
const DOC_TEXT_LINE = 22;

/**
 * The plain-text body, at the reader's zoom.
 *
 * A style function rather than a hook: the sheet's own styles are static, and the only value that
 * moves is the scale, which the caller already holds. Line height scales with the size or a
 * 200 % page is a pile of overlapping lines.
 */
function plainTextStyle(
  styles: ReturnType<typeof createStyles>,
  scale: number,
): TextStyle {
  return {
    ...styles.plainText,
    fontSize: Math.round(DOC_TEXT_SIZE * scale),
    lineHeight: Math.round(DOC_TEXT_LINE * scale),
  };
}

const createStyles = (palette: Palette) => ({
  // `flex` and `minHeight` are the whole of this viewer's frame: a child that grows past it
  // (a code reader left at its content height, a table of 900 rows) must scroll inside, never
  // push the pane and with it the rest of the window -- docs/file-preview.md.
  stage: { flex: 1, minHeight: 0, overflow: 'hidden' as const, backgroundColor: palette.bg },
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
  title: {
    flex: 1,
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  body: { flex: 1, minHeight: 0, backgroundColor: palette.bg },
  bodyContent: { padding: space.md, paddingBottom: space.xl },
  plainText: {
    color: palette.text,
    fontSize: DOC_TEXT_SIZE,
    fontFamily: 'monospace',
    lineHeight: DOC_TEXT_LINE,
  },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textFaint,
    padding: space.lg,
  },
  loading: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
  },
  loadingText: { fontSize: font.small, color: palette.textFaint },
  saved: {
    marginRight: 'auto' as const,
    fontSize: font.small,
    color: palette.textFaint,
  },
  button: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  buttonOff: { opacity: 0.5 },
  buttonText: {
    color: '#fff',
    fontSize: font.body,
    fontWeight: '600' as const,
  },
});
