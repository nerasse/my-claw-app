import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ActionSheet, type SheetOption } from './ActionSheet';
import { connection } from '../core/connection';
import { useModelCatalog, useThreadModel } from '../core/model';
import { contextSummary, contextTiers } from '../core/context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import {
  encodeModelContextSet,
  encodeModelEffortSet,
  encodeModelSet,
  type ModelOption,
} from '../core/protocol';

function splitGroup(model: ModelOption): string[] {
  return (model.group ?? '').split('/').map(part => part.trim()).filter(Boolean);
}

/** Which screen of the flow is showing. The flow is always model -> [effort] -> [context] -> confirm. */
export type PickerStage = 'model' | 'effort' | 'context' | 'confirm';

/**
 * The whole state of one picker run, owned by the shell so the hardware back key can walk it.
 * `trail` records the stages already passed, so back always retraces the way in even when a
 * step was skipped (a model that discards effort, a window with nothing under it).
 */
export interface PickerState {
  stage: PickerStage;
  /** Group being browsed at the model stage. */
  path: string[];
  trail: PickerStage[];
  /** Staged choices: nothing is sent until the confirm step. */
  model?: string;
  /** The staged effort: a level, or null for a deliberate "back to default". Absent means the
   *  effort step was not visited, which is not the same thing. */
  effort?: string | null;
  context?: number | 'full';
}

export const pickerStart: PickerState = { stage: 'model', path: [], trail: [] };

/** One step back: out of a group, then to the previous stage, then null meaning "close". */
export function pickerBack(state: PickerState): PickerState | null {
  if (state.stage === 'model' && state.path.length > 0) {
    return { ...state, path: state.path.slice(0, -1) };
  }
  const previous = state.trail[state.trail.length - 1];
  if (previous === undefined) return null;
  return { ...state, stage: previous, trail: state.trail.slice(0, -1) };
}

