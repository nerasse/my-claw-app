import { ChevronIcon } from '../components/icons';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentInfo } from '../core/protocol';
import { inheritLabel } from './AgentsSettingsScreen';
import { useModelCatalog } from '../core/model';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';

/** A scope is a list of names, `["*"]` for everything, or absent (inherited). */
function scopeText(scope: string[] | null | undefined, inheritedFrom: string): string {
  if (scope === null || scope === undefined) return inheritedFrom;
  if (scope.includes('*')) return 'all';
  return scope.length === 0 ? 'none' : scope.join(', ');
}

/**
 * One agent's defaults. The model was editable first; every scope row now opens its own editor,
 * and a file-defined agent links to its definition file. Everything renders from the server-sent
 * AgentInfo, so the page never hardcodes an agent name. Entries that match nothing in the live
 * catalogs (unknownSkills/unknownMcp/unknownWorkspace) are painted red: they still exist in
 * config, so they have to stay visible to be removed.
 */
export function AgentDetailScreen({
  agent,
  error,
  onBack,
  onOpenModel,
  onOpenInstructions,
  onOpenScope,
  onOpenWorkspace,
  onOpenIterations,
  onOpenContextCap,
  onOpenFile,
  onFork,
}: {
  agent: AgentInfo;
  /** Server refused the last write: shown here, where the user asked for it. */
  error: string | null;
  onBack: () => void;
  onOpenModel: () => void;
  onOpenInstructions: () => void;
  onOpenScope: (field: 'skills' | 'mcp') => void;
  onOpenWorkspace: () => void;
  onOpenIterations: () => void;
  onOpenContextCap: () => void;
  onOpenFile: () => void;
  onFork: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const catalog = useModelCatalog();
  const modelLabel = catalog.models.find(model => model.id === agent.model)?.label ?? agent.model;

  const unknownSkills = agent.unknownSkills ?? [];
  const unknownMcp = agent.unknownMcp ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to agents">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{agent.label}</Text>
          <Text style={styles.subtitle}>{agent.description}</Text>
        </View>
        <CloseButton />
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
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
          </View>
        </View>

        {agent.source ? (
          <View style={styles.category}>
            <Text style={styles.section}>definition</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowKey}>tier</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {agent.layer ? `${agent.source} · ${agent.layer}` : agent.source}
                </Text>
              </View>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={styles.rowKey}>toolset</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {agent.base ?? 'general'}
                </Text>
              </View>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={styles.rowKey}>file</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {agent.path ?? ''}
                </Text>
              </View>
              <View style={styles.separator} />
              <Pressable
                style={[styles.row, styles.link]}
                onPress={agent.source === 'built-in' ? onFork : onOpenFile}
                accessibilityRole="button"
                accessibilityLabel={agent.source === 'built-in' ? 'Fork agent to custom' : 'Edit agent file'}>
                <Text style={styles.rowKey}>{agent.source === 'built-in' ? 'fork' : 'edit'}</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {agent.source === 'built-in'
                    ? 'copy to a custom file you can edit'
                    : 'change this file from the app'}
                </Text>
                <ChevronIcon direction="right" size={16} tone="faint" />
              </Pressable>
            </View>
            <Text style={styles.note}>
              A higher tier replaces a lower one entirely: forking a built-in gives you the
              definition to own.
            </Text>
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>scope</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.row, styles.link]}
              onPress={() => onOpenScope('skills')}
              accessibilityRole="button"
              accessibilityLabel="Edit skills scope">
              <Text style={styles.rowKey}>skills</Text>
              <View style={styles.valueArea}>
                <View style={styles.valueLine}>
                  <Text
                    style={[unknownSkills.length > 0 ? styles.valueRemoved : styles.rowValue, styles.valueShrink]}
                    numberOfLines={1}>
                    {scopeText(agent.skills, 'inherited')}
                  </Text>
                  {unknownSkills.length > 0 ? <Text style={styles.badgeRemoved}>removed</Text> : null}
                </View>
                {unknownSkills.length > 0 ? (
                  <Text style={styles.removedHint} numberOfLines={1}>
                    {`removed: ${unknownSkills.join(', ')}`}
                  </Text>
                ) : null}
              </View>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
            <View style={styles.separator} />
            <Pressable
              style={[styles.row, styles.link]}
              onPress={() => onOpenScope('mcp')}
              accessibilityRole="button"
              accessibilityLabel="Edit MCP scope">
              <Text style={styles.rowKey}>MCP</Text>
              <View style={styles.valueArea}>
                <View style={styles.valueLine}>
                  <Text
                    style={[unknownMcp.length > 0 ? styles.valueRemoved : styles.rowValue, styles.valueShrink]}
                    numberOfLines={1}>
                    {scopeText(agent.mcp, 'inherited')}
                  </Text>
                  {unknownMcp.length > 0 ? <Text style={styles.badgeRemoved}>removed</Text> : null}
                </View>
                {unknownMcp.length > 0 ? (
                  <Text style={styles.removedHint} numberOfLines={1}>
                    {`removed: ${unknownMcp.join(', ')}`}
                  </Text>
                ) : null}
              </View>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
            <View style={styles.separator} />
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenWorkspace}
              accessibilityRole="button"
              accessibilityLabel="Edit workspace">
              <Text style={styles.rowKey}>workspace</Text>
              <View style={styles.valueArea}>
                <View style={styles.valueLine}>
                  <Text
                    style={[agent.unknownWorkspace ? styles.valueRemoved : styles.rowValue, styles.valueShrink]}
                    numberOfLines={1}>
                    {agent.workspace ?? 'default'}
                  </Text>
                  {agent.unknownWorkspace ? <Text style={styles.badgeRemoved}>removed</Text> : null}
                </View>
              </View>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
            <View style={styles.separator} />
            {/* The workspace prompt files this agent sits on. A file-defined agent adds its own
                mandate on top of them, which lives in its `.agents/` file rather than here. */}
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenInstructions}
              accessibilityRole="button"
              accessibilityLabel="Open instructions">
              <Text style={styles.rowKey}>instructions</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {agent.workspace ? `${agent.workspace} workspace` : 'default workspace'}
              </Text>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
            <View style={styles.separator} />
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenContextCap}
              accessibilityRole="button"
              accessibilityLabel="Edit context cap">
              <Text style={styles.rowKey}>context cap</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {agent.contextCap === null || agent.contextCap === undefined
                  ? 'global setting'
                  : agent.contextCap === 0
                    ? 'no ceiling'
                    : `${agent.contextCap} tokens`}
              </Text>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
            <View style={styles.separator} />
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenIterations}
              accessibilityRole="button"
              accessibilityLabel="Edit iterations">
              <Text style={styles.rowKey}>iterations</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {agent.maxIterations === null || agent.maxIterations === undefined
                  ? 'default'
                  : String(agent.maxIterations)}
              </Text>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
          </View>
          <Text style={styles.note}>
            edits are saved to the server config and apply on the next run
          </Text>
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
  hint: { fontSize: font.small, color: palette.textMuted },
  rowKey: { fontSize: font.small, color: palette.textMuted },
  rowValue: { flex: 1, fontSize: font.small, color: palette.text, textAlign: 'right' as const },
  valueRemoved: { flex: 1, fontSize: font.small, color: palette.danger, textAlign: 'right' as const },
  /** Values inside the right-aligned block truncate instead of pushing the card wide. */
  valueArea: { flex: 1, alignItems: 'flex-end' as const, gap: 2 },
  valueLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  valueShrink: { flex: 0, flexShrink: 1 },
  removedHint: { fontSize: font.micro, color: palette.danger },
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
  badgeRemoved: {
    fontSize: font.micro,
    color: palette.danger,
    borderWidth: 1,
    borderColor: palette.danger,
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
