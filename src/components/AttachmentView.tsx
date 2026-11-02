import { mediaUrl } from '../core/mediaUrl';
import { recordDiag } from '../core/diagnostics';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { AttachmentMeta } from '../core/protocol';
import type { FileKind } from '../core/fileKind';
import type { DeviceInfo } from '../core/device';
import { viewerFor, type ViewerKind } from '../core/utils';
import { DownloadControl } from './DownloadControl';
import { VoiceNote } from './VoiceNote';
import { mediaHeight, useMediaRatio } from './MediaCarousel';
import { PlayPauseIcon } from './icons';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

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
    kind: ViewerKind,
    target: { url: string; filename: string; sizeBytes?: number; kind?: FileKind },
  ) => void;
  /** What the server heard, shown under its own recording. */
  transcript?: string;
  /** Sitting on an accent-filled bubble: the page colours have no contrast there. */
  onAccent?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [failed, setFailed] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);
  const remote = mediaUrl(mediaBase, deviceInfo, att.id);
  const uri = att.uri ?? remote;
  // Only pictures have a shape worth measuring; asking for a voice note's header would be a
  // request for nothing.
  const ratio = useMediaRatio(att.type === 'image' || att.type === 'video' ? uri : undefined);
  // The server generates a preview frame for videos; without one the stage would stay black
  // until play. The thumbnail request is per-id, cached server-side after the first fetch.
  const thumbUri =
    att.type === 'video' && remote
      ? mediaUrl(mediaBase, deviceInfo, att.id, { thumb: '1' })
      : undefined;
  const name = att.filename ?? att.type;
  // Everything reachable opens something: previews where there is one, a download card else.
  // A deleted attachment has nothing left to open.
  const kind = att.deleted ? null : (viewerFor(att.type, att.filename, att.kind) ?? 'file');
  // A local preview has no server copy yet, so the viewer would have nothing to fetch.
  const open =
    onOpen && kind && remote
      ? () => onOpen(kind, { url: remote, filename: name, sizeBytes: att.sizeBytes, kind: att.kind })
      : undefined;

  // A voice note plays where it sits. Falling through to the chip would have named a file the
  // sender already knows about and given no way to hear it back.
  if (att.type === 'audio' && uri && !att.deleted) {
    return (
      <VoiceNote
        att={att}
        uri={uri}
        transcript={transcript}
        onAccent={onAccent}
        download={remote ? { url: remote, filename: att.filename ?? `${att.id}.m4a` } : undefined}
      />
    );
  }

  // Why the picture is not on screen, when it never arrives: the id and the screen it was asked
  // of, never the query -- it carries the device's token. A 404 here reads as a resolution miss
  // server-side, and reading it off a device beat guessing at one (2026-09-15).
  const reportFailed = () => {
    setFailed(true);
    recordDiag({
      kind: 'js',
      at: Date.now(),
      message: 'attachment image failed to load',
      stack: `id=${att.id} type=${att.type} filename=${att.filename ?? att.type} base=${mediaBase}`,
    });
  };

  // An attachment with nothing to draw reads as a chip, never as a stage: one the server marked
  // deleted has no bytes anywhere, and one whose bytes never came is the same fact from the
  // reader's side. Drawn as an image it was an empty box under a bare filename -- which reads as
  // a picture still loading, and hid a server-side resolution miss for a day.
  if ((att.type === 'image' || att.type === 'video') && uri && !att.deleted && !failed) {
    // The picture's own shape, not a square: a wide browser capture drawn `contain` in a 190x190
    // box was 190x77 inside it, and the two thirds of empty height are what ate the thread
    // (owner, 2026-09-17). Full width, height from the ratio, clamped at both ends.
    const media = (
      <>
        <View
          style={[styles.stage, att.type === 'video' ? styles.videoStage : null, { height: mediaHeight(stageWidth, ratio) }]}
          onLayout={event => setStageWidth(event.nativeEvent.layout.width)}
        >
          {att.type === 'image' ? (
            <Image
              source={{ uri }}
              style={styles.media}
              resizeMode="contain"
              accessibilityLabel={name}
              onError={reportFailed}
            />
          ) : (
            <>
              {thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.media}
                  resizeMode="cover"
                  accessibilityLabel={name}
                  onError={reportFailed}
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
  // The chip opens on a tap and downloads on the arrow beside it: one control, the same sheet as
  // every other surface, without a second tap to reach the file (2026-09-26).
  return (
    <View style={[styles.chip, onAccent && styles.chipOnAccent]}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Open attachment ${name}`}>
        <Text style={[styles.chipText, onAccent && styles.chipTextOnAccent]}>{label}</Text>
      </Pressable>
      {remote ? (
        <DownloadControl
          targets={[{ url: remote, filename: name }]}
          variant="row"
          tone={onAccent ? 'light' : 'default'}
        />
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  imageWrap: { marginBottom: space.xs },
  stage: {
    width: '100%' as const,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  media: { width: '100%' as const, height: '100%' as const },
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
  caption: { fontSize: scaleFont(font.small, scale), color: palette.textFaint, marginTop: 2 },
  captionOnAccent: { color: palette.textMuted },
  chip: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.md,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: 4,
    marginBottom: space.sm,
  },
  chipGone: { opacity: 0.6 },
  chipOnAccent: { backgroundColor: palette.surfaceRaised },
  chipText: { fontSize: scaleFont(font.body, scale), fontWeight: '500' as const, color: palette.text },
  chipTextOnAccent: { color: palette.bubbleUserText },
});
