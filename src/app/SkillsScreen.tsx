import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { SkillEntry } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';

/** Display names of the three tiers, with the server-side location as the honest hint. */
const SOURCE_SECTIONS: Array<{ source: SkillEntry['source']; label: string; hint: string }> = [
  { source: 'built-in', label: 'Built-in', hint: '~/.my-claw/skills/.builtin · synced from the release, read-only' },
  { source: 'custom', label: 'Custom', hint: '~/.my-claw/skills' },
  { source: 'workspace', label: 'Workspace', hint: '<workspace>/skills' },
];

/** The skills of one tier, in catalog order, with a leading section header row. */
type Row = { kind: 'header'; source: SkillEntry['source'] } | { kind: 'skill'; skill: SkillEntry };

function buildRows(skills: SkillEntry[]): Row[] {
  const rows: Row[] = [];
  for (const section of SOURCE_SECTIONS) {
    const ofSource = skills.filter(skill => skill.source === section.source);
    if (ofSource.length === 0) continue;
    rows.push({ kind: 'header', source: section.source });
    for (const skill of ofSource) rows.push({ kind: 'skill', skill });
  }
  return rows;
}

export function SkillsScreen({
  skills,
  error,
  onBack,
  onOpenSkill,
}: {
  skills: SkillEntry[];
  /** Server refused the request: distinct from an empty catalog, which is itself a fact. */
  error?: string;
  onBack: () => void;
  onOpenSkill: (skill: SkillEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { scrollProps, indicator } = useScrollIndicator();
  const rows = buildRows(skills);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Skills</Text>
          <Text style={styles.subtitle}>
            {skills.length} skill{skills.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Skills error ${error}`}>
          {error}
        </Text>
      ) : null}

      <View style={styles.listArea}>
        <FlatList
          {...scrollProps}
          style={styles.list}
          data={rows}
          keyExtractor={row =>
            row.kind === 'header' ? `h:${row.source}` : `s:${row.skill.source}:${row.skill.name}`
          }
          contentContainerStyle={rows.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ? undefined : 'no skills found'}
            </Text>
          }
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{sectionLabel(item.source)}</Text>
                <Text style={styles.sectionHint}>{sectionHint(item.source)}</Text>
              </View>
            ) : (
              <Pressable
                style={styles.row}
                onPress={() => onOpenSkill(item.skill)}
                accessibilityRole="button"
                accessibilityLabel={`Open skill ${item.skill.name}`}
              >
                <View style={styles.rowMain}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.skillName} numberOfLines={1}>
                      {item.skill.name}
                    </Text>
                    {item.skill.source === 'built-in' ? (
                      <Text style={styles.badge}>synced</Text>
                    ) : null}
                    {item.skill.version ? (
                      <Text style={styles.version}>v{item.skill.version}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.description} numberOfLines={2}>
                    {item.skill.description}
                  </Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
            )
          }
        />
        {indicator}
      </View>
    </View>
  );
}

function sectionLabel(source: SkillEntry['source']): string {
  return SOURCE_SECTIONS.find(section => section.source === source)?.label ?? source;
}

function sectionHint(source: SkillEntry['source']): string {
  return SOURCE_SECTIONS.find(section => section.source === source)?.hint ?? '';
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
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  listArea: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: space.xl },
  emptyContent: { flexGrow: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  empty: { fontSize: font.meta, color: palette.textFaint },
  section: {
    marginTop: space.lg,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    gap: 1,
  },
  sectionLabel: {
    fontSize: font.micro,
    color: palette.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  sectionHint: { fontSize: font.small, color: palette.textFaint },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  skillName: { flexShrink: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
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
  version: { fontSize: font.micro, color: palette.textFaint },
  description: { fontSize: font.small, color: palette.textMuted, lineHeight: 16 },
  linkGlyph: { fontSize: font.screen, color: palette.textFaint },
});
