import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentInfo, AgentsConfigResultFrame } from '../core/protocol';
import type { AgentsStatus } from '../core/agents';
import { useModelCatalog } from '../core/model';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** "global" and "orchestrator" both mean the same row in the app: the umbrella default. */
export function inheritLabel(agent: AgentInfo): string {
  return agent.inheritsFrom === 'orchestrator' ? 'inherits from the orchestrator' : 'inherits the global default';
}

function unavailableText(status: AgentsStatus, error: string | null): string {
  if (error) return error;
  if (status === 'unsupported') {
    return 'this server does not expose agent defaults yet (my-claw 0.1.168 or newer)';
  }
  return 'loading…';
}

/**
 * Where a file-defined agent comes from, short enough to sit next to the name. A workspace agent
 * shows its workspace, since that is what distinguishes two files carrying the same name.
 */
function tierBadge(agent: AgentInfo): string {
  if (agent.layer) return agent.layer.toUpperCase();
  return agent.source === 'built-in' ? 'BUILT-IN' : 'GLOBAL';
}

/**
 * The Agents category: the global defaults (model, effort) and one row per agent the server
 * declares, rendered from the frame so nothing is hardcoded on the device. Picking a default
 * opens the same model picker as the chat, pointed at the config file instead of a session.
 * Until the server answers, the page says so instead of spinning.
 */
export function AgentsSettingsScreen({
  config,
  status,
  error,
  onBack,
  onOpenDefaultModel,
  onOpenProviders,
  onOpenTags,
  onOpenAgent,
  onNewAgent,
}: {
  config: AgentsConfigResultFrame | null;
  status: AgentsStatus;
  error: string | null;
  onBack: () => void;
  onOpenDefaultModel: () => void;
  onOpenProviders: () => void;
  onOpenTags: () => void;
  onOpenAgent: (key: string) => void;
  onNewAgent: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const catalog = useModelCatalog();
  /** Ids are what the config stores; the label is what every other screen shows. */
  const labelOf = (modelId: string): string =>
    catalog.models.find(model => model.id === modelId)?.label ?? modelId;
  const agents = config?.agents ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Agents</Text>
          <Text style={styles.subtitle}>
            {config
              ? `${agents.length} agent${agents.length === 1 ? '' : 's'} · defaults are saved to the server config`
              : unavailableText(status, error)}
          </Text>
        </View>
      </View>

      {/* A refused write must be visible where it was asked for, not only when the page is empty. */}
      {config && error ? (
        <Text style={styles.error} accessibilityLabel={`Agents error ${error}`}>
          {error}
        </Text>
      ) : null}

      {config ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.category}>
            <Text style={styles.section}>defaults</Text>
            <View style={styles.card}>
              <Pressable
                style={[styles.row, styles.link]}
                onPress={onOpenDefaultModel}
                accessibilityRole="button"
                accessibilityLabel="Default model">
                <View style={styles.linkMain}>
                  <Text style={styles.linkTitle}>{config.defaultModel ? labelOf(config.defaultModel) : 'none set'}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {config.defaultEffort
                      ? `${config.defaultModel} · provider ${config.defaultProvider ?? 'default'} · effort ${config.defaultEffort}`
                      : config.defaultProvider
                        ? `${config.defaultModel} · provider ${config.defaultProvider}`
                        : 'what every agent falls back to'}
                  </Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
              <View style={styles.separator} />
              <Pressable
                style={[styles.row, styles.link]}
                onPress={onOpenProviders}
                accessibilityRole="button"
                accessibilityLabel="Providers">
                <View style={styles.linkMain}>
                  <Text style={styles.linkTitle}>Providers</Text>
                  <Text style={styles.hint}>
                    {`${config.providers.length} configured · ${
                      config.providers.filter(provider => provider.keyPresent).length
                    } with a key set`}
                  </Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
              <View style={styles.separator} />
              <Pressable
                style={[styles.row, styles.link]}
                onPress={onOpenTags}
                accessibilityRole="button"
                accessibilityLabel="Tags">
                <View style={styles.linkMain}>
                  <Text style={styles.linkTitle}>Tags</Text>
                  <Text style={styles.hint}>
                    aliases for a model combo · usable anywhere a model is expected
                  </Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.category}>
            <Text style={styles.section}>agents</Text>
            <View style={styles.card}>
              {agents.map((agent, index) => (
                <View key={agent.key}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => onOpenAgent(agent.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open agent ${agent.label}`}>
                    <View style={styles.linkMain}>
                      <View style={styles.linkTitleLine}>
                        <Text style={styles.linkTitle}>{agent.label}</Text>
                        {/* The tier says which file wins for this agent, which is the first thing
                            to know when two of them define the same name. */}
                        {agent.source ? (
                          <Text style={styles.badge}>{tierBadge(agent)}</Text>
                        ) : null}
                        {!agent.pinned ? <Text style={styles.badge}>inherited</Text> : null}
                        {agent.unknownSkills && agent.unknownSkills.length > 0 ? (
                          <Text style={styles.badgeRemoved}>removed skills</Text>
                        ) : null}
                        {agent.unknownMcp && agent.unknownMcp.length > 0 ? (
                          <Text style={styles.badgeRemoved}>removed servers</Text>
                        ) : null}
                      </View>
                      <Text style={styles.hint} numberOfLines={1}>
                        {`${agent.model ? labelOf(agent.model) : 'no model'} · ${
                          agent.pinned ? 'pinned' : inheritLabel(agent)
                        }`}
                      </Text>
                    </View>
                    <Text style={styles.linkGlyph}>›</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            onPress={onNewAgent}
            style={styles.newAgentButton}
            accessibilityRole="button"
            accessibilityLabel="New agent">
            <Text style={styles.newAgentText}>+ New agent</Text>
          </Pressable>
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
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  emptyArea: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg },
  empty: { fontSize: font.meta, color: palette.textFaint, textAlign: 'center' as const },
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
  newAgentButton: {
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
    alignItems: 'center' as const,
  },
  newAgentText: { fontSize: font.body, fontWeight: '600' as const, color: palette.accent },
});
