import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { SkillEntry, WorkspaceEntry } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';

/** Display names of the three tiers, with the server-side location as the honest hint. */
const SOURCE_SECTIONS: Array<{ source: SkillEntry['source']; label: string; hint: string }> = [
  { source: 'built-in', label: 'Built-in', hint: '~/.my-claw/skills/.builtin · synced from the release, read-only' },
  { source: 'custom', label: 'Custom', hint: '~/.my-claw/skills' },
  { source: 'workspace', label: 'Workspace', hint: '<workspace>/skills' },
];

/** The skills of one tier in catalog order, with section headers. Workspace skills are
 *  sub-grouped per workspace so the phone tells two projects apart without guessing. */
type Row =
  | { kind: 'header'; source: SkillEntry['source'] }
  | { kind: 'wsHeader'; workspace: string; path: string }
  | { kind: 'skill'; skill: SkillEntry };

function pathOf(workspaces: WorkspaceEntry[], key: string): string {
  const found = workspaces.find(entry => entry.key === key);
  return found?.path ?? '';
}

function buildRows(skills: SkillEntry[], workspaces: WorkspaceEntry[]): Row[] {
  const rows: Row[] = [];
  for (const section of SOURCE_SECTIONS) {
    const ofSource = skills.filter(skill => skill.source === section.source);
    if (ofSource.length === 0) continue;
    rows.push({ kind: 'header', source: section.source });
    if (section.source === 'workspace') {
      const keys = [...new Set(ofSource.map(skill => skill.workspace ?? 'default'))];
      for (const key of keys) {
        rows.push({ kind: 'wsHeader', workspace: key, path: pathOf(workspaces, key) });
        for (const skill of ofSource.filter(s => (s.workspace ?? 'default') === key)) {
          rows.push({ kind: 'skill', skill });
        }
      }
    } else {
      for (const skill of ofSource) rows.push({ kind: 'skill', skill });
    }
  }
  return rows;
}

export function SkillsScreen({
  skills,
  workspaces,
  error,
  onBack,
  onOpenSkill,
}: {
  skills: SkillEntry[];
  /** Key -> path of every workspace, so the page can name where each skill lives. */
  workspaces: WorkspaceEntry[];
  /** Server refused the request: distinct from an empty catalog, which is itself a fact. */
  error?: string;
  onBack: () => void;
  onOpenSkill: (skill: SkillEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { scrollProps, indicator } = useScrollIndicator();
  const rows = buildRows(skills, workspaces);

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
            row.kind === 'header'
              ? `h:${row.source}`
              : row.kind === 'wsHeader'
                ? `w:${row.workspace}`
                : `s:${row.skill.source}:${row.skill.workspace ?? 'default'}:${row.skill.name}`
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
            ) : item.kind === 'wsHeader' ? (
              <View style={styles.wsSection}>
                <Text style={styles.wsLabel}>{item.workspace}</Text>
                <Text style={styles.sectionHint} numberOfLines={1}>
                  {item.path}
                </Text>
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
  wsSection: {
    marginTop: space.md,
    marginBottom: 2,
    paddingHorizontal: space.md,
    gap: 1,
  },
  wsLabel: {
    fontSize: font.small,
    color: palette.accent,
    fontWeight: '600' as const,
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
