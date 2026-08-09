import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { deviceBridge } from '../core/nativeBridge';
import { formatBytes } from '../core/utils';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * Download card for file types with no preview (audio, archives, binaries...). Shared by the
 * session file explorer and the chat bubbles, so both entry points offer the same download.
 * The media URL carries the auth token, so saving runs through the native bridge instead of
 * the JS heap. Absolute layer, like the image and text viewers: a React-Native Modal lives
 * outside the gesture root on Android and drops touches meant for it.
 */
export function FileViewer({
  filename,
  url,
  sizeBytes,
  onClose,
}: {
  filename: string;
  url: string;
  sizeBytes?: number;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const save = () => {
    if (!url) return;
    setSaving(true);
    deviceBridge
      .saveFile(url, filename)
      .then(path => {
        if (path) setSavedTo('saved');
      })
      .catch(() => setSavedTo('save failed'))
      .finally(() => setSaving(false));
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close file view"
      />
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {filename}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close file view"
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.imageStage}>
            <Text style={styles.empty}>no preview for this file type</Text>
            {sizeBytes ? (
              <Text style={styles.size}>{formatBytes(sizeBytes)}</Text>
            ) : null}
          </View>

          <View style={styles.modalActions}>
            {savedTo ? (
              <Text style={styles.saveFeedback}>{savedTo}</Text>
            ) : null}
            <Pressable
              style={[styles.button, saving && styles.buttonOff]}
              onPress={save}
              disabled={saving || !url}
              accessibilityRole="button"
              accessibilityLabel="Save file to downloads"
            >
              <Text style={styles.buttonText}>
                {saving ? 'saving…' : 'Download'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center' as const,
    padding: space.md,
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
    maxHeight: '88%' as const,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
  },
  modalTitle: {
    flex: 1,
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 14, color: palette.text },
  imageStage: {
    height: 240,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.bg,
    borderRadius: radius.sm,
  },
  empty: { fontSize: font.meta, color: palette.textFaint },
  size: { fontSize: font.small, color: palette.textFaint, marginTop: space.xs },
  modalActions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingTop: space.md,
  },
  saveFeedback: {
    color: palette.textFaint,
    fontSize: font.small,
    marginRight: 'auto' as const,
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
