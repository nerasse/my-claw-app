import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { splitSkillDoc } from '../core/skills';
import type { SkillEntry } from '../core/protocol';
import { DocumentMarkdown } from '../components/DocumentMarkdown';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * Full-screen reader for one skill's SKILL.md: frontmatter stripped into a meta header, the
 * body rendered as markdown. Same layer trick as the text viewer, no Modal, and the hardware
 * back quits through the shell's own back handling.
 */
export function SkillViewer({
  url,
  skill,
  onClose,
}: {
  url: string;
  skill: SkillEntry;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // nothing to type into: the keyboard would cover the document.
  useDismissKeyboard();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { scrollProps, indicator } = useScrollIndicator();
  const [doc, setDoc] = useState<ReturnType<typeof splitSkillDoc> | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        if (!cancelled) {
          setDoc(splitSkillDoc(text));
          setFetchError(null);
        }
      })
      .catch(err => {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : 'cannot fetch');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const metaName = doc?.meta.name ?? skill.name;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { top: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close skill view"
        >
          <Text style={styles.closeGlyph}>‹</Text>
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {metaName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {skill.source}
            {skill.version ? ` · v${skill.version}` : ''}
          </Text>
        </View>
      </View>

      {doc ? (
        <View style={styles.body}>
          <ScrollView
            {...scrollProps}
            style={styles.scroll}
            contentContainerStyle={styles.bodyContent}
          >
            {doc.meta.description ? (
              <Text style={styles.lede}>{doc.meta.description}</Text>
            ) : null}
            <DocumentMarkdown value={doc.body} />
          </ScrollView>
          {indicator}
        </View>
      ) : (
        <View style={styles.body}>
          {fetchError ? (
            <Text style={styles.error}>could not fetch skill ({fetchError})</Text>
          ) : (
            <ActivityIndicator color={palette.textFaint} />
          )}
        </View>
      )}
    </View>
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
  close: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  titleBlock: { flex: 1, gap: 1 },
  title: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  body: { flex: 1, backgroundColor: palette.bg },
  scroll: { flex: 1 },
  bodyContent: { padding: space.md, paddingBottom: space.xl },
  lede: {
    fontSize: font.body,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
    marginBottom: space.md,
  },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textFaint,
    padding: space.lg,
  },
});
