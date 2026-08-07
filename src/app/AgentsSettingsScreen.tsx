import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentInfo, AgentsConfigResultFrame } from '../core/protocol';
import type { AgentsStatus } from '../core/agents';
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
  onOpenDefaultEffort,
  onOpenAgent,
}: {
  config: AgentsConfigResultFrame | null;
  status: AgentsStatus;
  error: string | null;
  onBack: () => void;
  onOpenDefaultModel: () => void;
  onOpenDefaultEffort: () => void;
  onOpenAgent: (key: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const defaultLabel = config?.defaultModel || 'none set';
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
                  <Text style={styles.linkTitle}>{defaultLabel}</Text>
                  <Text style={styles.hint}>
                    {config.defaultProvider ? `provider: ${config.defaultProvider}` : 'what every agent falls back to'}
                  </Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
              <View style={styles.separator} />
              <Pressable
                style={[styles.row, styles.link]}
                onPress={onOpenDefaultEffort}
                accessibilityRole="button"
                accessibilityLabel="Default effort">
                <View style={styles.linkMain}>
                  <Text style={styles.linkTitle}>{config.defaultEffort || 'not set'}</Text>
                  <Text style={styles.hint}>reasoning effort when a model sets none of its own</Text>
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
                    accessibilityLabel={`Open agent ${agent.key}`}>
                    <View style={styles.linkMain}>
                      <View style={styles.linkTitleLine}>
                        <Text style={styles.linkTitle}>{agent.label}</Text>
                        {!agent.pinned ? <Text style={styles.badge}>{inheritLabel(agent)}</Text> : null}
                      </View>
                      <Text style={styles.hint} numberOfLines={1}>
                        {agent.model || 'no model'} · {agent.description}
                      </Text>
                    </View>
                    <Text style={styles.linkGlyph}>›</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
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
  },
  emptyArea: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg },
  empty: { fontSize: font.meta, color: palette.textFaint, textAlign: 'center' as const },
});
