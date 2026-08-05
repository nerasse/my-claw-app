import React from 'react';
import { Image, Text, View } from 'react-native';
import type { AttachmentMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export function AttachmentView({
  att,
  mediaBase,
  deviceInfo,
}: {
  att: AttachmentMeta;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const uri = att.uri ?? (deviceInfo ? `${mediaBase}/media/${att.id}?device=${deviceInfo.deviceId}&token=${deviceInfo.token}` : '');
  if (att.type === 'image' && uri) {
    return (
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={att.filename ?? 'image sent by the agent'}
      />
    );
  }
  const label = att.filename ?? `${att.type}${att.mimeType ? ` · ${att.mimeType}` : ''}`;
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  image: { width: 190, height: 190, borderRadius: radius.sm, marginBottom: space.xs, backgroundColor: palette.surfaceAlt },
  chip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginBottom: space.xs,
  },
  chipText: { fontSize: font.small, color: palette.text },
});
