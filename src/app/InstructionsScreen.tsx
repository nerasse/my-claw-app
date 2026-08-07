import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { InstructionEntry, NestedInstruction } from '../core/protocol';
import type { InstructionsStatus } from '../core/instructions';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** What a workspace's entry says about where the agent actually reads this file. */
export function originLabel(entry: InstructionEntry): string {
  if (entry.origin === 'own') return 'in this workspace';
  if (entry.origin === 'inherited') return `inherited from ${entry.from || 'default'}`;
  return 'shipped default, no file yet';
}

function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function unavailableText(status: InstructionsStatus, error: string | null): string {
  if (status === 'unsupported') {
    return 'this server is too old for the instructions page (needs 0.1.169 or later)';
  }
  return error ?? 'loading instructions...';
}

/**
 * The markdown that builds the system prompt, per workspace. A file a workspace does not carry
 * is never shown as missing: the agent reads the default workspace's copy, so the row says where
 * the content comes from. Nested AGENTS.md are listed apart because they are not prompt layers --
 * they reach tool results during a run.
 */
export function InstructionsScreen({
  entries,
  nested,
  status,
  error,
  backLabel,
  onBack,
  onOpen,
  onOpenNested,
}: {
  entries: InstructionEntry[];
  nested: NestedInstruction[];
  status: InstructionsStatus;
  error: string | null;
  /** The page is reachable from the settings index and from an agent, and back returns there. */
  backLabel: string;
  onBack: () => void;
  onOpen: (entry: InstructionEntry) => void;
  onOpenNested: (item: NestedInstruction) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();

  const workspaces = [...new Set(entries.map(e => e.workspace))];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={backLabel}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Instructions</Text>
          <Text style={styles.subtitle}>the markdown that builds the system prompt</Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Instructions error ${error}`}>
          {error}
        </Text>
      ) : null}

      {entries.length > 0 ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {workspaces.map(workspace => (
            <View key={workspace} style={styles.category}>
              <Text style={styles.section}>{workspace}</Text>
              <View style={styles.card}>
                {entries
                  .filter(entry => entry.workspace === workspace)
                  .map((entry, index) => (
                    <View key={entry.file}>
                      {index > 0 ? <View style={styles.separator} /> : null}
                      <Pressable
                        style={[styles.row, styles.link]}
                        onPress={() => onOpen(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${entry.file} of ${workspace}`}>
                        <View style={styles.linkMain}>
                          <View style={styles.linkTitleLine}>
                            <Text style={styles.linkTitle}>{entry.file}</Text>
                            {entry.origin !== 'own' ? <Text style={styles.badge}>{entry.origin}</Text> : null}
                          </View>
                          <Text style={styles.hint} numberOfLines={1}>
                            {`${originLabel(entry)} · ${sizeLabel(entry.bytes)}`}
                          </Text>
                        </View>
                        <Text style={styles.linkGlyph}>›</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            </View>
          ))}

          {nested.length > 0 ? (
            <View style={styles.category}>
              <Text style={styles.section}>nested AGENTS.md</Text>
              <View style={styles.card}>
                {nested.map((item, index) => (
                  <View key={`${item.workspace}:${item.path}`}>
                    {index > 0 ? <View style={styles.separator} /> : null}
                    <Pressable
                      style={[styles.row, styles.link]}
                      onPress={() => onOpenNested(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Read ${item.path} of ${item.workspace}`}>
                      <View style={styles.linkMain}>
                        <View style={styles.linkTitleLine}>
                          <Text style={styles.linkTitle} numberOfLines={1}>
                            {item.path}
                          </Text>
                          <Text style={styles.badge}>read only</Text>
                        </View>
                        <Text style={styles.hint} numberOfLines={1}>
                          {`${item.workspace} · ${sizeLabel(item.bytes)}`}
                        </Text>
                      </View>
                      <Text style={styles.linkGlyph}>›</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Text style={styles.note}>
                added to tool results while a run touches their directory, not to the system prompt
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.emptyArea}>
          <Text style={styles.empty}>{unavailableText(status, error)}</Text>
        </View>
      )}
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
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
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
  linkTitleLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexWrap: 'wrap' as const,
  },
  linkTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  hint: { fontSize: font.small, color: palette.textMuted },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
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
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  emptyArea: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg },
  empty: { fontSize: font.meta, color: palette.textFaint, textAlign: 'center' as const },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