/** The option shown above the list at the root (e.g. "Use default"), checked when it applies. */
export interface PickerRootOption {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** The effort step: the pin the subject already holds, if any. */
export interface PickerEffort {
  /** The level in force now, "" when none is set. */
  current: string;
}

/** The context step, or null for a subject with no ceiling of its own (a job). */
export interface PickerContext {
  /** The standing agent/global cap, when one applies below the window. */
  cap?: number;
  /** The ceiling this subject already picked, if any. */
  current?: number | 'full';
  /** What the run may use right now, for the header line. */
  effective?: number;
}

/**
 * The model picker flow, presentation-only and sequential: one screen per decision (model,
 * then effort, then context ceiling), each with a back entry, and a last screen that applies
 * the whole combo at once. Nothing is sent while staging, so leaving the flow changes nothing.
 * The same flow renders as a bottom sheet (chat, jobs) or as a full settings page (agents,
 * tags): every surface that pins a model uses it, so the flow cannot diverge between them.
 */
export function useModelPickerFlow({
  title,
  models,
  activeId,
  state,
  onStateChange,
  onCommit,
  onClose,
  rootOption,
  effort,
  context,
  skipEffortOnTag = false,
  page = false,
}: {
  /** Label used in the sheet preview when the user is not inside a group. */
  title: string;
  models: ModelOption[];
  activeId: string;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  /** The staged combo, applied in one go from the confirm step. `effort: null` is a deliberate
   *  "back to default", distinct from an effort step never visited. */
  onCommit: (choice: { model: string; effort?: string | null; context?: number | 'full' }) => void;
  onClose: () => void;
  rootOption?: PickerRootOption | null;
  effort?: PickerEffort | null;
  context?: PickerContext | null;
  /** Config flows (agent, global, job) skip the effort step when the staged model is a tag: the
   *  tag's own pin always wins, so a scope-level pin would be dead config. The chat keeps the
   *  step because the session's /effort still sits above the tag. */
  skipEffortOnTag?: boolean;
  /** Full-page presentation: the page's own back entry replaces the in-flow "< Back" rows. */
  page?: boolean;
}): { preview: string; options: SheetOption[]; back: () => void } {
  const { stage, path } = state;
  const activeLabel = models.find(model => model.id === activeId)?.label ?? activeId;
  const stagedModel = state.model ?? activeId;
  const stagedEntry = models.find(model => model.id === stagedModel);
  const stagedLabel = stagedEntry?.label ?? stagedModel;
  const stagedIsTag = stagedModel.startsWith('tag:');
  const effortCurrent = effort?.current ?? '';

  const effortLevels = effort ? stagedEntry?.effortLevels ?? [] : [];
  const tiers = context
    ? contextTiers(stagedEntry?.context, context.cap, state.context ?? context.current)
    : [];

  const list = useMemo(() => {
    const prefix = path.join('/');
    const visible: ModelOption[] = [];
    const subgroupNames: string[] = [];
    for (const model of models) {
      const segments = splitGroup(model);
      const groupPath = segments.join('/');
      if (!segments.length) {
        if (!prefix) visible.push(model);
        continue;
      }
      if (groupPath === prefix) {
        visible.push(model);
      } else if (segments.length > path.length && groupPath.startsWith(prefix ? `${prefix}/` : '')) {
        // Any depth below, not just one level: a group whose models all sit in sub-groups has
        // nothing of its own to show, and requiring an exact depth hid it entirely.
        const child = segments[path.length]!;
        if (!subgroupNames.includes(child)) subgroupNames.push(child);
      }
    }
    return { visible, subgroups: subgroupNames };
  }, [models, path]);

  /** Moves to the next screen that has something to decide, else straight to the confirmation. */
  const advance = (from: PickerStage, staged: Partial<PickerState>): void => {
    const next = { ...state, ...staged, trail: [...state.trail, from] };
    const model = next.model ?? activeId;
    const entry = models.find(option => option.id === model);
    const levels = effort ? entry?.effortLevels ?? [] : [];
    // A subject that already pins an effort keeps the step even on a model with no levels: the
    // pin is dead weight there and must stay removable. Only the "default" row is shown then.
    const effortStep = effort && (levels.length > 0 || effortCurrent !== '');
    const showEffort = Boolean(effortStep) && !(skipEffortOnTag && model.startsWith('tag:'));
    const ceilings = context ? contextTiers(entry?.context, context.cap, next.context ?? context.current) : [];
    if (from === 'model' && showEffort) {
      onStateChange({ ...next, stage: 'effort' });
      return;
    }
    if ((from === 'model' || from === 'effort') && ceilings.length > 0) {
      onStateChange({ ...next, stage: 'context' });
      return;
    }
    onStateChange({ ...next, stage: 'confirm' });
  };

  const back = (): void => {
    const previous = pickerBack(state);
    if (previous === null) onClose();
    else onStateChange(previous);
  };

  /** In-flow back rows exist only in the sheet: the page has a back entry of its own. */
  const backRow = page ? [] : [{ label: '< Back', onPress: back }];

  const options: SheetOption[] = [];
  let preview = '';

  if (stage === 'model') {
    preview =
      path.length > 0
        ? `${path[path.length - 1]} · current: ${activeLabel}`
        : `${title} · current: ${activeLabel}`;
    if (path.length === 0 && rootOption) {
      options.push({ label: rootOption.label, selected: rootOption.selected, onPress: rootOption.onPress });
    }
    for (const subgroup of list.subgroups) {
      options.push({
        label: `${subgroup} ›`,
        onPress: () => onStateChange({ ...state, path: [...path, subgroup] }),
      });
    }
    for (const model of list.visible) {
      options.push({
        label: model.label,
        hint: model.id === model.label ? undefined : model.id,
        selected: model.id === activeId,
        onPress: () => advance('model', { model: model.id }),
      });
    }
    if (path.length > 0) options.push(...backRow);
  } else if (stage === 'effort') {
    preview = `Effort for ${stagedLabel} · current: ${effortCurrent || 'default'}`;
    for (const level of effortLevels) {
      options.push({
        label: level,
        selected: (state.effort ?? effortCurrent) === level,
        onPress: () => advance('effort', { effort: level }),
      });
    }
    options.push({
      label: 'default (inherit)',
      selected: (state.effort ?? effortCurrent) === '',
      onPress: () => advance('effort', { effort: null }),
    });
    if (effortLevels.length > 0) {
      options.push({
        label: `Keep current: ${effortCurrent || 'default'}`,
        onPress: () => advance('effort', { effort: undefined }),
      });
    }
    options.push(...backRow);
  } else if (stage === 'context') {
    preview = `Context for ${stagedLabel} · ${contextSummary(stagedEntry?.context, context?.effective)}`;
    for (const tier of tiers) {
      options.push({
        label: tier.label,
        selected: tier.selected,
        onPress: () => advance('context', { context: tier.ceiling ?? 'full' }),
      });
    }
    options.push({
      label: 'Keep current',
      onPress: () => advance('context', { context: undefined }),
    });
    options.push(...backRow);
  } else {
    const effortLine =
      state.effort === null
        ? 'effort: default'
        : state.effort !== undefined
          ? `effort: ${state.effort}`
          : skipEffortOnTag && stagedIsTag && stagedEntry?.effort
            ? `effort: ${stagedEntry.effort} (tag pin)`
            : null;
    const parts = [
      `model: ${stagedLabel}`,
      effortLine,
      state.context === undefined
        ? null
        : `context: ${state.context === 'full' ? 'full window' : `${state.context} tokens`}`,
    ].filter(Boolean);
    preview = parts.join(' · ');
    options.push({
      label: 'Apply',
      onPress: () => {
        onCommit({
          model: stagedModel,
          ...(state.effort === undefined ? {} : { effort: state.effort }),
          ...(state.context === undefined ? {} : { context: state.context }),
        });
        onClose();
      },
    });
    options.push(...backRow);
  }

  return { preview, options, back };
}

/** The bottom-sheet presentation of the flow: chat, and the jobs editor. */
export function ModelPickerSheet(props: Omit<Parameters<typeof useModelPickerFlow>[0], 'page'>): React.JSX.Element {
  const flow = useModelPickerFlow(props);
  return <ActionSheet preview={flow.preview} options={flow.options} onClose={props.onClose} />;
}

/**
 * The full-page presentation of the flow, for the settings stack (agents, tags): the page's
 * own back entry walks the flow the same way the hardware back key does, and closes the page
 * when the flow is at its first screen. The in-flow "< Back" rows are dropped: one back
 * affordance per page, never config content peeking under a half-open sheet.
 */
export function ModelPickerPage({
  backLabel,
  ...flowProps
}: Omit<Parameters<typeof useModelPickerFlow>[0], 'page'> & { backLabel: string }): React.JSX.Element {
  const flow = useModelPickerFlow({ ...flowProps, page: true });
  const styles = useThemedStyles(createPageStyles);
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={flow.back}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={backLabel}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{flowProps.title}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {flow.preview}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {flow.options.map(option => (
          <Pressable
            key={option.label}
            style={styles.option}
            onPress={option.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: option.selected ?? false }}
            accessibilityLabel={option.label}>
            <View style={styles.optionMain}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              {option.hint ? (
                <Text style={styles.optionHint} numberOfLines={2}>
                  {option.hint}
                </Text>
              ) : null}
            </View>
            {option.selected ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const createPageStyles = (palette: Palette) => ({
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
  body: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionMain: { flex: 1, gap: 1 },
  optionLabel: { fontSize: font.title, color: palette.text },
  optionHint: { fontSize: font.small, color: palette.textFaint },
  check: { fontSize: font.body, color: palette.accent, fontWeight: '700' as const },
});

/**
 * The model picker of the chat, built from the same list as /model on the other channels: the
 * model, then its effort, then the window this conversation may use. The staged combo is sent
 * on Apply and the server answers with the state it stored. The session's /effort sits above a
 * tag's pin, so the effort step stays even when the staged model is a tag.
 */
export function ModelSheet({
  threadId,
  state,
  onStateChange,
  onClose,
}: {
  threadId: string | null;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  onClose: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const thread = useThreadModel(threadId);

  const models = catalog.models;
  const activeModel = thread?.model ?? catalog.defaultModel;
  const defaultLabel = models.find(model => model.id === catalog.defaultModel)?.label ?? catalog.defaultModel;

  const effort = thread?.effort;
  const effortActive = effort?.supported === true && (effort.levels?.length ?? 0) > 0;

  return (
    <ModelPickerSheet
      title="Model"
      models={models}
      activeId={activeModel}
      state={state}
      onStateChange={onStateChange}
      onClose={onClose}
      onCommit={choice => {
        if (!threadId) return;
        if (choice.model !== activeModel) {
          connection.send(encodeModelSet(threadId, choice.model)).catch(() => {});
        }
        // null stages a deliberate clear: the session hands its effort back to the defaults.
        if (choice.effort !== undefined) {
          connection.send(encodeModelEffortSet(threadId, choice.effort ?? '')).catch(() => {});
        }
        if (choice.context !== undefined) {
          connection.send(encodeModelContextSet(threadId, choice.context)).catch(() => {});
        }
      }}
      // The default is the one option that exists even when no session does: picking it clears
      // the override and the session effort, which is how a conversation is handed back to the
      // server config as a whole rather than model and effort one at a time.
      rootOption={
        state.stage === 'model' && state.path.length === 0
          ? {
              label: `Use default (${defaultLabel})`,
              selected: activeModel === catalog.defaultModel || thread === null,
              onPress: () => {
                if (threadId) {
                  connection.send(encodeModelSet(threadId, catalog.defaultModel)).catch(() => {});
                  connection.send(encodeModelEffortSet(threadId, '')).catch(() => {});
                }
                onClose();
              },
            }
          : null
      }
      effort={effortActive ? { current: effort.level } : null}
      context={
        thread?.context
          ? {
              ...(thread.context.cap === undefined ? {} : { cap: thread.context.cap }),
              ...(thread.context.choice === undefined ? {} : { current: thread.context.choice }),
              effective: thread.context.effective,
            }
          : null
      }
    />
  );
}
