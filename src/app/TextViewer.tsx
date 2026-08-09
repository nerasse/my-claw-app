import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deviceBridge, useTransferProgress } from '../core/nativeBridge';
import { formatBytes } from '../core/utils';
import { DocumentMarkdown } from '../components/DocumentMarkdown';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * Full-screen text viewer for .md and .txt session files. Same layer trick as the image
 * viewer — no Modal — but it stays inside the safe area: the phone's status bar keeps its
 * icons, the top bar carries the name and the close cross, and the hardware back quits.
 * Download opens the system "Save as" dialog so the user picks the destination.
 */
export function TextViewer({
  url,
  filename,
  onClose,
}: {
  url: string;
  filename: string;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // opened from a bubble, with the composer's keyboard still up behind it.
  useDismissKeyboard();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  /** Announced size from the response headers, so a big file shows what it is loading. */
  const [contentSize, setContentSize] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const saveId = `text-save-${filename}`;
  const saveProgress = useTransferProgress(saveId);

  const isMarkdown = filename.toLowerCase().endsWith('.md');

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

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const save = () => {
    setSaving(true);
    deviceBridge
      .saveFile(url, filename, saveId)
      .then(path => {
        if (path) setSavedTo('saved');
      })
      .catch(() => setSavedTo('save failed'))
      .finally(() => setSaving(false));
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.stage, { top: insets.top }]}
    >
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
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
          {isMarkdown ? (
            <DocumentMarkdown value={content} />
          ) : (
            <Text style={styles.plainText} selectable>
              {content}
            </Text>
          )}
        </ScrollView>
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

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: space.sm + Math.max(insets.bottom - space.sm, 0) },
        ]}
      >
        {savedTo ? <Text style={styles.saved}>{savedTo}</Text> : saveProgress && saveProgress.total > 0 ? (
          <Text style={styles.saved}>
            {formatBytes(saveProgress.bytes)} of {formatBytes(saveProgress.total)}
          </Text>
        ) : null}
        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.button, saving && styles.buttonOff]}
          accessibilityRole="button"
          accessibilityLabel="Save file to downloads"
        >
          <Text style={styles.buttonText}>{saving ? 'saving…' : 'Download'}</Text>
        </Pressable>
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
  closeGlyph: { fontSize: 14, lineHeight: 16, color: palette.text },
  body: { flex: 1, backgroundColor: palette.bg },
  bodyContent: { padding: space.md, paddingBottom: space.xl },
  plainText: {
    color: palette.text,
    fontSize: font.body,
    fontFamily: 'monospace',
    lineHeight: 22,
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
