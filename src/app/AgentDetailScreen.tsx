import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentInfo } from '../core/protocol';
import { inheritLabel } from './AgentsSettingsScreen';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * One agent's defaults. Lot by lot: the model today (pinned or inherited), then the context
 * ceiling and iteration budget join the card when their pickers exist. Everything renders from
 * the server-sent AgentInfo, so the page never hardcodes an agent name.
 */
export function AgentDetailScreen({
  agent,
  onBack,
  onOpenModel,
}: {
  agent: AgentInfo;
  onBack: () => void;
  onOpenModel: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();

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
                <Text style={styles.linkTitle}>{agent.model || 'no model'}</Text>
                <Text style={styles.hint}>
                  {agent.pinned ? 'pinned to this agent' : inheritLabel(agent)}
                </Text>
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          </View>
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
  linkTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  hint: { fontSize: font.small, color: palette.textMuted },
});
