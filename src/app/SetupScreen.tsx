import { CheckIcon, ChevronIcon } from '../components/icons';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { connection } from '../core/connection';
import { encodeInstructionsList, encodeServicesGet } from '../core/protocol';
import { instructionsStore, useInstructions } from '../core/instructions';
import { useServices } from '../core/services';
import { modelReady, setupSettled, setupSteps, type SetupStep } from '../core/setup';
import { useModelCatalog } from '../core/model';
import { pushSupported } from '../core/notifications';
import { prefs } from '../core/prefs';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { ServiceCard } from './ServicesScreen';
import { CloseButton } from '../components/CloseButton';

// Only the two marks still drawn as text: done is a vector, and the rest is a step number.
const MARK: Record<SetupStep['state'], string> = {
  done: '',
  skipped: '–',
  todo: '',
  unknown: '',
};

function useSkipped(): string[] {
  const [skipped, setSkipped] = useState(prefs.get().setupSkipped);
  useEffect(() => prefs.subscribe(next => setSkipped(next.setupSkipped)), []);
  return skipped;
}

/** On a wide window a list of steps reads best at a column's width, not the page's. */
export const SETUP_WIDTH = 760;

/** A page served over plain HTTP: the browser refuses the microphone, push and location there. */
function insecureWeb(): boolean {
  if (Platform.OS !== 'web') return false;
  const w = globalThis as { isSecureContext?: boolean };
  return w.isSecureContext === false;
}

export function toggleSkip(key: string): void {
  const current = prefs.get().setupSkipped;
  prefs.set(
    'setupSkipped',
    current.includes(key) ? current.filter(k => k !== key) : [...current, key],
  );
}

/**
 * Where each setup step stands, from the stores the pages fill: the assistant draws it, the
 * settings index counts it for its banner. Asking the server is the caller's job.
 */
export function useSetupSteps(deviceId: string | null, providers: number | null): SetupStep[] {
  const catalog = useModelCatalog();
  const { frame } = useServices();
  const instructions = useInstructions();
  const skipped = useSkipped();
  return setupSteps({
    defaultModel: catalog.defaultModel,
    services: frame,
    instructions: instructions.entries,
    deviceId,
    pushSupported,
    skipped,
    providers,
    defaultUnavailable: catalog.defaultModel !== '' && !modelReady(catalog.defaultModel, catalog.unavailable),
  });
}

/** The banner on the settings index: shown once every step is known, while one is left. */
export function setupBanner(steps: SetupStep[]): { settled: number; total: number } | null {
  if (steps.some(step => step.state === 'unknown')) return null;
  const settled = setupSettled(steps);
  return settled < steps.length ? { settled, total: steps.length } : null;
}

/**
 * The first-run assistant: every setup the install has, in order. A service is set right here, its
 * card unfolded under its row; the rest open the page that sets them. Any step can be skipped, and
 * a skipped one taken back.
 */
export function SetupScreen({
  deviceId,
  providers,
  gate,
  onBack,
  onOpen,
}: {
  deviceId: string | null;
  /** Configured providers, null until the agents config answered. */
  providers: number | null;
  /**
   * The first run: the page is the whole app until it is finished or skipped, so it has no Back,
   * only its own way out at the bottom.
   */
  gate?: { onFinish: () => void; onSkip: () => void };
  onBack: () => void;
  onOpen: (step: SetupStep) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const catalog = useModelCatalog();
  const { frame, busy } = useServices();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    connection.send(encodeServicesGet()).catch(() => {});
    instructionsStore.request();
    connection.send(encodeInstructionsList()).catch(() => {});
  }, []);
  const steps = useSetupSteps(deviceId, providers);
  const ready = modelReady(catalog.defaultModel, catalog.unavailable);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {gate ? null : (
          <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to settings">
            <ChevronIcon direction="left" size={22} tone="text" />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>{gate ? 'Welcome to MyClaw' : 'Get started'}</Text>
          <Text style={styles.subtitle}>
            {setupSettled(steps)} of {steps.length} done or skipped
          </Text>
        </View>
        <CloseButton />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          A model is all the agent needs to answer. Everything else starts in
          the cloud, and every step can be skipped.
        </Text>
        {insecureWeb() ? (
          <Text style={styles.warning} accessibilityLabel="Not served over HTTPS">
            This page is not served over HTTPS: voice notes, notifications and location do not work
            in this browser, and your access travels unencrypted. Put MyClaw behind HTTPS (a reverse
            proxy) or reach it over a VPN.
          </Text>
        ) : null}
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
                    {step.state === 'done' ? (
                      <CheckIcon size={16} tone="accent" />
                    ) : (
                      <Text style={[styles.mark, styles.markOther]}>
                        {MARK[step.state] || `${index + 1}`}
                      </Text>
                    )}
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
                    <ChevronIcon
                      direction={step.service && unfolded ? 'up' : 'right'}
                      size={16}
                      tone="faint"
                    />
                  </Pressable>
                  {/* The same slot on every row, button or not: the chevrons stay in one column. */}
                  {step.state === 'done' ? (
                    <View style={styles.skipSlot} />
                  ) : (
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
      {gate ? (
        <View style={styles.footer}>
          {ready ? (
            <Pressable onPress={gate.onFinish} style={styles.primary} accessibilityRole="button" accessibilityLabel="Start using MyClaw">
              <Text style={styles.primaryText}>Start using MyClaw</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.footerNote}>Without a model the agent cannot answer.</Text>
              <Pressable onPress={gate.onSkip} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Skip setup for now">
                <Text style={styles.secondaryText}>Skip for now</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  // The settings pages' header (Providers, Settings): the shell pads the page, the header only
  // draws its rule, and Back is the same 40pt square everywhere.
  root: { flex: 1, width: '100%' as const, maxWidth: SETUP_WIDTH, alignSelf: 'center' as const, paddingTop: space.sm },
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
  markOther: { color: palette.textFaint },
  // A real button, not a word: 36pt tall, the row's other target being the whole row.
  skipSlot: { width: 64 },
  skip: {
    width: 64,
    alignItems: 'center' as const,
    minHeight: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  warning: { fontSize: font.small, color: palette.danger },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  footerNote: { flex: 1, fontSize: font.small, color: palette.textMuted },
  primary: {
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
  },
  primaryText: { fontSize: font.body, fontWeight: '600' as const, color: palette.accentText },
  secondary: {
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryText: { fontSize: font.body, color: palette.text },
  skipText: { fontSize: font.small, color: palette.textMuted },
});
