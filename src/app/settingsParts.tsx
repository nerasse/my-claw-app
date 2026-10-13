import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { BackButton, headerStyle } from '../components/BackButton';
import { CloseButton } from '../components/CloseButton';

/**
 * What the settings pages are made of: a header (Back, title, the cross), titled sections, cards,
 * and rows that open a page. One copy, so a page split off another reads like it.
 */
export function SettingsPageFrame({
  title,
  backLabel = 'Back to settings',
  onBack,
  children,
}: {
  title: string;
  backLabel?: string;
  onBack: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  // A page of controls never opens on a focused field: the keyboard would cover what it is for.
  useDismissKeyboard();
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label={backLabel} />
        <Text style={styles.title}>{title}</Text>
        <CloseButton />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const styles = useSettingsStyles();
  return (
    <View style={styles.categoryItem}>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** A row that opens another page: title, one line saying what is there, a chevron. */
export function LinkRow({
  title,
  hint,
  onPress,
  label,
}: {
  title: string;
  hint?: string;
  onPress: () => void;
  label?: string;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  return (
    <Pressable onPress={onPress} style={styles.link} accessibilityRole="button" accessibilityLabel={label ?? `Open ${title.toLowerCase()}`}>
      <View style={styles.linkMain}>
        <Text style={styles.linkTitle}>{title}</Text>
        {hint ? (
          <Text style={styles.hint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Text style={styles.linkGlyph}>›</Text>
    </Pressable>
  );
}

export function useSettingsStyles(): ReturnType<typeof createStyles> {
  return useThemedStyles(createStyles);
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: headerStyle(palette),
  title: { flex: 1, fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  body: { paddingBottom: space.xl },
  categoryItem: { marginTop: space.lg },
  section: {
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  segment: {
    flexDirection: 'row' as const,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: 2,
    gap: 2,
  },
  segmentItem: { flex: 1, alignItems: 'center' as const, paddingVertical: 10, borderRadius: radius.sm - 1 },
  segmentItemActive: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  segmentText: { fontSize: font.meta, color: palette.textMuted },
  segmentTextActive: { color: palette.text, fontWeight: '600' as const },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: 4,
  },
  switchLabel: { flex: 1 },
  switchTitle: { color: palette.text, fontSize: font.body, fontWeight: '600' as const },
  grow: { flex: 1, minWidth: 0 },
  // A server of the list: its name and address, and what a press does, on one row.
  serverRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  buttonNarrow: { flex: 0, paddingHorizontal: space.md },
  hint: { fontSize: font.small, color: palette.textFaint },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  row: { flexDirection: 'row' as const, gap: space.sm },
  button: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center' as const,
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: palette.accentText, fontSize: font.meta, fontWeight: '600' as const },
  buttonGhostText: { color: palette.text },
  kv: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.md },
  key: { width: 90, fontSize: font.meta, color: palette.textFaint },
  value: { flex: 1, fontSize: font.meta, color: palette.text },
  mono: { fontFamily: 'monospace', fontSize: font.small },
  toggle: { paddingVertical: 2, paddingHorizontal: space.xs },
  toggleText: {
    fontSize: font.small,
    color: palette.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  link: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 44,
  },
  linkMain: { flex: 1, gap: 2 },
  linkTitle: { color: palette.text, fontSize: font.body, fontWeight: '600' as const },
  linkGlyph: { fontSize: 22, color: palette.textFaint },
  separator: { height: 1, backgroundColor: palette.border },
});
