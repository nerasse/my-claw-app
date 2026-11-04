import React, { useMemo } from 'react';
import { ActionSheet, type SheetEntry } from './ActionSheet';
import { connection } from '../core/connection';
import { useModelCatalog, useThreadModel } from '../core/model';
import {
  encodeModelContextSet,
  encodeModelEffortSet,
} from '../core/protocol';
import { contextTiers, contextSummary, shortTokens } from '../core/context';

/** A level named `none` lands one row above `default (inherit)`, and the two read alike while
 *  meaning opposites: `none` pins "do not reason", the other hands the choice back to the
 *  defaults. Only the level is spelled out; the inherit row is left as it was. */
function effortLabel(level: string): string {
  return level === 'none' ? 'none (no reasoning)' : level;
}

/**
 * The effort and window of the conversation on screen, without changing its model. A tag is
 * indivisible in the picker, so it cannot refine the tag's own pins; this sheet is the other
 * half of the contract: the session still sits above the tag, and these two rows are how an
 * override is set, moved and removed from the menu. Sends one frame per row and closes.
 */
export function ModelTuneSheet({
  threadId,
  onClose,
}: {
  threadId: string | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const catalog = useModelCatalog();
  const thread = useThreadModel(threadId);

  const effort = thread?.effort;
  const effortLevels = effort?.supported === true ? (effort.levels ?? []) : [];
  const effortActive = effortLevels.length > 0;

  const context = thread?.context;
  const tiers = useMemo(
    () =>
      context
        ? contextTiers(context.raw, context.cap, context.choice)
        : [],
    [context],
  );

  const modelLabel = useMemo(() => {
    if (!thread) return null;
    return catalog.models.find(model => model.id === thread.model)?.label ?? thread.model;
  }, [catalog.models, thread]);

  if (!threadId || !thread) return null;

  const options: SheetEntry[] = [];

  // Effort rows: only when the model supports it. The first row says what is in force.
  if (effortActive) {
    options.push(
      {
        type: 'note' as const,
        text: `Effort · current: ${effort!.level ? effortLabel(effort!.level) : 'default (inherit)'}`,
      },
      ...effortLevels.map(level => ({
        label: effortLabel(level),
        selected: effort!.level === level,
        onPress: () => {
          connection.send(encodeModelEffortSet(threadId, level)).catch(() => {});
          onClose();
        },
      })),
      {
        label: 'default (inherit)',
        selected: effort!.level === '',
        onPress: () => {
          connection.send(encodeModelEffortSet(threadId, '')).catch(() => {});
          onClose();
        },
      },
      { type: 'separator' as const },
    );
  } else {
    options.push(
      { type: 'note' as const, text: 'Effort · not supported by this model' },
      { type: 'separator' as const },
    );
  }

  // Cap rows: the full window and the lowered ceilings, when there is something to arbitrate.
  options.push({
    type: 'note' as const,
    text: context ? `Context · ${contextSummary(context.raw, context.effective)}` : 'Context',
  });
  if (tiers.length > 0) {
    options.push(
      ...tiers.map(tier => ({
        label: tier.label,
        selected: tier.selected,
        onPress: () => {
          connection
            .send(encodeModelContextSet(threadId, tier.ceiling ?? 'full'))
            .catch(() => {});
          onClose();
        },
      })),
    );
  } else if (context) {
    options.push({
      label: `Full: ${shortTokens(context.raw)}`,
      selected: true,
      onPress: () => {
        connection.send(encodeModelContextSet(threadId, 'full')).catch(() => {});
        onClose();
      },
    });
  }

  return (
    <ActionSheet
      preview={modelLabel ? `Tune ${modelLabel}` : 'Tune model'}
      options={options}
      onClose={onClose}
    />
  );
}
