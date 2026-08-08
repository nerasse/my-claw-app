import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionSheet, type SheetOption } from './ActionSheet';
import { connection } from '../core/connection';
import { useModelCatalog, useThreadModel } from '../core/model';
import {
  encodeModelEffortSet,
  encodeModelSet,
  type ModelOption,
} from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

function splitGroup(model: ModelOption): string[] {
  return (model.group ?? '').split('/').map(part => part.trim()).filter(Boolean);
}

export interface PickerEffort {
  level: string;
  levels: string[];
  onChange: (level: string) => void;
}

/** The option shown above the list at the root (e.g. "Use default"), checked when it applies. */
export interface PickerRootOption {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * The model picker, presentation-only: models, current id, the group stack and the two actions
 * (pick, root option) come in as props. The chat sheet and the agent settings page both render
 * it, so groups, the checkmark and the back-walk behaviour cannot diverge between them.
 */
export function ModelPickerSheet({
  title,
  models,
  activeId,
  path,
  onPathChange,
  onSelect,
  onClose,
  rootOption,
  effort,
}: {
  /** Label used in the sheet preview when the user is not inside a group. */
  title: string;
  models: ModelOption[];
  activeId: string;
  /** Group being browsed, owned by the shell so the hardware back can walk out of it. */
  path: string[];
  onPathChange: (path: string[]) => void;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  rootOption?: PickerRootOption | null;
  effort?: PickerEffort | null;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const activeLabel = models.find(model => model.id === activeId)?.label ?? activeId;

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

  const options: SheetOption[] = [];

  if (path.length === 0 && rootOption) {
    options.push({
      label: rootOption.label,
      selected: rootOption.selected,
      onPress: rootOption.onPress,
    });
  }

  for (const subgroup of list.subgroups) {
    options.push({
      label: `${subgroup} ›`,
      onPress: () => onPathChange([...path, subgroup]),
    });
  }

  for (const model of list.visible) {
    options.push({
      label: model.label,
      hint: model.id === model.label ? undefined : model.id,
      selected: model.id === activeId,
      onPress: () => onSelect(model.id),
    });
  }

  if (path.length > 0) {
    options.push({ label: '< Back', onPress: () => onPathChange(path.slice(0, -1)) });
  }

  return (
    <ActionSheet
      preview={
        path.length > 0
          ? `${path[path.length - 1]} · current: ${activeLabel}`
          : `${title} · current: ${activeLabel}`
      }
      options={options}
      onClose={onClose}>
      {effort && effort.levels.length > 0 ? (
        <View style={styles.effortRow}>
          {effort.levels.map(level => {
            const selected = level === effort.level;
            return (
              <Pressable
                key={level}
                style={[styles.effortChip, selected && styles.effortChipActive]}
                onPress={() => effort.onChange(level)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Reasoning effort ${level}`}>
                <Text style={[styles.effortText, selected && styles.effortTextActive]}>{level}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ActionSheet>
  );
}

/**
 * The model picker of the chat, built from the same list as /model on the other channels.
 * Groups fold into submenus; the current model carries a checkmark; effort chips only appear
 * for a model that actually accepts them. Nothing is applied locally: the server answers
 * with the state it stored, and the sheet renders that.
 */
export function ModelSheet({
  threadId,
  path,
  onPathChange,
  onClose,
}: {
  threadId: string | null;
  /** Group being browsed, owned by the shell so the hardware back can walk out of it. */
  path: string[];
  onPathChange: (path: string[]) => void;
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
      path={path}
      onPathChange={onPathChange}
      onClose={onClose}
      onSelect={modelId => {
        if (!threadId) return;
        connection.send(encodeModelSet(threadId, modelId)).catch(() => {});
      }}
      // The default is the one option that exists even when no session does: picking it clears
      // the override, which is how a conversation is handed back to the server config.
      rootOption={
        path.length === 0
          ? {
              label: `Use default (${defaultLabel})`,
              selected: activeModel === catalog.defaultModel || thread === null,
              onPress: () => {
                if (!threadId) return;
                connection.send(encodeModelSet(threadId, catalog.defaultModel)).catch(() => {});
              },
            }
          : null
      }
      effort={
        effortActive && threadId
          ? {
              level: effort.level,
              levels: effort.levels,
              onChange: level => {
                connection.send(encodeModelEffortSet(threadId, level)).catch(() => {});
              },
            }
          : null
      }
    />
  );
}

const createStyles = (palette: Palette) => ({
  effortRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
    paddingBottom: space.xs,
  },
  effortChip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
  },
  effortChipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  effortText: { fontSize: font.meta, color: palette.textMuted },
  effortTextActive: { color: palette.accentText, fontWeight: '600' as const },
});
