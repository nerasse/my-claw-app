import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { DownloadControl } from '../components/DownloadControl';
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
        <DownloadControl targets={[{ url, filename }]} gallery tone="light" />
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
