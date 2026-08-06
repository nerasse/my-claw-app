import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { AttachmentMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { viewerFor } from '../core/utils';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export function AttachmentView({
  att,
  mediaBase,
  deviceInfo,
  onOpen,
}: {
  att: AttachmentMeta;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /** Routed to the same full-screen viewers as the file explorer. */
  onOpen?: (kind: 'image' | 'text', target: { url: string; filename: string }) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const remote = deviceInfo
    ? `${mediaBase}/media/${att.id}?device=${deviceInfo.deviceId}&token=${deviceInfo.token}`
    : '';
  const uri = att.uri ?? remote;
  const name = att.filename ?? att.type;
  const kind = att.deleted ? null : viewerFor(att.type, att.filename);
  // A local preview has no server copy yet, so the viewer would have nothing to fetch.
  const open =
    onOpen && kind && remote
      ? () => onOpen(kind, { url: remote, filename: name })
      : undefined;

  if (att.type === 'image' && uri) {
    const image = (
      <>
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={name}
        />
        <Text style={styles.caption} numberOfLines={1}>
          {name}
        </Text>
      </>
    );
    if (!open) return <View style={styles.imageWrap}>{image}</View>;
    return (
      <Pressable
        style={styles.imageWrap}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Open attachment ${name}`}>
        {image}
      </Pressable>
    );
  }

  const label = att.deleted ? `${name} (deleted)` : name;
  if (!open) {
    return (
      <View style={[styles.chip, att.deleted ? styles.chipGone : null]}>
        <Text style={styles.chipText}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={styles.chip}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Open attachment ${name}`}>
      <Text style={styles.chipText}>{label}</Text>
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
  caption: { fontSize: font.micro, color: palette.textFaint, maxWidth: 190, marginTop: 1 },
  chip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginBottom: space.xs,
  },
  chipGone: { opacity: 0.6 },
  chipText: { fontSize: font.small, color: palette.text },
});
