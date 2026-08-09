import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageZoom } from '@likashefqet/react-native-image-zoom';
import { deviceBridge, useTransferProgress } from '../core/nativeBridge';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** Images at or above this size are downloaded to the cache with a progress overlay first. */
const CACHE_THRESHOLD = 2 * 1024 * 1024;

/**
 * Full-screen image viewer, gallery style: pinch to zoom, double-tap to toggle, and a tap
 * that pops the controls (name + close cross on top, save at the bottom).
 *
 * Deliberately not a Modal. On Android a Modal is its own window, which sits outside the
 * app's GestureHandlerRootView, and gestures there are simply never recognised: no zoom, no
 * tap, so the controls could not even be brought back once hidden. Rendered instead as an
 * absolute layer of the shell, above the padded container, so it covers the screen while
 * living inside the gesture root.
 */
export function ImageViewer({
  url,
  filename,
  sizeBytes,
  onClose,
}: {
  url: string;
  filename: string;
  /** Known size lets the viewer decide between direct display and a progress-bearing download. */
  sizeBytes?: number;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // opened from a bubble, with the composer's keyboard still up behind it.
  useDismissKeyboard();
  // An absolutely positioned child is laid out against the shell's outer box, so the layer
  // already spans the status bar: the photo owns the screen at top 0, and only the bars have
  // to keep clear of it. Offsetting the stage instead pushed them under the status bar.
  const insets = useSafeAreaInsets();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  // null = not cached yet (or not needed); a string = local copy to render.
  const [cacheUri, setCacheUri] = useState<string | null>(null);

  const needsCache = !!sizeBytes && sizeBytes >= CACHE_THRESHOLD;
  const cacheId = needsCache ? `image-cache-${filename}` : null;
  const cacheProgress = useTransferProgress(cacheId);
  const downloadId = `image-download-${filename}`;
  const downloadProgress = useTransferProgress(downloadId);
  const galleryId = `image-gallery-${filename}`;
  const galleryProgress = useTransferProgress(galleryId);

  useEffect(() => {
    if (!needsCache) return;
    let cancelled = false;
    deviceBridge
      .cacheFile(url, filename, cacheId!)
      .then(res => {
        if (!cancelled) setCacheUri(res.uri);
      })
      .catch(() => {
        // Fall back to the direct network fetch; the image just appears without progress.
        if (!cancelled) setCacheUri('');
      });
    return () => {
      cancelled = true;
    };
  }, [cacheId, filename, needsCache, url]);

  useEffect(() => {
    if (!controlsVisible) return;
    const timer = setTimeout(() => setControlsVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [controlsVisible]);

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const save = (toGallery: boolean) => {
    if (!url) return;
    setSaving(true);
    deviceBridge
      .downloadFile(url, filename, toGallery, toGallery ? galleryId : downloadId)
      .then(() => setSavedTo(toGallery ? 'saved to the gallery' : 'saved to Downloads'))
      .catch(() => setSavedTo('save failed'))
      .finally(() => setSaving(false));
  };

  const percent = cacheProgress && cacheProgress.total > 0
    ? Math.round((cacheProgress.bytes / cacheProgress.total) * 100)
    : null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {needsCache && cacheUri === null ? (
        <View style={styles.image}>
          {percent !== null ? (
            <View style={styles.cacheBox}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.cacheText}>loading {percent}%</Text>
            </View>
          ) : (
            <ActivityIndicator color="#fff" />
          )}
        </View>
      ) : (
        <ImageZoom
          uri={cacheUri ?? url}
          minScale={1}
          maxScale={6}
          doubleTapScale={3}
          isSingleTapEnabled
          isDoubleTapEnabled
          onSingleTap={() => setControlsVisible(visible => !visible)}
          style={styles.image}
          resizeMode="contain"
        />
      )}

      {controlsVisible ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + space.md }]}>
            <Text style={styles.title} numberOfLines={1}>
              {filename}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close image"
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom + space.md },
            ]}
          >
            {savedTo ? (
              <Text style={styles.saved}>{savedTo}</Text>
            ) : (
              <View style={styles.spacer} />
            )}
            <Pressable
              onPress={() => save(false)}
              disabled={saving}
              style={[styles.save, saving && styles.saveOff]}
              accessibilityRole="button"
              accessibilityLabel="Save image to downloads"
            >
              <Text style={styles.saveText}>
                {saving && downloadProgress && downloadProgress.total > 0
                  ? `${Math.round((downloadProgress.bytes / downloadProgress.total) * 100)}%`
                  : saving
                    ? 'saving…'
                    : 'Download'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => save(true)}
              disabled={saving}
              style={[styles.save, saving && styles.saveOff]}
              accessibilityRole="button"
              accessibilityLabel="Save image to gallery"
            >
              <Text style={styles.saveText}>
                {saving && galleryProgress && galleryProgress.total > 0
                  ? `${Math.round((galleryProgress.bytes / galleryProgress.total) * 100)}%`
                  : saving
                    ? 'saving…'
                    : 'Save to gallery'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: '#000' },
  image: { width: '100%' as const, height: '100%' as const },
  topBar: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: font.body,
    fontWeight: '600' as const,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 17, lineHeight: 20, color: '#fff' },
  cacheBox: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.md,
  },
  cacheText: { color: '#cfd6e4', fontSize: font.body },
  bottomBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  spacer: { flex: 1 },
  saved: { flex: 1, color: '#cfd6e4', fontSize: font.small },
  save: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  saveOff: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: font.body, fontWeight: '600' as const },
});
