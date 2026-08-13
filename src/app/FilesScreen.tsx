import React, { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import type { SessionFileMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { formatBytes, formatDate, viewerFor } from '../core/utils';
import { TrashIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { FileViewer } from './FileViewer';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

const TYPE_LABEL: Record<SessionFileMeta['type'], string> = {
  image: 'IMG',
  audio: 'AUD',
  video: 'VID',
  file: 'FILE',
};

function mediaUrl(
  mediaBase: string,
  deviceInfo: DeviceInfo | null,
  id: string,
): string {
  return deviceInfo
    ? `${mediaBase}/media/${id}?device=${deviceInfo.deviceId}&token=${deviceInfo.token}`
    : '';
}

const keyOfFile = (item: SessionFileMeta): string => item.id;

/** One attachment. Memoized, and the callbacks take the file rather than closing over it. */
const FileRow = React.memo(function FileRowView({
  item,
  uri,
  danger,
  onOpen,
  onDelete,
}: {
  item: SessionFileMeta;
  /** Pre-built so the row does not need the media base or the device token. */
  uri: string;
  danger: string;
  onOpen: (item: SessionFileMeta) => void;
  onDelete: (item: SessionFileMeta) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowMain}
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open file ${item.filename}`}>
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel={item.filename} />
        ) : (
          <View style={[styles.thumb, styles.thumbLabel]}>
            <Text style={styles.thumbLabelText}>{TYPE_LABEL[item.type]}</Text>
          </View>
        )}
        <View style={styles.rowMainText}>
          <Text style={styles.filename} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={styles.meta}>
            {formatBytes(item.sizeBytes)} · {formatDate(item.ts)}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => onDelete(item)}
        hitSlop={10}
        style={styles.delete}
        accessibilityRole="button"
        accessibilityLabel={`Delete file ${item.filename}`}>
        <TrashIcon size={17} color={danger} />
      </Pressable>
    </View>
  );
});

export function FilesScreen({
  mediaBase,
  deviceInfo,
  files,
  totalBytes,
  onBack,
  onDelete,
  onOpenImage,
  onOpenText,
  onOpenVideo,
  error,
}: {
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  files: SessionFileMeta[];
  totalBytes: number;
  onBack: () => void;
  /** Asks for the delete; the shell confirms before anything leaves. */
  onDelete: (file: SessionFileMeta) => void;
  onOpenImage: (file: { url: string; filename: string; sizeBytes?: number }) => void;
  onOpenText: (file: { url: string; filename: string }) => void;
  onOpenVideo: (file: { url: string; filename: string }) => void;
  /** Server-side refusal for this screen. Without it a failed delete just looks inert. */
  error?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // reached from the chat header, where the composer's keyboard is usually up.
  useDismissKeyboard();
  const { palette } = useTheme();
  const [viewer, setViewer] = useState<SessionFileMeta | null>(null);
  const { scrollProps, indicator } = useScrollIndicator();

  const openFile = useCallback(
    (item: SessionFileMeta) => {
      const target = {
        url: mediaUrl(mediaBase, deviceInfo, item.id),
        filename: item.filename,
        sizeBytes: item.sizeBytes,
      };
      const kind = viewerFor(item.type, item.filename);
      if (kind === 'image') onOpenImage(target);
      else if (kind === 'text') onOpenText(target);
      else if (kind === 'video') onOpenVideo(target);
      else setViewer(item);
    },
    [deviceInfo, mediaBase, onOpenImage, onOpenText, onOpenVideo],
  );

  const renderFile = useCallback(
    ({ item }: { item: SessionFileMeta }) => (
      <FileRow
        item={item}
        uri={item.type === 'image' ? mediaUrl(mediaBase, deviceInfo, item.id) : ''}
        danger={palette.danger}
        onOpen={openFile}
        onDelete={onDelete}
      />
    ),
    [deviceInfo, mediaBase, onDelete, openFile, palette.danger],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to chat"
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Session files</Text>
          <Text style={styles.subtitle}>
            {files.length} file{files.length === 1 ? '' : 's'} ·{' '}
            {formatBytes(totalBytes)}
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Files error ${error}`}>
          {error}
        </Text>
      ) : null}

      <View style={styles.listArea}>
        <FlatList
          {...scrollProps}
          style={styles.list}
          data={files}
          keyExtractor={keyOfFile}
          contentContainerStyle={
            files.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListEmptyComponent={
            <Text style={styles.empty}>no files in this conversation</Text>
          }
          renderItem={renderFile}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={9}
        />
        {indicator}
      </View>

      {viewer ? (
        <FileViewer
          filename={viewer.filename}
          url={mediaUrl(mediaBase, deviceInfo, viewer.id)}
          sizeBytes={viewer.sizeBytes}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </View>
  );
}

function createStyles(palette: Palette) {
  return {
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
    title: {
      fontSize: font.title,
      fontWeight: '600' as const,
      color: palette.text,
    },
    subtitle: { fontSize: font.small, color: palette.textFaint },
    listArea: { flex: 1 },
    list: {},
    listContent: { paddingTop: space.sm },
    emptyContent: { flexGrow: 1, justifyContent: 'center' as const },
    empty: {
      textAlign: 'center' as const,
      fontSize: font.meta,
      color: palette.textFaint,
      padding: space.md,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.md,
      paddingVertical: space.md,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      backgroundColor: palette.surfaceAlt,
    },
    thumbLabel: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    thumbLabelText: {
      fontSize: font.small,
      color: palette.textFaint,
      fontWeight: '700' as const,
    },
    error: {
      marginHorizontal: space.md,
      marginBottom: space.sm,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceAlt,
      color: palette.danger,
      fontSize: font.small,
    },
    rowMain: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.md,
    },
    rowMainText: { flex: 1, gap: 1 },
    filename: { fontSize: font.body, color: palette.text },
    meta: { fontSize: font.small, color: palette.textFaint },
    delete: { padding: space.sm },
  };
}
