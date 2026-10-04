import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useModelCatalog } from '../core/model';
import { ScopeEditorScreen } from './ScopeEditorScreen';
import { WorkspacePickerScreen } from './WorkspacePickerScreen';
import { ModelPickerSheet, pickerBack, pickerStart, type PickerState } from '../components/ModelSheet';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { scheduleInvalid } from '../core/cron';
import type { JobEntry, JobScope, JobScopeMode, SkillEntry, ToolEntry, McpEntry, WorkspaceEntry, JobFieldsOut } from '../core/protocol';
import { useLayerFrame } from '../core/layout';
import { CloseButton } from '../components/CloseButton';
import { keyLayerProps } from '../core/keyNav';

export interface JobDraft {
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  silent: boolean;
  model: string;
  effort: string;
  workspace: string;
  skills: JobScope;
  mcp: JobScope;
  tools: JobScope;
  subagents: boolean;
  browser: boolean;
  followUp: boolean;
  followUpPrompt: string;
}

function draftOf(job: JobEntry | null): JobDraft {
  if (!job) {
    return {
      name: '',
      prompt: '',
      schedule: 'every 24h',
      enabled: true,
      silent: false,
      model: '',
      effort: '',
      workspace: '',
      skills: { mode: 'inherit' },
      mcp: { mode: 'inherit' },
      tools: { mode: 'inherit' },
      subagents: true,
      browser: true,
      followUp: false,
      followUpPrompt: '',
    };
  }
  const schedule = (() => {
    if (job.schedule.kind === 'interval') return `every ${job.schedule.minutes ?? 60}m`;
    if (job.schedule.kind === 'cron') return job.schedule.expr ?? '';
    return job.schedule.runAt ?? '';
  })();
  const scopeOf = (mode: JobScopeMode, names?: string[]): JobScope =>
    mode === 'list' ? { mode, names: names ?? [] } : { mode };
  return {
    name: job.name,
    prompt: job.prompt,
    schedule,
    enabled: job.enabled,
    silent: job.silent === true,
    model: job.model ?? '',
    effort: job.effort ?? '',
    workspace: job.workspace ?? '',
    skills: scopeOf(job.skillsMode, job.skills),
    mcp: scopeOf(job.mcpMode, job.mcp),
    tools: scopeOf(job.toolsMode, job.tools),
    subagents: job.subagents === true,
    browser: job.browser === true,
    followUp: job.followUp === true,
    followUpPrompt: job.followUpPrompt ?? '',
  };
}

/**
 * The scheduled task editor. Like the agent file editor: structured fields, the schedule parsed
 * with the server's own rules, and the model/workspace/scope pickers fed by the live catalogs
 * with entries that match nothing painted red — except tag references, which remain valid and
 * fall back to Default when their definition is absent. A save never blocks on catalog membership,
 * the job is the truth. The scope rows open the same ScopeEditorScreen the agents use.
 */
