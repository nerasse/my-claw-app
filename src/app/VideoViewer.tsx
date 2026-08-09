import React, { useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { deviceBridge, useTransferProgress } from '../core/nativeBridge';
import { DownloadIcon } from '../components/icons';
import { formatBytes } from '../core/utils';
import { font, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * Full-screen video player. The video fills the screen on black, the phone's native controls
 * (play/pause, seek, volume) overlay it, and a top bar carries the name, a download and the
 * close cross. Same layer trick as the image viewer: an absolute child of the shell, never a
 * Modal, so touches keep hitting the gesture root.
 */
export function VideoViewer({
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
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(url, p => {
    p.play();
  });
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const downloadId = `video-download-${filename}`;
  const downloadProgress = useTransferProgress(downloadId);

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const save = () => {
    if (!url) return;
    setSaving(true);
    deviceBridge
      .downloadFile(url, filename, false, downloadId)
      .then(() => setSavedTo('saved to Downloads'))
      .catch(() => setSavedTo('download failed'))
      .finally(() => setSaving(false));
  };

  const busy = saving && downloadProgress && downloadProgress.total > 0;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
      />

      <View style={[styles.topBar, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
        {savedTo ? <Text style={styles.saved}>{savedTo}</Text> : null}
        {busy ? (
          <Text style={styles.saved}>
            {formatBytes(downloadProgress!.bytes)} of {formatBytes(downloadProgress!.total)}
          </Text>
        ) : null}
        <Pressable
          onPress={save}
          disabled={saving}
          hitSlop={8}
          style={[styles.iconButton, saving && styles.saveOff]}
          accessibilityRole="button"
          accessibilityLabel="Save video to downloads"
        >
          <DownloadIcon size={18} color="#fff" />
        </Pressable>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close video"
        >
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (_palette: Palette) => ({
  stage: { backgroundColor: '#000' },
  video: { width: '100%' as const, height: '100%' as const },
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
  saved: {
    color: '#cfd6e4',
    fontSize: font.small,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  saveOff: { opacity: 0.5 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 17, lineHeight: 20, color: '#fff' },
});
