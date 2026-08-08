import React, { useMemo } from 'react';
import { ActionSheet, type SheetOption } from './ActionSheet';
import { connection } from '../core/connection';
import { useModelCatalog, useThreadModel } from '../core/model';
import { contextSummary, contextTiers } from '../core/context';
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
  effort?: string;
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

/** The effort step, or null for a subject that has no effort of its own (an agent pin, a job). */
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
 * The model picker, presentation-only and sequential: one screen per decision (model, then
 * effort, then context ceiling), each with a back entry, and a last screen that applies the
 * whole combo at once. Nothing is sent while staging, so leaving the sheet changes nothing.
 *
 * Every surface that pins a model renders this one component (chat, agent defaults, tags, jobs),
 * so the flow cannot diverge between them; the steps a subject does not have are skipped.
 */
export function ModelPickerSheet({
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
}: {
  /** Label used in the sheet preview when the user is not inside a group. */
  title: string;
  models: ModelOption[];
  activeId: string;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  /** The staged combo, applied in one go from the confirm step. */
  onCommit: (choice: { model: string; effort?: string; context?: number | 'full' }) => void;
  onClose: () => void;
  rootOption?: PickerRootOption | null;
  effort?: PickerEffort | null;
  context?: PickerContext | null;
}): React.JSX.Element {
  const { stage, path } = state;
  const activeLabel = models.find(model => model.id === activeId)?.label ?? activeId;
  const stagedModel = state.model ?? activeId;
  const stagedEntry = models.find(model => model.id === stagedModel);
  const stagedLabel = stagedEntry?.label ?? stagedModel;

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
    const ceilings = context ? contextTiers(entry?.context, context.cap, next.context ?? context.current) : [];
    if (from === 'model' && levels.length > 0) {
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
    if (path.length > 0) options.push({ label: '< Back', onPress: back });
  } else if (stage === 'effort') {
    preview = `Effort for ${stagedLabel} · current: ${effort?.current || 'not set'}`;
    for (const level of effortLevels) {
      options.push({
        label: level,
        selected: (state.effort ?? effort?.current) === level,
        onPress: () => advance('effort', { effort: level }),
      });
    }
    options.push({
      label: `Keep current: ${effort?.current || 'not set'}`,
      onPress: () => advance('effort', { effort: undefined }),
    });
    options.push({ label: '< Back', onPress: back });
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
    options.push({ label: '< Back', onPress: back });
  } else {
    const parts = [
      `model: ${stagedLabel}`,
      state.effort ? `effort: ${state.effort}` : null,
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
    options.push({ label: '< Back', onPress: back });
  }

  return <ActionSheet preview={preview} options={options} onClose={onClose} />;
}

/**
 * The model picker of the chat, built from the same list as /model on the other channels: the
 * model, then its effort, then the window this conversation may use. The staged combo is sent
 * on Apply and the server answers with the state it stored.
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
        if (choice.effort !== undefined) {
          connection.send(encodeModelEffortSet(threadId, choice.effort)).catch(() => {});
        }
        if (choice.context !== undefined) {
          connection.send(encodeModelContextSet(threadId, choice.context)).catch(() => {});
        }
      }}
      // The default is the one option that exists even when no session does: picking it clears
      // the override, which is how a conversation is handed back to the server config.
      rootOption={
        state.stage === 'model' && state.path.length === 0
          ? {
              label: `Use default (${defaultLabel})`,
              selected: activeModel === catalog.defaultModel || thread === null,
              onPress: () => {
                if (threadId) connection.send(encodeModelSet(threadId, catalog.defaultModel)).catch(() => {});
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
