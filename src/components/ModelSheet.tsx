import React, { useMemo, useState } from 'react';
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

/**
 * The model picker of the app, built from the same list as /model on the other channels.
 * Groups fold into submenus; the current model carries a checkmark; effort chips only appear
 * for a model that actually accepts them. Nothing is applied locally: the server answers
 * with the state it stored, and the sheet renders that.
 */
export function ModelSheet({
  threadId,
  onClose,
}: {
  threadId: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const catalog = useModelCatalog();
  const thread = useThreadModel(threadId);
  const [path, setPath] = useState<string[]>([]);

  const models = catalog.models;
  const activeModel = thread?.model ?? catalog.defaultModel;
  const defaultLabel = models.find(model => model.id === catalog.defaultModel)?.label ?? catalog.defaultModel;
  const activeLabel = models.find(model => model.id === activeModel)?.label ?? activeModel;

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

  // The default is the one option that exists even when no session does: picking it clears
  // the override, which is how a conversation is handed back to the server config.
  if (path.length === 0) {
    options.push({
      label: `Use default (${defaultLabel})`,
      selected: activeModel === catalog.defaultModel || thread === null,
      onPress: () => {
        if (!threadId) return;
        connection.send(encodeModelSet(threadId, catalog.defaultModel)).catch(() => {});
      },
    });
  }

  for (const subgroup of list.subgroups) {
    options.push({
      label: `${subgroup} ›`,
      onPress: () => setPath(pathNow => [...pathNow, subgroup]),
    });
  }

  for (const model of list.visible) {
    options.push({
      label: model.label,
      hint: model.id === model.label ? undefined : model.id,
      selected: model.id === activeModel,
      onPress: () => {
        if (!threadId) return;
        connection.send(encodeModelSet(threadId, model.id)).catch(() => {});
      },
    });
  }

  if (path.length > 0) {
    options.push({ label: '< Back', onPress: () => setPath(pathNow => pathNow.slice(0, -1)) });
  }

  const effort = thread?.effort;
  const effortActive = effort?.supported === true && (effort.levels?.length ?? 0) > 0;

  return (
    <ActionSheet
      preview={
        path.length > 0
          ? `${path[path.length - 1]} — current: ${activeLabel}`
          : `Model — current: ${activeLabel}`
      }
      options={options}
      onClose={onClose}>
      {effortActive && threadId ? (
        <View style={styles.effortRow}>
          {effort.levels.map(level => {
            const selected = level === effort.level;
            return (
              <Pressable
                key={level}
                style={[styles.effortChip, selected && styles.effortChipActive]}
                onPress={() => connection.send(encodeModelEffortSet(threadId, level)).catch(() => {})}
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
