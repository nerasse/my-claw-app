import { ChevronIcon, PlusIcon } from '../components/icons';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { TagInfo } from '../core/protocol';
import { font, radius, space, type Palette, useTheme, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';

/**
 * The tag catalog (docs/tags.md on the server): named aliases for a model/effort/context combo,
 * usable anywhere a model id is expected. The virtual Default tag rows first and cannot be
 * edited (it always tracks the current default model); every other row opens the tag editor.
 */
export function TagsScreen({
  tags,
  status,
  error,
  onBack,
  onNewTag,
  onEditTag,
  onDeleteTag,
  onOpenContextCap,
}: {
  tags: TagInfo[] | null;
  status: 'unknown' | 'ready' | 'unsupported';
  error: string | null;
  onBack: () => void;
  onNewTag: () => void;
  onEditTag: (name: string) => void;
  onDeleteTag: (name: string) => void;
  onOpenContextCap?: (name: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  useDismissKeyboard();
  const isDefault = (tag: TagInfo): boolean => tag.name === 'Default';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to models">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tags</Text>
          <Text style={styles.subtitle}>
            {tags ? `${tags.length} tag${tags.length === 1 ? '' : 's'} · usable anywhere a model is expected` : 'loading…'}
          </Text>
        </View>
        <Pressable
          onPress={onNewTag}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="New tag">
          <PlusIcon size={18} color={palette.accentText} />
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Tags error ${error}`}>
          {error}
        </Text>
      ) : null}

      {status === 'unsupported' ? (
        <Text style={styles.error}>this server predates tags — update the server</Text>
      ) : null}

      {tags ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {tags.map(tag => !isDefault(tag) && tag.route === undefined ? (
            <View key={tag.name} style={styles.card}>
              <Pressable
                style={[styles.row, styles.link]}
                onPress={() => { if (!isDefault(tag)) onEditTag(tag.name); }}
                disabled={isDefault(tag)}
                accessibilityRole="button"
                accessibilityLabel={`Open tag ${tag.name}`}>
                <View style={styles.linkMain}>
                  <View style={styles.linkTitleLine}><Text style={styles.linkTitle}>{tag.name}</Text>{tag.effort ? <Text style={styles.badge}>{tag.effort}</Text> : null}</View>
                  <Text style={styles.hint} numberOfLines={1}>{isDefault(tag) ? `follows the default model · ${tag.model ?? ''}` : `${tag.model ?? ''}`}</Text>
                </View>
                {isDefault(tag) ? null : <ChevronIcon direction="right" size={16} tone="faint" />}
              </Pressable>
              {isDefault(tag) ? null : <>
                <View style={styles.divider} />
                <View style={styles.footer}>
                  <Pressable style={styles.footerLink} onPress={() => onOpenContextCap?.(tag.name)} accessibilityRole="button" accessibilityLabel={`Context cap for tag ${tag.name}`}>
                    <Text style={styles.footerKey}>context cap</Text><Text style={styles.footerValue}>{tag.contextCap === undefined ? 'agent/global setting' : `${tag.contextCap} tokens`}</Text><ChevronIcon direction="right" size={16} tone="faint" />
                  </Pressable>
                  <Pressable style={styles.deleteLink} onPress={() => onDeleteTag(tag.name)} accessibilityRole="button" accessibilityLabel={`Delete tag ${tag.name}`}><Text style={styles.deleteText}>delete</Text></Pressable>
                </View>
              </>}
            </View>
          ) : (
            <Pressable
              key={tag.name}
              style={styles.nameRow}
              onPress={() => { if (!isDefault(tag)) onEditTag(tag.name); }}
              disabled={isDefault(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Open tag ${tag.name}`}>
              <Text style={styles.name}>{tag.name}</Text>
              {isDefault(tag) ? <Text style={styles.defaultHint}>default</Text> : <ChevronIcon direction="right" size={16} tone="faint" />}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  body: { padding: space.md, gap: space.xs, paddingBottom: space.xl },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  name: { flex: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  defaultHint: { fontSize: font.small, color: palette.textFaint },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  linkMain: { flex: 1, gap: 2 },
  linkTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  linkTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  hint: { fontSize: font.small, color: palette.textMuted },
  divider: { height: 1, backgroundColor: palette.border },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: palette.surfaceAlt,
  },
  footerLink: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  footerKey: { fontSize: font.small, color: palette.textMuted, minWidth: 84 },
  footerValue: { flex: 1, fontSize: font.small, color: palette.text },
  deleteLink: { paddingHorizontal: space.sm, paddingVertical: 4 },
  deleteText: { fontSize: font.small, color: palette.danger },
  error: { padding: space.md, color: palette.danger },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
});
