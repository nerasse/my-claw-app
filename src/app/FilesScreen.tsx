import React, { useEffect, useState } from 'react';
import { FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { deviceBridge } from '../core/nativeBridge';
import type { SessionFileMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { formatBytes, formatDate, viewerFor } from '../core/utils';
import {
  font,
  radius,
  space,
  useThemedStyles,
  type Palette,
} from '../theme';

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

export function FilesScreen({
  mediaBase,
  deviceInfo,
  files,
  totalBytes,
  onBack,
  onDelete,
  onOpenImage,
  onOpenText,
  error,
}: {
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  files: SessionFileMeta[];
  totalBytes: number;
  onBack: () => void;
  /** Asks for the delete; the shell confirms before anything leaves. */
  onDelete: (file: SessionFileMeta) => void;
  onOpenImage: (file: { url: string; filename: string }) => void;
  onOpenText: (file: { url: string; filename: string }) => void;
  /** Server-side refusal for this screen. Without it a failed delete just looks inert. */
  error?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [viewer, setViewer] = useState<SessionFileMeta | null>(null);

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

      <FlatList
        style={styles.list}
        data={files}
        keyExtractor={item => item.id}
        contentContainerStyle={
          files.length === 0 ? styles.emptyContent : styles.listContent
        }
        ListEmptyComponent={
          <Text style={styles.empty}>no files in this conversation</Text>
        }
        renderItem={({ item }) => {
          const uri =
            item.type === 'image'
              ? mediaUrl(mediaBase, deviceInfo, item.id)
              : '';
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => {
                  const target = {
                    url: mediaUrl(mediaBase, deviceInfo, item.id),
                    filename: item.filename,
                  };
                  const kind = viewerFor(item.type, item.filename);
                  if (kind === 'image') onOpenImage(target);
                  else if (kind === 'text') onOpenText(target);
                  else setViewer(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open file ${item.filename}`}
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={styles.thumb}
                    resizeMode="cover"
                    accessibilityLabel={item.filename}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbLabel]}>
                    <Text style={styles.thumbLabelText}>
                      {TYPE_LABEL[item.type]}
                    </Text>
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
                accessibilityLabel={`Delete file ${item.filename}`}
              >
                <Text style={styles.deleteGlyph}>🗑</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {viewer ? (
        <FileViewer
          file={viewer}
          url={mediaUrl(mediaBase, deviceInfo, viewer.id)}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Images open full screen with a one-tap save to the gallery; text and markdown render their
 * content and can be downloaded; everything else offers a download. The media URL carries the
 * auth token, so fetching and saving run through the native bridge instead of the JS heap.
 */
function FileViewer({
  file,
  url,
  onClose,
}: {
  file: SessionFileMeta;
  url: string;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const save = () => {
    if (!url) return;
    setSaving(true);
    deviceBridge
      .saveFile(url, file.filename)
      .then(path => {
        if (path) setSavedTo('saved');
      })
      .catch(() => setSavedTo('save failed'))
      .finally(() => setSaving(false));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {file.filename}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close file view"
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.imageStage}>
            <Text style={styles.empty}>no preview for this file type</Text>
          </View>

          <View style={styles.modalActions}>
            {savedTo ? (
              <Text style={styles.saveFeedback}>{savedTo}</Text>
            ) : null}
            <Pressable
              style={[styles.button, saving && styles.buttonOff]}
              onPress={save}
              disabled={saving || !url}
              accessibilityRole="button"
              accessibilityLabel="Save file to downloads"
            >
              <Text style={styles.buttonText}>
                {saving ? 'saving…' : 'Download'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
    list: { flex: 1 },
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
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    thumb: {
      width: 44,
      height: 44,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceAlt,
    },
    thumbLabel: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    thumbLabelText: {
      fontSize: font.micro,
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
    deleteGlyph: { fontSize: 15, lineHeight: 18 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center' as const,
      padding: space.md,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderRadius: radius.md,
      padding: space.md,
      maxHeight: '88%' as const,
    },
    modalHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.md,
      paddingBottom: space.sm,
    },
    modalTitle: {
      flex: 1,
      fontSize: font.body,
      fontWeight: '600' as const,
      color: palette.text,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceAlt,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    closeGlyph: { fontSize: 14, color: palette.text },
    imageStage: {
      height: 320,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: palette.bg,
      borderRadius: radius.sm,
    },
    fullImage: { width: '100%' as const, height: '100%' as const },
    modalActions: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      alignItems: 'center' as const,
      gap: space.md,
      paddingTop: space.md,
    },
    saveFeedback: { color: palette.textFaint, fontSize: font.small, marginRight: 'auto' as const },
    button: {
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      borderRadius: radius.sm,
      backgroundColor: palette.accent,
    },
    buttonOff: { opacity: 0.5 },
    buttonText: {
      color: '#fff',
      fontSize: font.body,
      fontWeight: '600' as const,
    },
  };
}