export function JobsEditorScreen({
  job,
  error,
  saving,
  skills,
  tools,
  mcpServers,
  workspaces,
  onBack,
  onSave,
  onDelete,
  deleting,
}: {
  /** The job being edited, or null for a new one. */
  job: JobEntry | null;
  error: string | null;
  saving: boolean;
  skills: SkillEntry[];
  tools: ToolEntry[];
  mcpServers: McpEntry[];
  workspaces: WorkspaceEntry[];
  onBack: () => void;
  onSave: (fields: JobFieldsOut) => void;
  onDelete: (job: JobEntry) => void;
  /**
   * Whether the shell is asking the owner to confirm the deletion of this job. The sheet is the
   * shell's, drawn over this screen, and this screen holds the back key: without knowing, it
   * would answer the press by closing itself and leave the question hanging over the jobs list.
   */
  deleting: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const layerFrame = useLayerFrame();
  const insets = useSafeAreaInsets();
  useDismissKeyboard();
  const catalog = useModelCatalog();
  const [draft, setDraft] = useState<JobDraft>(() => draftOf(job));
  const [scopeEditor, setScopeEditor] = useState<'skills' | 'mcp' | 'tools' | null>(null);
  /** The model picker is a sheet over the editor; its steps are walked like the chat's. */
  const [modelPicker, setModelPicker] = useState(false);
  const [pickerState, setPickerState] = useState<PickerState>(pickerStart);
  const [workspacePicker, setWorkspacePicker] = useState(false);

  // The editor owns its layers, so the hardware back walks them before leaving the editor:
  // a press from the scope picker must close the picker, not the whole editor.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Not ours to answer: declining hands the press to the shell, which owns that sheet.
      if (deleting) return false;
      if (scopeEditor) {
        setScopeEditor(null);
        return true;
      }
      if (modelPicker) {
        const previous = pickerBack(pickerState);
        if (previous) {
          setPickerState(previous);
          return true;
        }
        setModelPicker(false);
        return true;
      }
      if (workspacePicker) {
        setWorkspacePicker(false);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [pickerState, modelPicker, onBack, scopeEditor, workspacePicker, deleting]);

  const invalid = scheduleInvalid(draft.schedule);
  const promptMissing = !draft.prompt.trim();
  const canSave = !invalid && !promptMissing && !saving;
  const modelKnown = !draft.model.trim() || draft.model.startsWith('tag:') || catalog.models.some(model => model.id === draft.model);
  const workspaceKnown = !draft.workspace.trim() || workspaces.some(entry => entry.key === draft.workspace);

  const scopeOfKind = (kind: 'skills' | 'mcp' | 'tools'): JobScope => draft[kind];
  const unknownOfKind = (kind: 'skills' | 'mcp' | 'tools'): string[] => {
    if (!job) return [];
    if (kind === 'skills') return job.unknownSkills;
    if (kind === 'mcp') return job.unknownMcp;
    return job.unknownTools;
  };
  const availableOfKind = (kind: 'skills' | 'mcp' | 'tools'): Array<{ name: string; description: string }> => {
    if (kind === 'skills') return skills.map(skill => ({ name: skill.name, description: skill.description }));
    if (kind === 'mcp') return mcpServers.map(server => ({ name: server.name, description: `mcp · ${server.state}` }));
    return tools.map(tool => ({ name: tool.name, description: tool.description }));
  };
  const setScope = (kind: 'skills' | 'mcp' | 'tools', scope: JobScope): void => {
    setDraft(current => ({ ...current, [kind]: scope }));
  };

  if (scopeEditor) {
    const kind = scopeEditor;
    return (
      <ScopeEditorScreen
        title={kind === 'skills' ? 'Skills' : kind === 'mcp' ? 'MCP servers' : 'Tools'}
        subtitle={`${job ? job.name : 'new job'} · ${kind}`}
        kind={kind}
        available={availableOfKind(kind)}
        mode={scopeOfKind(kind).mode}
        names={scopeOfKind(kind).names ?? []}
        unknown={unknownOfKind(kind)}
        unsetLabel="Inherit"
        unsetValue="inherit"
        error={null}
        saving={false}
        onBack={() => setScopeEditor(null)}
        onSave={(mode, names) => {
          setScope(kind, { mode: mode as JobScopeMode, names });
          setScopeEditor(null);
        }}
      />
    );
  }

  if (modelPicker) {
    return (
      <ModelPickerSheet
        title="Model"
        models={catalog.models}
        activeId={draft.model}
        state={pickerState}
        onStateChange={setPickerState}
        onClose={() => setModelPicker(false)}
        onCommit={choice => {
          // The effort travels with the model: null clears the pin, a level pins it.
          setDraft(current => ({
            ...current,
            model: choice.model,
            ...(choice.effort === undefined ? {} : { effort: choice.effort ?? '' }),
          }));
          setModelPicker(false);
        }}
        effort={{ current: draft.effort }}
        // For a job an absent model is not the server default but the cron agent's: the option
        // says what it means here, and clearing is exactly how the override is removed.
        rootOption={{
          label: 'Inherit (no override)',
          selected: !draft.model,
          onPress: () => {
            setDraft(current => ({ ...current, model: '', effort: '' }));
            setModelPicker(false);
          },
        }}
      />
    );
  }

  if (workspacePicker) {
    return (
      <WorkspacePickerScreen
        workspaces={workspaces}
        current={draft.workspace || null}
        unknown={!workspaceKnown && Boolean(draft.workspace)}
        error={null}
        saving={false}
        subtitle="where this job runs its sessions"
        backLabel="Back to jobs editor"
        onBack={() => setWorkspacePicker(false)}
        onSave={key => {
          setDraft(current => ({ ...current, workspace: key ?? '' }));
          setWorkspacePicker(false);
        }}
      />
    );
  }

  const scopeRow = (kind: 'skills' | 'mcp' | 'tools', label: string, hint: string, index: number): React.JSX.Element => {
    const scope = scopeOfKind(kind);
    const unknown = unknownOfKind(kind);
    const removed = unknown.filter(name => (scope.names ?? []).includes(name));
    const value =
      scope.mode === 'inherit'
        ? hint
        : scope.mode === 'all'
          ? 'all'
          : (scope.names ?? []).length === 0
            ? 'none'
            : (scope.names ?? []).join(', ');
    return (
      <View>
        {index > 0 ? <View style={styles.separator} /> : null}
        <Pressable
          style={[styles.row, styles.link]}
          onPress={() => setScopeEditor(kind)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${kind} scope`}>
          <Text style={styles.rowKey}>{label}</Text>
          <View style={styles.valueArea}>
            <Text style={[styles.rowValue, removed.length > 0 ? styles.valueRemoved : null]} numberOfLines={1}>
              {value}
            </Text>
            {removed.length > 0 ? (
              <Text style={styles.removedHint} numberOfLines={1}>
                {`removed: ${removed.join(', ')}`}
              </Text>
            ) : null}
          </View>
          <Text style={styles.linkGlyph}>›</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View {...keyLayerProps('page')} style={[StyleSheet.absoluteFill, styles.screen, layerFrame]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to jobs">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{job ? job.name : 'New job'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {job ? job.schedule.display : 'a prompt on a schedule'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            // The disabled prop stops the touch, not a stray programmatic press (tests, AT).
            if (!canSave) return;
            onSave(toFields(job, draft));
          }}
          disabled={!canSave}
          style={[styles.saveButton, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={saving ? 'Saving job' : 'Save job'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>{saving ? '...' : 'Save'}</Text>
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Jobs editor error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>job</Text>
          <TextInput
            style={styles.input}
            value={draft.name}
            onChangeText={name => setDraft(current => ({ ...current, name }))}
            placeholder="a name for this task"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            accessibilityLabel="Job name"
          />
          <View style={styles.chips}>
            {(
              [
                [true, 'Enabled'],
                [false, 'Paused'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={label}
                onPress={() => setDraft(current => ({ ...current, enabled: value }))}
                style={[styles.chip, draft.enabled === value ? styles.chipActive : styles.chipIdle]}
                accessibilityRole="button"
                accessibilityLabel={`Job ${label}`}
                accessibilityState={{ selected: draft.enabled === value }}>
                <Text style={draft.enabled === value ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {/* Notifications, not delivery: a silent job still runs and still writes its result. */}
          <View style={styles.chips}>
            {(
              [
                [false, 'Notify'],
                [true, 'Silent'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={label}
                onPress={() => setDraft(current => ({ ...current, silent: value }))}
                style={[styles.chip, draft.silent === value ? styles.chipActive : styles.chipIdle]}
                accessibilityRole="button"
                accessibilityLabel={`Job ${label}`}
                accessibilityState={{ selected: draft.silent === value }}>
                <Text style={draft.silent === value ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {/* Capabilities, not permissions: a job is the orchestrator's stand-in while nobody
              watches, so both are granted and the switch is the narrowing. */}
          <View style={styles.chips}>
            {(
              [
                [true, 'Sub-agents'],
                [false, 'No sub-agents'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={label}
                onPress={() => setDraft(current => ({ ...current, subagents: value }))}
                style={[styles.chip, draft.subagents === value ? styles.chipActive : styles.chipIdle]}
                accessibilityRole="button"
                accessibilityLabel={`Job ${label}`}
                accessibilityState={{ selected: draft.subagents === value }}>
                <Text style={draft.subagents === value ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chips}>
            {(
              [
                [true, 'Browser'],
                [false, 'No browser'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={label}
                onPress={() => setDraft(current => ({ ...current, browser: value }))}
                style={[styles.chip, draft.browser === value ? styles.chipActive : styles.chipIdle]}
                accessibilityRole="button"
                accessibilityLabel={`Job ${label}`}
                accessibilityState={{ selected: draft.browser === value }}>
                <Text style={draft.browser === value ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>prompt</Text>
          <TextInput
            style={[styles.input, styles.promptInput, promptMissing ? styles.inputInvalid : null]}
            value={draft.prompt}
            onChangeText={prompt => setDraft(current => ({ ...current, prompt }))}
            placeholder="what the agent should do on every run"
            placeholderTextColor={styles.placeholder.color}
            multiline
            autoCorrect={false}
            accessibilityLabel="Job prompt"
          />
          {promptMissing ? <Text style={styles.invalidHint}>a prompt is required</Text> : null}
        </View>

        {/* What becomes of the report: a note in the conversation it is delivered to, or that
            conversation's next turn, which its agent then acts on (docs/cron.md on the server). */}
        <View style={styles.category}>
          <Text style={styles.section}>report</Text>
          <View style={styles.chips}>
            {(
              [
                [false, 'Report only'],
                [true, 'Report handled'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={label}
                onPress={() => setDraft(current => ({ ...current, followUp: value }))}
                style={[styles.chip, draft.followUp === value ? styles.chipActive : styles.chipIdle]}
                accessibilityRole="button"
                accessibilityLabel={`Job ${label}`}
                accessibilityState={{ selected: draft.followUp === value }}>
                <Text style={draft.followUp === value ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {draft.followUp ? (
            <TextInput
              style={[styles.input, styles.promptInput]}
              value={draft.followUpPrompt}
              onChangeText={followUpPrompt => setDraft(current => ({ ...current, followUpPrompt }))}
              placeholder="what the conversation's agent does with the report (empty: act on it)"
              placeholderTextColor={styles.placeholder.color}
              multiline
              autoCorrect={false}
              accessibilityLabel="Follow-up instruction"
            />
          ) : null}
          <Text style={styles.note}>
            {!job || job.deliver === 'local'
              ? 'this job delivers nowhere, so there is no conversation to hand the report to'
              : draft.followUp
                ? 'the report becomes the conversation\'s next turn: its agent runs on it, or takes it in at the end of a run already going'
                : 'the report is filed in the conversation, and nobody acts on it until you do'}
          </Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>schedule</Text>
          <ScheduleEditor
            value={draft.schedule}
            onChange={schedule => setDraft(current => ({ ...current, schedule }))}
          />
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>runtime</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.row, styles.link]}
              onPress={() => {
                setPickerState(pickerStart);
                setModelPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit job model">
              <Text style={styles.rowKey}>model</Text>
              <View style={styles.valueArea}>
                <Text style={[styles.rowValue, !modelKnown ? styles.valueRemoved : null]} numberOfLines={1}>
                  {draft.model || 'inherited'}
                </Text>
                {!modelKnown ? (
                  <Text style={styles.removedHint} numberOfLines={1}>
                    no such model · pick one, or keep it
                  </Text>
                ) : null}
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
            <View style={styles.separator} />
            <Pressable
              style={[styles.row, styles.link]}
              onPress={() => setWorkspacePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit job workspace">
              <Text style={styles.rowKey}>workspace</Text>
              <View style={styles.valueArea}>
                <Text style={[styles.rowValue, !workspaceKnown ? styles.valueRemoved : null]} numberOfLines={1}>
                  {draft.workspace || 'default'}
                </Text>
                {!workspaceKnown ? (
                  <Text style={styles.removedHint} numberOfLines={1}>
                    workspace gone · the job would pause at its next run
                  </Text>
                ) : null}
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>
            absent = the cron agent's own model and workspace
          </Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>scope</Text>
          <View style={styles.card}>
            {scopeRow('skills', 'skills', 'inherited', 0)}
            {scopeRow('mcp', 'MCP', 'inherited', 1)}
            {scopeRow('tools', 'tools', 'inherited', 2)}
          </View>
          <Text style={styles.note}>
            the job's own choices win over the cron agent; an unknown name is painted red but never
            blocks the save
          </Text>
        </View>

        {job ? (
          <Pressable
            onPress={() => onDelete(job)}
            style={styles.deleteButton}
            accessibilityRole="button"
            accessibilityLabel="Delete job">
            <Text style={styles.deleteText}>Delete this job</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function toFields(job: JobEntry | null, draft: JobDraft): JobFieldsOut {
  return {
    ...(job ? { id: job.id } : {}),
    name: draft.name,
    prompt: draft.prompt,
    schedule: draft.schedule,
    enabled: draft.enabled,
    silent: draft.silent,
    ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
    // Always carried: "" reads as "no pin" on create and as a deliberate clear on update.
    effort: draft.effort,
    ...(draft.workspace.trim() ? { workspace: draft.workspace.trim() } : {}),
    skills: draft.skills,
    mcp: draft.mcp,
    tools: draft.tools,
    subagents: draft.subagents,
    browser: draft.browser,
    followUp: draft.followUp,
    followUpPrompt: draft.followUpPrompt.trim(),
  };
}

const createStyles = (palette: Palette) => ({
  // Full-page overlay, like the jobs list and the runs page: the shell container is shared
  // with the chat, and an in-flow editor would split the screen with it.
  screen: { backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
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
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  saveTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body,
    color: palette.text,
  },
  promptInput: { minHeight: 88, textAlignVertical: 'top' as const },
  inputInvalid: { borderColor: palette.danger },
  invalidHint: { fontSize: font.micro, color: palette.danger, paddingHorizontal: space.xs },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  chips: { flexDirection: 'row' as const, gap: space.sm },
  chip: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipIdle: { backgroundColor: palette.surface, borderColor: palette.border },
  chipTextActive: { fontSize: font.small, fontWeight: '600' as const, color: palette.surface },
  chipTextIdle: { fontSize: font.small, color: palette.textMuted },
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
  rowKey: { fontSize: font.small, color: palette.textMuted },
  valueArea: { flex: 1, alignItems: 'flex-end' as const, gap: 2 },
  rowValue: { flex: 1, fontSize: font.small, color: palette.text, textAlign: 'right' as const },
  valueRemoved: { color: palette.danger },
  removedHint: { fontSize: font.micro, color: palette.danger },
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  deleteButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.danger,
    paddingVertical: space.md,
    alignItems: 'center' as const,
  },
  deleteText: { fontSize: font.body, color: palette.danger },
  placeholder: { color: palette.textFaint },
});
