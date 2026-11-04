import { CloseIcon } from '../components/icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '../core/utils';
import { DownloadControl } from '../components/DownloadControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * What an archive holds, without unpacking it.
 *
 * The server lists the entries out of the ZIP's own directory (`utils/archive.ts`) and this draws
 * them: a phone has no unzipper, and downloading an archive to a phone to find out what is inside
 * it is the wrong first step. The file itself is untouched, so Download still hands over the
 * archive.
 */
type ArchiveEntry = { name: string; size: number };

export function ArchiveViewer({
  url,
  filename,
  rawUrl,
  embedded = false,
  onToggleFullscreen,
  onClose,
}: {
  /** The listing URL (`?view=list`). */
  url: string;
  filename: string;
  /** The file itself, so Download hands over the archive and not its entry list. */
  rawUrl?: string;
  /** Drawn inside the right-hand pane instead of over the window. See ViewerChrome. */
  embedded?: boolean;
  onToggleFullscreen?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { entries?: ArchiveEntry[] };
      })
      .then(payload => {
        if (cancelled) return;
        setEntries(payload.entries ?? []);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'cannot read');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const total = entries?.reduce((sum, entry) => sum + entry.size, 0) ?? 0;

  return (
    <ViewerStage embedded={embedded} insetTop style={styles.stage}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {filename}
        </Text>
        {entries ? (
          <Text style={styles.count}>
            {entries.length} entr{entries.length > 1 ? 'ies' : 'y'}
          </Text>
        ) : null}
        <DownloadControl targets={[{ url: rawUrl ?? url, filename }]} />
        {onToggleFullscreen ? <FullscreenToggle embedded={embedded} onPress={onToggleFullscreen} /> : null}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close file view"
        >
          <CloseIcon size={18} tone="faint" />
        </Pressable>
      </View>

      {entries ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {entries.map((entry, index) => (
            <View key={`${entry.name}-${index}`} style={styles.row}>
              <Text style={styles.name} numberOfLines={2}>
                {entry.name}
              </Text>
              {entry.size > 0 ? <Text style={styles.size}>{formatBytes(entry.size)}</Text> : null}
            </View>
          ))}
          {entries.length === 0 ? <Text style={styles.empty}>this archive holds no entry</Text> : null}
          {total > 0 ? <Text style={styles.total}>{formatBytes(total)} uncompressed</Text> : null}
        </ScrollView>
      ) : (
        <View style={styles.body}>
          {error ? (
            <Text style={styles.empty}>could not read this archive ({error})</Text>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color="#888" />
            </View>
          )}
        </View>
      )}
    </ViewerStage>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: palette.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  title: { flex: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  count: { fontSize: font.small, color: palette.textFaint },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  body: { flex: 1, backgroundColor: palette.bg },
  bodyContent: { padding: space.md, paddingBottom: space.xl },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  name: { flex: 1, fontSize: font.meta, color: palette.text, fontFamily: 'monospace' },
  size: { fontSize: font.small, color: palette.textFaint },
  empty: { textAlign: 'center' as const, fontSize: font.meta, color: palette.textFaint, padding: space.lg },
  total: { marginTop: space.md, fontSize: font.small, color: palette.textFaint, textAlign: 'center' as const },
  loading: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
});
