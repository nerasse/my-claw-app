import { CheckIcon, ChevronIcon, CloseIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { InstructionEntry, WorkspaceEntry } from '../core/protocol';
import type { LayerState } from '../core/instructions';
import { layerIsDirty } from '../core/instructions';
import { layerOfFile, sourceStatusOf } from '../core/layers';
import { font, radius, space, type Palette, useTheme, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

interface LadderStep {
  left: string;
  right: string;
  mark: 'win' | 'blocked' | 'empty';
  broken?: boolean;
}

/**
 * One file's resolution, editable. The ladder is the feature: inherit x off is unreadable in a
 * picker, so the screen shows the four steps with the winning one marked, and the source list
 * changes only what step 2 is. A save answers with the fresh listing, so the ladder redraws as
 * its own proof -- the screen never closes on save, the user has to see the ladder move.
 */
export function InstructionLayerScreen({
  layer,
  entry,
  entries,
  workspaces,
  files,
  agentLayers,
  saving,
  error,
  backLabel,
  onBack,
  onChange,
  onSave,
}: {
  layer: LayerState;
  entry: InstructionEntry;
  entries: InstructionEntry[];
  /** Every workspace, "default" included: the source list reads its paths from here. */
  workspaces: WorkspaceEntry[];
  files: string[];
  agentLayers: Array<{ agent: string; layers: string[] }>;
  saving: boolean;
  error: string | null;
  backLabel: string;
  onBack: () => void;
  onChange: (patch: { inherit?: string; off?: boolean }) => void;
  onSave: (applyToAll: boolean) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const [applyToAll, setApplyToAll] = useState(false);

  const workspaceKeys = workspaces.map(w => w.key);
  const source = sourceStatusOf(entry, workspaceKeys);
  const sourceBroken = source.kind === 'workspace' && (source.removed || source.self);
  // A broken source never blocks the save (the server accepts it, the list paints it red): the
  // drop button fixes it, the save is the owner's choice -- the repo shows, it does not forbid.
  const dirty = layerIsDirty(layer, entry);
  const canSave = dirty && !saving;

  const layerName = layerOfFile(layer.file);
  const agentsCutting = agentLayers.filter(a => !a.layers.includes(layerName));

  const sourceStep: LadderStep =
    source.kind === 'builtin'
      ? { left: 'the shipped template', right: 'the source set below', mark: 'empty' }
      : source.kind === 'none'
        ? { left: 'nothing', right: 'the source set below', mark: 'empty' }
        : source.kind === 'workspace'
          ? {
              left: `${source.key}/${layer.file}`,
              right: 'the source set below',
              mark: 'empty',
              broken: source.removed || source.self,
            }
          : { left: `default/${layer.file}`, right: 'the source set below', mark: 'empty' };

  const steps: LadderStep[] = [
    { left: `${layer.workspace}/${layer.file}`, right: "this workspace's own file", mark: 'empty' },
    sourceStep,
  ];
  if (source.kind !== 'builtin' && source.kind !== 'none') {
    steps.push({ left: 'the shipped template', right: 'last resort', mark: 'empty' });
  }
  if (source.kind !== 'none') {
    steps.push({ left: 'nothing', right: 'the layer is left out of the prompt', mark: 'empty' });
  }
  if (entry.origin === 'own') steps[0] = { ...steps[0]!, mark: 'win' };
  else if (entry.origin === 'inherited') steps[1] = { ...steps[1]!, mark: 'win' };
  else if (entry.origin === 'off') steps[0] = { ...steps[0]!, mark: 'blocked' };
  else if (source.kind === 'builtin' || source.kind === 'none') steps[1] = { ...steps[1]!, mark: 'win' };
  else steps[2] = { ...steps[2]!, mark: 'win' };

  const ownFileExists = entry.origin === 'off' ? entry.bytes > 0 : entries.find(e => e.workspace === layer.workspace && e.file === layer.file)?.origin === 'own';
  const sourceNote = layer.off
    ? 'off: nothing from this layer reaches the prompt, whatever the steps say'
    : source.kind === 'none' && !ownFileExists
      ? 'no step has content: this workspace gets no file at all'
      : 'the first step that has content wins';

  // The default has its own row at the top of the ladder, so it must not come back down the
  // list: the listing carries it as a `default: true` entry and it showed up twice.
  const otherWorkspaces = workspaces.filter(
    w => w.key !== layer.workspace && !w.default && w.key !== 'default',
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={backLabel}>
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityLabel={`${layer.file} layer`}>
            {layer.file} layer
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {layer.workspace} · what the agent reads for this layer
          </Text>
        </View>
        <Pressable
          onPress={() => onSave(applyToAll)}
          disabled={!canSave}
          style={[styles.saveButton, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={saving ? 'Saving layer' : layer.off ? 'Skip this layer' : 'Save layer'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>
            {saving ? '...' : layer.off ? 'Skip this layer' : 'Save'}
          </Text>
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Instructions error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>what the agent reads now</Text>
          <View
            style={[styles.card, layer.off ? styles.cardRemoved : null]}
            accessible
            accessibilityLabel={steps
              .map(s => `${s.left}${s.mark === 'win' ? ', wins' : ''}${s.mark === 'blocked' ? ', blocked' : ''}`)
              .join(' then ')}>
            {steps.map((step, index) => (
              <View key={index}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.ladderRow}>
                  <View style={styles.ladderMain}>
                    <Text style={styles.ladderLeft} numberOfLines={1}>
                      {step.left}
                    </Text>
                    <Text style={[styles.ladderRight, step.broken ? styles.textDanger : null]} numberOfLines={1}>
                      {step.right}
                    </Text>
                  </View>
                  {step.mark === 'win' ? (
                    <CheckIcon size={16} tone="accent" />
                  ) : step.mark === 'blocked' ? (
                    <CloseIcon size={16} color={palette.danger} />
                  ) : (
                    <Text style={styles.glyph}>–</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
          <Text style={[styles.note, layer.off ? styles.noteDanger : null]}>{sourceNote}</Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>this layer</Text>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, !layer.off ? styles.chipActive : styles.chipIdle]}
              onPress={() => onChange({ off: false })}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ selected: !layer.off, disabled: saving }}
              accessibilityLabel="Read this layer">
              <Text style={!layer.off ? styles.chipTextActive : styles.chipTextIdle}>Read</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, layer.off ? styles.chipActiveDanger : styles.chipIdle]}
              onPress={() => onChange({ off: true })}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ selected: layer.off, disabled: saving }}
              accessibilityLabel="Skip this layer">
              <Text style={layer.off ? styles.chipTextDanger : styles.chipTextIdle}>Skipped</Text>
            </Pressable>
          </View>
          {layer.off ? (
            <Text style={[styles.note, styles.noteDanger]}>
              {ownFileExists
                ? `${layer.workspace}/${layer.file} stays on disk and stops being read · nothing on the file itself will say so`
                : `this layer is dropped from the prompt, here and for every agent on ${layer.workspace}`}
            </Text>
          ) : (
            <Text style={styles.note}>the steps above decide what the agent gets</Text>
          )}
          {layer.off && layer.file === 'CORE.md' ? (
            <Text style={[styles.note, styles.noteDanger]} accessibilityLabel="Warning CORE.md carries the safety directives">
              CORE.md carries the safety directives · skipping it removes them from every run on {layer.workspace}
            </Text>
          ) : null}
        </View>

        {sourceBroken ? (
          <View style={styles.category}>
            <Text style={styles.section}>no longer valid</Text>
            <View style={[styles.card, styles.cardRemoved]}>
              <View style={styles.ladderRow}>
                <View style={styles.ladderMain}>
                  <Text style={styles.ladderLeft}>{source.kind === 'workspace' ? source.key : ''}</Text>
                  <Text style={[styles.ladderRight, styles.textDanger]}>
                    {source.kind === 'workspace' && source.removed
                      ? 'not in config.workspaces anymore'
                      : 'a workspace cannot be its own source'}
                  </Text>
                </View>
                <Pressable
                  style={styles.dropButton}
                  onPress={() => onChange({ inherit: 'default' })}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Drop removed source ${source.kind === 'workspace' ? source.key : ''}`}>
                  <Text style={styles.dropText}>drop</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>read instead, when {layer.workspace} has no {layer.file}</Text>
          <View style={styles.card}>
            {layer.workspace !== 'default' ? (
              <>
                <SourceRow
                  title="the default workspace"
                  subtitle={workspaces.find(w => w.key === 'default')?.path ?? ''}
                  selected={layer.inherit === 'default'}
                  disabled={saving}
                  onPress={() => onChange({ inherit: 'default' })}
                  label="Read from the default workspace instead"
                />
                <View style={styles.separator} />
              </>
            ) : null}
            <SourceRow
              title="the shipped template"
              subtitle="ships with the server · never empty"
              selected={layer.inherit === 'builtin'}
              disabled={saving}
              onPress={() => onChange({ inherit: 'builtin' })}
              label="Read the shipped template instead"
            />
            <View style={styles.separator} />
            <SourceRow
              title="nothing"
              subtitle="the layer is dropped from the prompt"
              selected={layer.inherit === 'none'}
              disabled={saving}
              onPress={() => onChange({ inherit: 'none' })}
              label="Read nothing instead"
            />
            {otherWorkspaces.map(workspace => (
              <View key={workspace.key}>
                <View style={styles.separator} />
                <SourceRow
                  title={workspace.key}
                  subtitle={workspace.path}
                  selected={layer.inherit === workspace.key}
                  disabled={saving}
                  onPress={() => onChange({ inherit: workspace.key })}
                  label={`Read from workspace ${workspace.key} instead`}
                />
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            {ownFileExists
              ? `${layer.workspace} owns this file today, so this only applies if you delete it`
              : `${layer.workspace} has no ${layer.file}, so this is what the agent reads right now`}
          </Text>
        </View>

        {files.length > 1 ? (
          <Pressable
            style={styles.applyRow}
            onPress={() => setApplyToAll(!applyToAll)}
            disabled={saving}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: applyToAll, disabled: saving }}
            accessibilityLabel={`Apply to the ${files.length} files of ${layer.workspace}`}>
            <Text style={[styles.checkbox, applyToAll ? styles.checkboxOn : null]}>
              {applyToAll ? '☑' : '☐'}
            </Text>
            <View style={styles.applyMain}>
              <Text style={styles.applyLabel}>apply to the {files.length} files of {layer.workspace}</Text>
              <Text style={styles.note}>
                sends {files.length} separate changes · each file keeps its own setting after
              </Text>
            </View>
          </Pressable>
        ) : null}

        {agentsCutting.length > 0 ? (
          <View style={styles.category}>
            <Text style={styles.section}>also cut by an agent</Text>
            <View style={styles.card}>
              {agentsCutting.map((agent, index) => (
                <View key={agent.agent}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.ladderRow}>
                    <View style={styles.ladderMain}>
                      <Text style={styles.ladderLeft}>{agent.agent}</Text>
                      <Text style={styles.ladderRight} numberOfLines={1}>
                        {`reads ${agent.layers.join(', ') || 'nothing'} · never ${layerName}`}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              these agents list their layers in their own file · turning this one back on will not give it to them
            </Text>
          </View>
        ) : null}

        {dirty ? <Text style={styles.note}>not applied yet</Text> : null}
      </ScrollView>
    </View>
  );
}

function SourceRow({
  title,
  subtitle,
  selected,
  disabled,
  onPress,
  label,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  label: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      style={styles.ladderRow}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}>
      <View style={styles.ladderMain}>
        <Text style={[styles.ladderLeft, selected ? styles.ladderSelected : null]}>{title}</Text>
        <Text style={styles.ladderRight} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {selected ? <CheckIcon size={16} tone="accent" /> : null}
    </Pressable>
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
  saveButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { color: palette.surface, fontSize: font.small, fontWeight: '600' as const },
  saveTextOff: { color: palette.textFaint, fontSize: font.small },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  cardRemoved: { borderColor: palette.danger },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  ladderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  ladderMain: { flex: 1, gap: 2 },
  ladderLeft: { fontSize: font.body, color: palette.text },
  ladderRight: { fontSize: font.small, color: palette.textMuted },
  ladderSelected: { color: palette.accent, fontWeight: '600' as const },
  textDanger: { color: palette.danger },
  glyph: { fontSize: 16, width: 22, color: palette.textFaint, textAlign: 'center' as const },
  glyphWin: { color: palette.accent },
  glyphBlocked: { color: palette.danger },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  noteDanger: { color: palette.danger },
  chips: { flexDirection: 'row' as const, gap: space.sm },
  chip: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipActiveDanger: { backgroundColor: palette.danger, borderColor: palette.danger },
  chipIdle: { backgroundColor: palette.surface },
  chipTextActive: { color: palette.surface, fontSize: font.small, fontWeight: '600' as const },
  chipTextDanger: { color: palette.surface, fontSize: font.small, fontWeight: '600' as const },
  chipTextIdle: { color: palette.textMuted, fontSize: font.small },
  dropButton: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  dropText: { color: palette.danger, fontSize: font.small },
  applyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  applyMain: { flex: 1, gap: 2 },
  applyLabel: { fontSize: font.body, color: palette.text },
  checkbox: { fontSize: 18, width: 22, color: palette.textFaint },
  checkboxOn: { color: palette.accent },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
