import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-marked';
import { deviceBridge } from '../core/nativeBridge';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * Full-screen text viewer for .md and .txt session files: the content owns the screen, the
 * top bar holds the name and the close cross, and the hardware back quits it like the image
 * viewer. Same layer trick as ImageViewer — no Modal, so it covers the shell's padded
 * container while staying in the app's window.
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
  const { palette } = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const isMarkdown = filename.toLowerCase().endsWith('.md');

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        if (!cancelled) {
          setContent(text);
          setContentError(null);
        }
      })
      .catch(err => {
        if (!cancelled) setContentError(err instanceof Error ? err.message : 'cannot fetch');
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
      .downloadFile(url, filename, false)
      .then(() => setSavedTo('saved to Downloads'))
      .catch(() => setSavedTo('save failed'))
      .finally(() => setSaving(false));
  };

  return (
    <View style={StyleSheet.absoluteFill}>
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
        <ScrollView style={styles.stage} contentContainerStyle={styles.stageContent}>
          {isMarkdown ? (
            <Markdown
              value={content}
              styles={{
                text: { color: palette.text, fontSize: font.body, lineHeight: 22 },
                link: { color: palette.accent },
                h1: { color: palette.text, fontSize: font.screen },
                h2: { color: palette.text, fontSize: font.title },
                h3: { color: palette.text, fontSize: font.body },
                blockquote: {
                  borderLeftColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                },
                codespan: { color: palette.accent, backgroundColor: palette.surfaceAlt },
                code: { backgroundColor: palette.surfaceAlt },
              }}
            />
          ) : (
            <Text style={styles.plainText} selectable>
              {content}
            </Text>
          )}
        </ScrollView>
      ) : (
        <View style={styles.stage}>
          {contentError ? (
            <Text style={styles.error}>could not fetch content ({contentError})</Text>
          ) : (
            <ActivityIndicator color={palette.textFaint} />
          )}
        </View>
      )}

      <View style={styles.bottomBar}>
        {savedTo ? <Text style={styles.saved}>{savedTo}</Text> : <View style={styles.spacer} />}
        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.save, saving && styles.saveOff]}
          accessibilityRole="button"
          accessibilityLabel="Save file to downloads"
        >
          <Text style={styles.saveText}>{saving ? 'saving…' : 'Download'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
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
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 15, lineHeight: 18, color: palette.text },
  stage: { flex: 1, backgroundColor: palette.bg },
  stageContent: { padding: space.md, paddingBottom: 80 },
  plainText: {
    color: palette.text,
    fontSize: font.body,
    fontFamily: 'monospace',
    lineHeight: 22,
  },
  error: { textAlign: 'center' as const, fontSize: font.meta, color: palette.textFaint, padding: space.lg },
  bottomBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.md,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  spacer: { flex: 1 },
  saved: { flex: 1, fontSize: font.small, color: palette.textFaint },
  save: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  saveOff: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: font.body, fontWeight: '600' as const },
});
