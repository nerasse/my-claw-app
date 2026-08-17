import { mediaUrl } from '../core/mediaUrl';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { AttachmentMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { viewerFor } from '../core/utils';
import { VoiceNote } from './VoiceNote';
import { PlayPauseIcon } from './icons';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export function AttachmentView({
  att,
  mediaBase,
  deviceInfo,
  onOpen,
  transcript,
  onAccent,
}: {
  att: AttachmentMeta;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /** Routed to the same full-screen viewers as the file explorer. */
  onOpen?: (
    kind: 'image' | 'text' | 'video' | 'file',
    target: { url: string; filename: string; sizeBytes?: number },
  ) => void;
  /** What the server heard, shown under its own recording. */
  transcript?: string;
  /** Sitting on an accent-filled bubble: the page colours have no contrast there. */
  onAccent?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const remote = mediaUrl(mediaBase, deviceInfo, att.id);
  const uri = att.uri ?? remote;
  // The server generates a preview frame for videos; without one the stage would stay black
  // until play. The thumbnail request is per-id, cached server-side after the first fetch.
  const thumbUri =
    att.type === 'video' && remote
      ? mediaUrl(mediaBase, deviceInfo, att.id, { thumb: '1' })
      : undefined;
  const name = att.filename ?? att.type;
  // Everything reachable opens something: previews where there is one, a download card else.
  // A deleted attachment has nothing left to open.
  const kind = att.deleted ? null : (viewerFor(att.type, att.filename) ?? 'file');
  // A local preview has no server copy yet, so the viewer would have nothing to fetch.
  const open =
    onOpen && kind && remote
      ? () => onOpen(kind, { url: remote, filename: name, sizeBytes: att.sizeBytes })
      : undefined;

  // A voice note plays where it sits. Falling through to the chip would have named a file the
  // sender already knows about and given no way to hear it back.
  if (att.type === 'audio' && uri && !att.deleted) {
    return <VoiceNote att={att} uri={uri} transcript={transcript} onAccent={onAccent} />;
  }

  if ((att.type === 'image' || att.type === 'video') && uri) {
    const media = (
      <>
        <View style={[styles.image, att.type === 'video' ? styles.videoStage : null]}>
          {att.type === 'image' ? (
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={name}
            />
          ) : (
            <>
              {thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.image}
                  resizeMode="cover"
                  accessibilityLabel={name}
                />
              ) : null}
              <View style={styles.play}>
                <PlayPauseIcon playing={false} size={44} color="#fff" />
              </View>
            </>
          )}
        </View>
        <Text style={[styles.caption, onAccent && styles.captionOnAccent]} numberOfLines={1}>
          {name}
        </Text>
      </>
    );
    if (!open) return <View style={styles.imageWrap}>{media}</View>;
    return (
      <Pressable
        style={styles.imageWrap}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Open attachment ${name}`}>
        {media}
      </Pressable>
    );
  }

  const label = att.deleted ? `${name} (deleted)` : name;
  if (!open) {
    return (
      <View style={[styles.chip, onAccent && styles.chipOnAccent, att.deleted ? styles.chipGone : null]}>
        <Text style={[styles.chipText, onAccent && styles.chipTextOnAccent]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={[styles.chip, onAccent && styles.chipOnAccent]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Open attachment ${name}`}>
      <Text style={[styles.chipText, onAccent && styles.chipTextOnAccent]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  imageWrap: { marginBottom: space.xs },
  image: {
    width: 190,
    height: 190,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  videoStage: {
    backgroundColor: '#000',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  play: {
    position: 'absolute' as const,
    top: '50%' as const,
    left: '50%' as const,
    transform: [{ translateX: -28 }, { translateY: -28 }],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  caption: { fontSize: font.small, color: palette.textFaint, maxWidth: 190, marginTop: 2 },
  captionOnAccent: { color: palette.onAccentMuted },
  chip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    marginBottom: space.sm,
  },
  chipGone: { opacity: 0.6 },
  chipOnAccent: { backgroundColor: palette.onAccentTrack },
  chipText: { fontSize: font.body, fontWeight: '500' as const, color: palette.text },
  chipTextOnAccent: { color: palette.accentText },
});
