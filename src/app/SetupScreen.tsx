import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { connection } from '../core/connection';
import { encodeServicesGet } from '../core/protocol';
import { useServices } from '../core/services';
import { setupSteps } from '../core/setup';
import { useModelCatalog } from '../core/model';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import type { SettingsPage } from './settingsPages';

/** The first-run assistant: each step opens the page that sets it, and says when it is done. */
export function SetupScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (page: SettingsPage) => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const catalog = useModelCatalog();
  const { frame } = useServices();
  useEffect(() => {
    connection.send(encodeServicesGet()).catch(() => {});
  }, []);
  const steps = setupSteps({ defaultModel: catalog.defaultModel, services: frame });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Get started</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>A model is all the agent needs to answer. The rest can wait, and everything starts in the cloud.</Text>
        <View style={styles.card}>
          {steps.map((step, index) => (
            <Pressable
              key={step.key}
              onPress={() => onOpen(step.page)}
              style={[styles.row, index === steps.length - 1 && styles.rowLast]}
              accessibilityRole="button"
              accessibilityLabel={`Setup step ${step.title}${step.done ? ', done' : ''}`}>
              <Text style={[styles.mark, step.done ? styles.markDone : step.essential ? styles.markTodo : styles.markOptional]}>
                {step.done ? '✓' : `${index + 1}`}
              </Text>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{step.title}</Text>
                <Text style={styles.rowHint} numberOfLines={2}>
                  {step.hint}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  back: { fontSize: font.screen, color: palette.textFaint, paddingHorizontal: 4 },
  title: { fontSize: font.screen, fontWeight: '600' as const, color: palette.text },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  hint: { fontSize: font.small, color: palette.textMuted },
  card: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  rowHint: { fontSize: font.small, color: palette.textMuted },
  mark: { width: 24, textAlign: 'center' as const, fontSize: font.body, fontWeight: '700' as const },
  markDone: { color: palette.accent },
  markTodo: { color: palette.danger },
  markOptional: { color: palette.textFaint },
  chevron: { fontSize: font.screen, color: palette.textFaint },
});
