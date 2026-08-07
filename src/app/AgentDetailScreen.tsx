import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentInfo } from '../core/protocol';
import { inheritLabel } from './AgentsSettingsScreen';
import { useModelCatalog } from '../core/model';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** A scope is a list of names, `["*"]` for everything, or absent (inherited). */
function scopeText(scope: string[] | null | undefined, inheritedFrom: string): string {
  if (scope === null || scope === undefined) return inheritedFrom;
  if (scope.includes('*')) return 'all';
  return scope.length === 0 ? 'none' : scope.join(', ');
}

/**
 * One agent's defaults. The model is editable; the rest of the entry is shown read-only, because
 * it is what actually decides what this agent can reach and reading it here beats opening
 * config.json on the server. Everything renders from the server-sent AgentInfo, so the page
 * never hardcodes an agent name.
 */
export function AgentDetailScreen({
  agent,
  error,
  onBack,
  onOpenModel,
}: {
  agent: AgentInfo;
  /** Server refused the last write: shown here, where the user asked for it. */
  error: string | null;
  onBack: () => void;
  onOpenModel: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const catalog = useModelCatalog();
  const modelLabel = catalog.models.find(model => model.id === agent.model)?.label ?? agent.model;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to agents">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{agent.label}</Text>
          <Text style={styles.subtitle}>{agent.description}</Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Agents error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>model</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenModel}
              accessibilityRole="button"
              accessibilityLabel="Change model">
              <View style={styles.linkMain}>
                <View style={styles.linkTitleLine}>
                  <Text style={styles.linkTitle}>{modelLabel || 'no model'}</Text>
                  {!agent.pinned ? <Text style={styles.badge}>inherited</Text> : null}
                </View>
                <Text style={styles.hint} numberOfLines={1}>
                  {agent.pinned ? `${agent.model} · pinned to this agent` : inheritLabel(agent)}
                </Text>
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>scope</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowKey}>skills</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {scopeText(agent.skills, 'inherited')}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowKey}>MCP</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {scopeText(agent.mcp, 'inherited')}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowKey}>workspace</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {agent.workspace ?? 'default'}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowKey}>context cap</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {agent.contextCap === null || agent.contextCap === undefined
                  ? 'global setting'
                  : agent.contextCap === 0
                    ? 'no ceiling'
                    : `${agent.contextCap} tokens`}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowKey}>iterations</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {agent.maxIterations === null || agent.maxIterations === undefined
                  ? 'default'
                  : String(agent.maxIterations)}
              </Text>
            </View>
          </View>
          <Text style={styles.note}>read-only for now · edit these in the server config</Text>
        </View>
      </ScrollView>
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
  section: { fontSize: font.micro, color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
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
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  hint: { fontSize: font.small, color: palette.textMuted },
  rowKey: { fontSize: font.small, color: palette.textMuted },
  rowValue: { flex: 1, fontSize: font.small, color: palette.text, textAlign: 'right' as const },
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
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
