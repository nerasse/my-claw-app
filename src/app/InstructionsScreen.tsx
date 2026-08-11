import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { InstructionEntry, NestedInstruction } from '../core/protocol';
import type { InstructionsStatus } from '../core/instructions';
import { sourceStatusOf, sourceOwnsFile } from '../core/layers';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function unavailableText(status: InstructionsStatus, error: string | null): string {
  if (status === 'unsupported') {
    return 'this server is too old for the instructions page (needs 0.1.169 or later)';
  }
  return error ?? 'loading instructions...';
}

export interface RowBadge {
  text: string;
  danger: boolean;
}

export interface RowText {
  badge: RowBadge | null;
  hint: string;
}

/**
 * What a row says about one file, from the resolution the server sent. The badge names the
 * state; the hint says the consequence. `missing` never appears: a workspace without a file
 * reads something, and the row says what.
 */
export function rowText(
  entry: InstructionEntry,
  workspaceKeys: string[],
  entries: InstructionEntry[],
): RowText {
  if (entry.origin === 'own') {
    return { badge: null, hint: `in this workspace · ${sizeLabel(entry.bytes)}` };
  }
  if (entry.origin === 'off') {
    return {
      badge: { text: 'off', danger: true },
      hint:
        entry.bytes > 0
          ? `off: ${entry.workspace}/${entry.file} exists but is never read`
          : 'off: this layer is left out of the prompt',
    };
  }
  if (entry.origin === 'inherited') {
    return {
      badge: { text: 'inherited', danger: false },
      hint: `inherited from ${entry.from || 'default'} · ${sizeLabel(entry.bytes)}`,
    };
  }
  // origin 'fallback': nothing any workspace owns, or a source that could not deliver.
  const source = sourceStatusOf(entry, workspaceKeys);
  if (source.kind === 'none') {
    return { badge: { text: 'no layer', danger: false }, hint: 'nothing: this layer is left out of the prompt' };
  }
  // A source that is cut and owns no file. Only the server can tell this apart from a source that
  // is merely empty-handed, and the two end differently: nothing at all versus the template. The
  // row has to say which, or it promises a template that is never read.
  if (entry.empty === true && source.kind === 'workspace') {
    return {
      badge: { text: 'no layer', danger: false },
      hint: `${source.key} has this layer off and no ${entry.file} to pass on · nothing is read`,
    };
  }
  if (source.kind === 'builtin') {
    return {
      badge: { text: 'built-in', danger: false },
      hint: 'always the shipped template, even if default has one',
    };
  }
  // The one-hop rule, and the reason this branch is about the source *not* owning the file: the
  // server only says "fallback" once the source failed to deliver, and a source that owns the
  // file never fails. So the common shape here is a source without that file, which the ladder
  // does not follow any further -- it stops on the shipped template.
  if (source.kind === 'workspace' && !source.self && !source.removed && !sourceOwnsFile(entry, entries)) {
    return {
      badge: { text: 'built-in', danger: false },
      hint: `read from ${source.key}, which has no ${entry.file} either · lands on the shipped template`,
    };
  }
  // Source owns the file, yet the server called it a fallback: the listing and the resolution
  // disagree, which only happens on a snapshot taken across a write. Read it the optimistic way;
  // the next list settles it.
  if (source.kind === 'workspace' && !source.self && !source.removed) {
    return {
      badge: { text: 'inherited', danger: false },
      hint: `read from ${source.key} · ${sizeLabel(entry.bytes)}`,
    };
  }
  if (source.kind === 'workspace' && source.removed) {
    return {
      badge: { text: 'broken', danger: true },
      hint: `reads from ${source.key}, which no longer exists · falls back to the shipped template`,
    };
  }
  if (source.kind === 'workspace' && source.self) {
    return {
      badge: { text: 'broken', danger: true },
      hint: `points at ${entry.workspace} itself · falls back to the shipped template`,
    };
  }
  return {
    badge: { text: 'built-in', danger: false },
    hint: 'shipped template, no file yet',
  };
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
  workspaceKeys,
  backLabel,
  onBack,
  onOpen,
  onOpenLayer,
  onOpenNested,
}: {
  entries: InstructionEntry[];
  nested: NestedInstruction[];
  status: InstructionsStatus;
  error: string | null;
  /** Every workspace key, "default" included: what a configured source may point at. */
  workspaceKeys: string[];
  /** The page is reachable from the settings index and from an agent, and back returns there. */
  backLabel: string;
  onBack: () => void;
  onOpen: (entry: InstructionEntry) => void;
  /** The per-file layer controls; hidden entirely on a server that predates them. */
  onOpenLayer: (entry: InstructionEntry) => void;
  onOpenNested: (item: NestedInstruction) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();

  const workspaces = [...new Set(entries.map(e => e.workspace))];
  // A server that predates the per-file sources sends no `inherit`: the page then shows no
  // controls at all instead of a dead button.
  const layersSupported = entries.some(entry => entry.inherit !== undefined);

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
          {workspaces.map(workspace => {
            const rows = entries.filter(entry => entry.workspace === workspace);
            const cut = rows.filter(entry => entry.origin === 'off' || entry.inherit === 'none').length;
            return (
              <View key={workspace} style={styles.category}>
                <Text style={styles.section}>{workspace}</Text>
                <View style={styles.card}>
                  {rows.map((entry, index) => {
                    const row = rowText(entry, workspaceKeys, entries);
                    return (
                      <View key={entry.file}>
                        {index > 0 ? <View style={styles.separator} /> : null}
                        <View style={styles.row}>
                          <Pressable
                            style={[styles.link, styles.linkMain]}
                            onPress={() => onOpen(entry)}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${entry.file} of ${workspace}`}>
                            <View style={styles.linkTitleLine}>
                              <Text style={styles.linkTitle}>{entry.file}</Text>
                              {row.badge ? (
                                <Text
                                  style={[styles.badge, row.badge.danger ? styles.badgeDanger : null]}
                                  accessibilityLabel={`${entry.file} of ${workspace} ${row.badge.text}`}>
                                  {row.badge.text}
                                </Text>
                              ) : null}
                            </View>
                            <Text style={styles.hint} numberOfLines={2}>
                              {row.hint}
                            </Text>
                          </Pressable>
                          {entry.inherit !== undefined ? (
                            <Pressable
                              style={styles.layerButton}
                              onPress={() => onOpenLayer(entry)}
                              accessibilityRole="button"
                              accessibilityLabel={`Layer settings for ${entry.file} of ${workspace}`}>
                              <Text style={styles.layerGlyph}>⋯</Text>
                            </Pressable>
                          ) : null}
                          <Text style={styles.linkGlyph}>›</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {cut > 0 ? (
                  <Text style={styles.note}>
                    {`${cut} ${cut === 1 ? 'layer' : 'layers'} of ${workspace} never reach the prompt · open ⋯ on a row to see why`}
                  </Text>
                ) : null}
                {!layersSupported ? (
                  <Text style={styles.note}>
                    this server always falls back to the default workspace (per-file sources need a newer server)
                  </Text>
                ) : null}
              </View>
            );
          })}

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
  badgeDanger: { color: palette.danger, borderColor: palette.danger },
  layerButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  layerGlyph: { fontSize: 18, color: palette.accent },
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
