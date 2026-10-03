import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { connection } from '../core/connection';
import { encodeInstructionsList, encodeServicesGet } from '../core/protocol';
import { instructionsStore, useInstructions } from '../core/instructions';
import { useServices } from '../core/services';
import { setupSettled, setupSteps, type SetupStep } from '../core/setup';
import { useModelCatalog } from '../core/model';
import { pushSupported } from '../core/notifications';
import { prefs } from '../core/prefs';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { ServiceCard } from './ServicesScreen';

const MARK: Record<SetupStep['state'], string> = {
  done: '✓',
  skipped: '–',
  todo: '',
  unknown: '',
};

function useSkipped(): string[] {
  const [skipped, setSkipped] = useState(prefs.get().setupSkipped);
  useEffect(() => prefs.subscribe(next => setSkipped(next.setupSkipped)), []);
  return skipped;
}

function toggleSkip(key: string): void {
  const current = prefs.get().setupSkipped;
  prefs.set(
    'setupSkipped',
    current.includes(key) ? current.filter(k => k !== key) : [...current, key],
  );
}

/**
 * The first-run assistant: every setup the install has, in order. A service is set right here, its
 * card unfolded under its row; the rest open the page that sets them. Any step can be skipped, and
 * a skipped one taken back.
 */
export function SetupScreen({
  deviceId,
  onBack,
  onOpen,
}: {
  deviceId: string | null;
  onBack: () => void;
  onOpen: (step: SetupStep) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const catalog = useModelCatalog();
  const { frame, busy } = useServices();
  const instructions = useInstructions();
  const skipped = useSkipped();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    connection.send(encodeServicesGet()).catch(() => {});
    instructionsStore.request();
    connection.send(encodeInstructionsList()).catch(() => {});
  }, []);
  const steps = setupSteps({
    defaultModel: catalog.defaultModel,
    services: frame,
    instructions: instructions.entries,
    deviceId,
    pushSupported,
    skipped,
  });

  return (
    <View style={styles.root}>
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
          <Text style={styles.title}>Get started</Text>
          <Text style={styles.subtitle}>
            {setupSettled(steps)} of {steps.length} done or skipped
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          A model is all the agent needs to answer. Everything else starts in
          the cloud, and every step can be skipped.
        </Text>
        <View style={styles.card}>
          {steps.map((step, index) => {
            const view = step.service
              ? frame?.services.find(s => s.id === step.service)
              : undefined;
            const unfolded = open === step.key && view !== undefined;
            return (
              <View
                key={step.key}
                style={[
                  styles.step,
                  index === steps.length - 1 && styles.stepLast,
                ]}
              >
                <View style={styles.row}>
                  <Pressable
                    onPress={() =>
                      step.service
                        ? setOpen(unfolded ? null : step.key)
                        : onOpen(step)
                    }
                    style={styles.rowMain}
                    accessibilityRole="button"
                    accessibilityState={
                      step.service ? { expanded: unfolded } : undefined
                    }
                    accessibilityLabel={`Setup step ${step.title}${step.state === 'done' ? ', done' : step.state === 'skipped' ? ', skipped' : ''}`}
                  >
                    <Text
                      style={[
                        styles.mark,
                        step.state === 'done'
                          ? styles.markDone
                          : styles.markOther,
                      ]}
                    >
                      {MARK[step.state] || `${index + 1}`}
                    </Text>
                    <View style={styles.rowText}>
                      <Text
                        style={[
                          styles.rowTitle,
                          step.state === 'skipped' && styles.rowSkipped,
                        ]}
                      >
                        {step.title}
                      </Text>
                      <Text style={styles.rowHint} numberOfLines={2}>
                        {step.hint}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>
                      {step.service ? (unfolded ? '⌄' : '›') : '›'}
                    </Text>
                  </Pressable>
                  {step.state === 'done' ? null : (
                    <Pressable
                      onPress={() => toggleSkip(step.key)}
                      style={styles.skip}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`${step.state === 'skipped' ? 'Unskip' : 'Skip'} ${step.title}`}
                    >
                      <Text style={styles.skipText}>
                        {step.state === 'skipped' ? 'Undo' : 'Skip'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {unfolded && view && frame ? (
                  <ServiceCard
                    service={view}
                    install={frame.install}
                    busy={busy}
                    inline
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  // The settings pages' header (Providers, Settings): the shell pads the page, the header only
  // draws its rule, and Back is the same 40pt square everywhere.
  root: { flex: 1 },
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
  title: {
    fontSize: font.title,
    fontWeight: '600' as const,
    color: palette.text,
  },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  content: {
    paddingVertical: space.md,
    gap: space.md,
    paddingBottom: space.xl,
  },
  hint: { fontSize: font.small, color: palette.textMuted },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
  },
  step: {
    padding: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  stepLast: { borderBottomWidth: 0 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  rowSkipped: { color: palette.textFaint },
  rowHint: { fontSize: font.small, color: palette.textMuted },
  mark: {
    width: 24,
    textAlign: 'center' as const,
    fontSize: font.body,
    fontWeight: '700' as const,
  },
  markDone: { color: palette.accent },
  markOther: { color: palette.textFaint },
  chevron: {
    fontSize: font.screen,
    color: palette.textFaint,
    width: 16,
    textAlign: 'center' as const,
  },
  skip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  skipText: { fontSize: font.small, color: palette.textMuted },
});
