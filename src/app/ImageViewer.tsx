import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageZoom } from '@likashefqet/react-native-image-zoom';
import { deviceBridge } from '../core/nativeBridge';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

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
  onClose,
}: {
  url: string;
  filename: string;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // The shell insets its top edge, so the layer has to climb back over the status bar for
  // the photo to really own the screen; the bars then keep clear of it on their own.
  const insets = useSafeAreaInsets();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

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

  const save = useCallback(() => {
    if (!url) return;
    setSaving(true);
    deviceBridge
      .downloadFile(url, filename, true)
      .then(() => setSavedTo('saved to the gallery'))
      .catch(() => setSavedTo('save failed'))
      .finally(() => setSaving(false));
  }, [filename, url]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { top: -insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ImageZoom
        uri={url}
        minScale={1}
        maxScale={6}
        doubleTapScale={3}
        isSingleTapEnabled
        isDoubleTapEnabled
        onSingleTap={() => setControlsVisible(visible => !visible)}
        style={styles.image}
        resizeMode="contain"
      />

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
              onPress={save}
              disabled={saving}
              style={[styles.save, saving && styles.saveOff]}
              accessibilityRole="button"
              accessibilityLabel="Save image to gallery"
            >
              <Text style={styles.saveText}>
                {saving ? 'saving…' : 'Save to gallery'}
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
