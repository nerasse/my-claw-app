import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Markdown from 'react-native-marked';
import { deviceBridge } from '../core/nativeBridge';
import type { SessionFileMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import { formatBytes, formatDate } from '../core/utils';
import {
  font,
  radius,
  space,
  useTheme,
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
}: {
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  files: SessionFileMeta[];
  totalBytes: number;
  onBack: () => void;
  onDelete: (id: string) => void;
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
            <Pressable
              style={styles.row}
              onPress={() => setViewer(item)}
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
                accessibilityLabel={`Delete file ${item.filename}`}
              >
                <Text style={styles.deleteGlyph}>🗑</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />

      {viewer ? (
        <FileViewer
          file={viewer}
          url={mediaUrl(mediaBase, deviceInfo, viewer.id)}
          deviceInfo={deviceInfo}
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
  deviceInfo,
  onClose,
}: {
  file: SessionFileMeta;
  url: string;
  deviceInfo: DeviceInfo | null;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const isText =
    file.filename.toLowerCase().endsWith('.md') ||
    file.filename.toLowerCase().endsWith('.txt');
  const isMarkdown = file.filename.toLowerCase().endsWith('.md');
  const isImage = file.type === 'image';

  useEffect(() => {
    if (!isText || !url) return;
    let cancelled = false;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        if (!cancelled) {
          setContent(text);
          setContentError(null);
        }
      })
      .catch(err => {
        if (!cancelled)
          setContentError(err instanceof Error ? err.message : 'cannot fetch');
      });
    return () => {
      cancelled = true;
    };
  }, [isText, url]);

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const save = (toGallery: boolean) => {
    if (!url) return;
    setSaving(true);
    deviceBridge
      .downloadFile(url, file.filename, toGallery)
      .then(() =>
        setSavedTo(toGallery ? 'saved to the gallery' : 'saved to Downloads'),
      )
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

          {isImage ? (
            <View style={styles.imageStage}>
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          ) : isText && content !== null ? (
            <ScrollView
              style={styles.textStage}
              contentContainerStyle={styles.textStageContent}
            >
              {isMarkdown ? (
                <Markdown
                  value={content}
                  styles={{
                    text: {
                      color: palette.text,
                      fontSize: font.body,
                      lineHeight: 22,
                    },
                    link: { color: palette.accent },
                    h1: { color: palette.text, fontSize: font.screen },
                    h2: { color: palette.text, fontSize: font.title },
                    h3: { color: palette.text, fontSize: font.body },
                    blockquote: {
                      borderLeftColor: palette.border,
                      backgroundColor: palette.surfaceAlt,
                    },
                    codespan: {
                      color: palette.accent,
                      backgroundColor: palette.surfaceAlt,
                    },
                    code: { backgroundColor: palette.surfaceAlt },
                  }}
                />
              ) : (
                <Text style={styles.plainText} selectable>
                  {content}
                </Text>
              )}
            </ScrollView>
          ) : isText && content === null ? (
            <View style={styles.imageStage}>
              {contentError ? (
                <Text style={styles.empty}>
                  could not fetch content ({contentError})
                </Text>
              ) : (
                <ActivityIndicator color={palette.textFaint} />
              )}
            </View>
          ) : (
            <View style={styles.imageStage}>
              <Text style={styles.empty}>no preview for this file type</Text>
            </View>
          )}

          <View style={styles.modalActions}>
            {savedTo ? (
              <Text style={styles.saveFeedback}>{savedTo}</Text>
            ) : null}
            <Pressable
              style={[styles.button, saving && styles.buttonOff]}
              onPress={() => save(isImage && Boolean(deviceInfo))}
              disabled={saving || !url}
              accessibilityRole="button"
              accessibilityLabel={
                isImage ? 'Save image to gallery' : 'Save file to downloads'
              }
            >
              <Text style={styles.buttonText}>
                {saving ? 'saving…' : isImage ? 'Save to gallery' : 'Download'}
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
    rowMain: { flex: 1, gap: 1 },
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
    textStage: {
      maxHeight: 360,
      backgroundColor: palette.bg,
      borderRadius: radius.sm,
    },
    textStageContent: { padding: space.md },
    plainText: {
      color: palette.text,
      fontSize: font.body,
      fontFamily: 'monospace',
      lineHeight: 22,
    },
    modalActions: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      alignItems: 'center' as const,
      gap: space.md,
      paddingTop: space.md,
    },
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
    saveFeedback: {
      color: palette.textFaint,
      fontSize: font.small,
      marginRight: 'auto' as const,
    },
  };
}
