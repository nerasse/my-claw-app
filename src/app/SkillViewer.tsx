import { ChevronIcon } from '../components/icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { splitSkillDoc } from '../core/skills';
import type { SkillEntry } from '../core/protocol';
import { DocumentMarkdown } from '../components/DocumentMarkdown';
import { DocZoomControl } from '../components/DocZoomControl';
import { FullscreenToggle, ViewerStage } from '../components/ViewerChrome';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { useLayerFrame } from '../core/layout';

/**
 * Full-screen reader for one skill's SKILL.md: frontmatter stripped into a meta header, the
 * body rendered as markdown. Same layer trick as the text viewer, no Modal, and the hardware
 * back quits through the shell's own back handling.
 */
/** Where the skill lives, in the vocabulary of the tiers: what a transfer moves it out of. */
function locationOf(skill: SkillEntry): string {
  if (skill.source !== 'workspace') return skill.source;
  return `workspace · ${skill.workspace ?? 'default'}`;
}

export function SkillViewer({
  url,
  skill,
  embedded = false,
  onToggleFullscreen,
  onClose,
  onActions,
}: {
  url: string;
  skill: SkillEntry;
  /** Drawn inside the right-hand pane instead of over the window. See ViewerChrome. */
  embedded?: boolean;
  onToggleFullscreen?: () => void;
  onClose: () => void;
  /** Opens the transfer menu. Absent while the shell has no catalog to move the skill into. */
  onActions?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const layerFrame = useLayerFrame();
  // nothing to type into: the keyboard would cover the document.
  useDismissKeyboard();
  const { palette } = useTheme();
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
    <ViewerStage embedded={embedded} insetTop style={[styles.stage, embedded ? null : layerFrame]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close skill view"
        >
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {metaName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {locationOf(skill)}
            {skill.version ? ` · v${skill.version}` : ''}
          </Text>
        </View>
        <DocZoomControl />
        {onToggleFullscreen ? <FullscreenToggle embedded={embedded} onPress={onToggleFullscreen} /> : null}
        {onActions ? (
          <Pressable
            onPress={onActions}
            hitSlop={8}
            style={styles.actions}
            accessibilityRole="button"
            accessibilityLabel={`Actions for skill ${skill.name}`}
          >
            <Text style={styles.actionsGlyph}>···</Text>
          </Pressable>
        ) : null}
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
            {skill.overrides ? (
              <Text style={styles.shadow}>
                This copy overrides the {skill.overrides} skill of the same name.
              </Text>
            ) : null}
            {skill.overriddenIn && skill.overriddenIn.length > 0 ? (
              <Text style={styles.shadow}>
                Masked in {skill.overriddenIn.join(', ')}: a run there loads that
                workspace's copy instead.
              </Text>
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
  close: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actions: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionsGlyph: { fontSize: 20, lineHeight: 22, color: palette.text },
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
  shadow: {
    fontSize: font.small,
    color: palette.textFaint,
    marginBottom: space.md,
  },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textFaint,
    padding: space.lg,
  },
});
