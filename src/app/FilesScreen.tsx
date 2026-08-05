import React from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import type { SessionFileMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { formatBytes, formatDate } from '../core/utils';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

const TYPE_LABEL: Record<SessionFileMeta['type'], string> = {
  image: 'IMG',
  audio: 'AUD',
  video: 'VID',
  file: 'FILE',
};

export function FilesScreen({
  mediaBase,
  deviceInfo,
  files,
  totalBytes,
  onBack,
  onDelete,
}: {
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  files: SessionFileMeta[];
  totalBytes: number;
  onBack: () => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to chat">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Session files</Text>
          <Text style={styles.subtitle}>
            {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
          </Text>
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={files}
        keyExtractor={item => item.id}
        contentContainerStyle={files.length === 0 ? styles.emptyContent : styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>no files in this conversation</Text>}
        renderItem={({ item }) => {
          const uri =
            item.type === 'image' && deviceInfo
              ? `${mediaBase}/media/${item.id}?device=${deviceInfo.deviceId}&token=${deviceInfo.token}`
              : '';
          return (
            <View style={styles.row}>
              {uri ? (
                <Image source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel={item.filename} />
              ) : (
                <View style={[styles.thumb, styles.thumbLabel]}>
                  <Text style={styles.thumbLabelText}>{TYPE_LABEL[item.type]}</Text>
                </View>
              )}
              <View style={styles.rowMain}>
                <Text style={styles.filename} numberOfLines={1}>
                  {item.filename}
                </Text>
                <Text style={styles.meta}>
                  {formatBytes(item.sizeBytes)} · {formatDate(item.ts)}
                </Text>
              </View>
              <Pressable
                onPress={() => onDelete(item.id)}
                hitSlop={10}
                style={styles.delete}
                accessibilityRole="button"
                accessibilityLabel={`Delete file ${item.filename}`}>
                <Text style={styles.deleteGlyph}>🗑</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  headerText: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  list: { flex: 1 },
  listContent: { paddingTop: space.sm },
  emptyContent: { flexGrow: 1, justifyContent: 'center' as const },
  empty: { textAlign: 'center' as const, fontSize: font.meta, color: palette.textFaint },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
  thumbLabel: { alignItems: 'center' as const, justifyContent: 'center' as const },
  thumbLabelText: { fontSize: font.micro, color: palette.textFaint, fontWeight: '700' as const },
  rowMain: { flex: 1, gap: 1 },
  filename: { fontSize: font.body, color: palette.text },
  meta: { fontSize: font.small, color: palette.textFaint },
  delete: { padding: space.sm },
  deleteGlyph: { fontSize: 15, lineHeight: 18 },
});
