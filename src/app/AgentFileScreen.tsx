import { CheckIcon, ChevronIcon } from '../components/icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, Text, TextInput, View } from 'react-native';
import type { AgentFileResultFrame } from '../core/protocol';
import type { AgentFileEditorState } from '../core/agentsFile';
import { CardEdge } from '../components/CardEdge';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';

export interface ScopeOption {
  name: string;
  description: string;
}

/** Frozen so an absent list is always the same reference, and never grown by accident. */
const EMPTY_NAMES: string[] = [];
Object.freeze(EMPTY_NAMES);

/** A picker section of the form: its rows are list items, its chrome is the section header. */
type PickKind = 'tools' | 'skills' | 'mcp';
interface PickSection {
  kind: PickKind;
  /** Names only: the catalogue description is looked up from `byName` when the row is drawn. */
  data: string[];
  byName: Map<string, string>;
}

const keyOfName = (name: string, index: number): string => `${index}:${name}`;

/** One checkable catalogue entry. Memoized, and handed the name: tools run to the hundreds. */
const PickRow = React.memo(function PickRowView({
  name,
  description,
  checked,
  first,
  last,
  onToggle,
}: {
  name: string;
  description?: string;
  checked: boolean;
  first: boolean;
  last: boolean;
  onToggle: (name: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <CardEdge first={first} last={last}>
      <Pressable
        style={styles.row}
        onPress={() => onToggle(name)}
        accessibilityRole="button"
        accessibilityLabel={`Toggle ${name}`}
        accessibilityState={{ selected: checked }}
      >
        <View style={styles.itemMain}>
          <Text style={styles.itemName}>{name}</Text>
          {description ? (
            <Text style={styles.itemHint} numberOfLines={1}>
              {description}
            </Text>
          ) : null}
        </View>
        {checked ? <CheckIcon size={16} tone="accent" /> : null}
      </Pressable>
    </CardEdge>
  );
});

/** Names the agent claims that no longer exist in the catalogue. */
function unknownIn(
  options: ScopeOption[],
  names: string[] | undefined,
): string[] {
  if (!names || names.length === 0) return EMPTY_NAMES;
  const known = new Set(options.map(option => option.name));
  return names.filter(name => !known.has(name));
}

/** Tool names carry no description of their own; the row simply shows nothing under them. */
const NO_DESCRIPTIONS = new Map<string, string>();

const describe = (options: ScopeOption[]): Map<string, string> =>
  new Map(options.map(option => [option.name, option.description]));

/** The needle is lowercased once here, not once per candidate inside the predicate. */
function matchScope(
  options: ScopeOption[],
  query: string | undefined,
): ScopeOption[] {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return options;
  return options.filter(
    option =>
      option.name.toLowerCase().includes(needle) ||
      option.description.toLowerCase().includes(needle),
  );
}

/**
 * The definition file of one agent, edited as structured fields: the app edits fields, the
 * server serializes the flat frontmatter and validates it through the same parser as the loader.
 * The store holds the working copy (the screen never keeps its own), so a scope picked on the
 * scope editor page lands here and leaves with the whole-frame save. A built-in file is
 * read-only; the header offers the fork instead. A save echoes the loaded sha, so a concurrent
 * edit is refused as a conflict like the instructions page.
 */
export function AgentFileScreen({
  editor,
  skills,
  mcpServers,
  error,
  layerOff,
  onBack,
  onChange,
  onSave,
  onFork,
  onDelete,
}: {
  editor: AgentFileEditorState;
  skills: ScopeOption[];
  mcpServers: ScopeOption[];
  error: string | null;
  /** Workspace-level off state per layer, for the agent's own workspace. Absent: unknown. */
  layerOff?: Record<string, boolean>;
  onBack: () => void;
  /** Every field change lands in the store; the whole frame goes on save. */
  onChange: (patch: Partial<AgentFileResultFrame>) => void;
  onSave: () => void;
  onFork: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [query, setQuery] = useState<Record<string, string>>({
    skills: '',
    mcp: '',
    tools: '',
  });

  const busy = editor.status === 'loading' || editor.status === 'saving';
  const frame = editor.frame;

  // Everything derived is computed here, above the early return so the hook order never moves.
  // The tool catalogue runs to the hundreds and this screen carries three filters: each of these
  // used to be recomputed for all three lists on every keystroke in any one of them, with the
  // needle lowercased once per candidate and membership tested twice per row.
  const selected = useMemo(
    () => ({
      tools: new Set(frame?.tools ?? []),
      skills: new Set(frame?.skills ?? []),
      mcp: new Set(frame?.mcp ?? []),
    }),
    [frame?.tools, frame?.skills, frame?.mcp],
  );
  const unknownSkills = useMemo(
    () => unknownIn(skills, frame?.skills),
    [skills, frame?.skills],
  );
  const unknownMcp = useMemo(
    () => unknownIn(mcpServers, frame?.mcp),
    [mcpServers, frame?.mcp],
  );
  const shownSkills = useMemo(
    () => matchScope(skills, query.skills),
    [skills, query.skills],
  );
  const shownMcp = useMemo(
    () => matchScope(mcpServers, query.mcp),
    [mcpServers, query.mcp],
  );
  const shownTools = useMemo(() => {
    const needle = (query.tools ?? '').trim().toLowerCase();
    const all = frame?.toolOptions ?? EMPTY_NAMES;
    return needle
      ? all.filter(name => name.toLowerCase().includes(needle))
      : all;
  }, [frame?.toolOptions, query.tools]);

  // A scope section with no key, or set to "all", has nothing checkable under it: its rows are
  // empty and only its chips are drawn.
  const sections = useMemo<PickSection[]>(
    () => [
      { kind: 'tools', data: shownTools, byName: NO_DESCRIPTIONS },
      {
        kind: 'skills',
        data:
          frame?.skillsMode === 'list'
            ? shownSkills.map(option => option.name)
            : EMPTY_NAMES,
        byName: describe(shownSkills),
      },
      {
        kind: 'mcp',
        data:
          frame?.mcpMode === 'list'
            ? shownMcp.map(option => option.name)
            : EMPTY_NAMES,
        byName: describe(shownMcp),
      },
    ],
    [frame?.skillsMode, frame?.mcpMode, shownMcp, shownSkills, shownTools],
  );

  const toggleIn = useCallback(
    (kind: PickKind, name: string) => {
      const current = editor.frame?.[kind] ?? EMPTY_NAMES;
      onChange({
        [kind]: current.includes(name)
          ? current.filter(n => n !== name)
          : [...current, name],
      } as Partial<AgentFileResultFrame>);
    },
    [editor.frame, onChange],
  );
  const toggleTools = useCallback(
    (name: string) => toggleIn('tools', name),
    [toggleIn],
  );
  const toggleSkills = useCallback(
    (name: string) => toggleIn('skills', name),
    [toggleIn],
  );
  const toggleMcp = useCallback(
    (name: string) => toggleIn('mcp', name),
    [toggleIn],
  );
  const togglers: Record<PickKind, (name: string) => void> = useMemo(
    () => ({ tools: toggleTools, skills: toggleSkills, mcp: toggleMcp }),
    [toggleMcp, toggleSkills, toggleTools],
  );

  const renderPickRow = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: string;
      index: number;
      section: PickSection;
    }) => (
      <PickRow
        name={item}
        description={section.byName.get(item)}
        checked={selected[section.kind].has(item)}
        first={index === 0}
        last={index === section.data.length - 1}
        onToggle={togglers[section.kind]}
      />
    ),
    [selected, togglers],
  );

  if (editor.status === 'loading' || frame === null) {
    return (
      <View style={styles.screen}>
        <Header
          title={editor.name}
          editable={editor.editable}
          busy={busy}
          onBack={onBack}
          onSave={onSave}
          canSave={false}
        />
        <View style={styles.emptyArea}>
          <Text style={styles.empty}>loading...</Text>
        </View>
      </View>
    );
  }

  const canSave =
    editor.editable &&
    !busy &&
    editor.status !== 'conflict' &&
    frame.description.trim().length > 0;

  const unknownTools = frame.unknownTools ?? EMPTY_NAMES;

  // A layer this agent checks that its workspace has switched off: checked here it still will not
  // arrive, so the contradiction is named rather than silently resolved.
  const layersOff = (frame.instructions ?? EMPTY_NAMES).filter(layer => layerOff?.[layer]);
  const layersOffNote =
    layersOff.length === 0
      ? null
      : `${layersOff.join(', ')} ${layersOff.length === 1 ? 'is' : 'are'} off for the ${
          frame.workspace ?? 'default'
        } workspace · this agent will not get ${
          layersOff.length === 1 ? 'it' : 'them'
        }, even checked here`;

  /**
   * The chrome of a picker: its label, the entries it lost, and the filter over what is left.
   *
   * Known limit: the filters ride the section headers of a virtualized list. A section scrolled
   * out of the render window is unmounted, so the field's *value* survives (it lives in parent
   * state) but its keyboard *focus* does not — typing while the field left the window drops the
   * keystrokes. `windowSize={9}` makes that all but impossible in practice; the honest fix if it
   * ever bites is to lift the filters into fixed chrome outside the list.
   */
  const renderSectionHeader = ({
    section,
  }: {
    section: PickSection;
  }): React.JSX.Element => {
    const kind = section.kind;
    const mode =
      kind === 'skills'
        ? frame.skillsMode
        : kind === 'mcp'
          ? frame.mcpMode
          : 'list';
    const gone =
      kind === 'tools'
        ? unknownTools
        : kind === 'skills'
          ? unknownSkills
          : unknownMcp;
    const title = kind === 'mcp' ? 'MCP' : kind;
    return (
      <View style={styles.sectionHead}>
        <Text style={styles.section}>{title}</Text>
        {kind === 'tools' ? (
          <Text style={styles.note}>
            names are intersected with the {frame.base ?? 'general'} baseline ·
            naming one outside it is ignored at run time
          </Text>
        ) : (
          <View style={styles.chips}>
            {(
              [
                ['absent', 'Unset'],
                ['all', 'All'],
                ['list', 'Select'],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                active={mode === value}
                onPress={() =>
                  onChange(
                    (kind === 'skills'
                      ? { skillsMode: value }
                      : { mcpMode: value }) as Partial<AgentFileResultFrame>,
                  )
                }
                accessibilityLabel={`${title} mode ${label}`}
              />
            ))}
          </View>
        )}
        {mode === 'list' ? (
          <>
            {gone.map((name, index) => (
              <CardEdge
                key={name}
                danger
                first={index === 0}
                last={index === gone.length - 1}
              >
                <Pressable
                  style={styles.row}
                  onPress={() => togglers[kind](name)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    kind === 'tools' ? `Toggle tool ${name}` : `Toggle ${name}`
                  }
                  accessibilityState={{ selected: selected[kind].has(name) }}
                >
                  <Text style={[styles.itemName, styles.removed]}>{name}</Text>
                  <Text
                    style={[styles.itemHint, styles.removed]}
                    numberOfLines={1}
                  >
                    {kind === 'tools'
                      ? 'outside the baseline'
                      : 'no longer exists'}
                  </Text>
                  <Text style={[styles.glyph, styles.removed]}>
                    {selected[kind].has(name) ? 'on' : ''}
                  </Text>
                </Pressable>
              </CardEdge>
            ))}
            <TextInput
              style={styles.input}
              value={query[kind]}
              onChangeText={value =>
                setQuery(current => ({ ...current, [kind]: value }))
              }
              placeholder={`filter ${title.toLowerCase()}...`}
              placeholderTextColor={styles.placeholder.color}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={
                kind === 'tools' ? 'Filter tools' : `Filter ${title}`
              }
            />
            {section.data.length === 0 ? (
              <CardEdge first last>
                <View style={styles.row}>
                  <Text style={styles.itemHint}>no match</Text>
                </View>
              </CardEdge>
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={editor.name}
        editable={editor.editable}
        busy={busy}
        onBack={onBack}
        onSave={onSave}
        canSave={canSave}
      />

      {editor.status === 'conflict' ? (
        <Text
          style={styles.conflict}
          accessibilityLabel={`Agent file conflict ${editor.error ?? ''}`}
        >
          {editor.error ?? 'changed on the server since it was opened'}
        </Text>
      ) : error ? (
        <Text
          style={styles.error}
          accessibilityLabel={`Agent file error ${error}`}
        >
          {error}
        </Text>
      ) : null}

      {!editor.editable ? (
        <View style={styles.forkArea}>
          <Text style={styles.error}>
            built-in agents are repo-synced · edit your own copy instead
          </Text>
          <Pressable
            onPress={onFork}
            style={styles.forkButton}
            accessibilityRole="button"
            accessibilityLabel={`Fork agent ${editor.name} to custom`}
          >
            <Text style={styles.forkText}>Fork to custom</Text>
          </Pressable>
        </View>
      ) : null}

      {/* A SectionList, not a scroll view: the tool catalogue alone runs to the hundreds, and
          three pickers nested in one scrollable would each have to mount every row they hold.
          The fields that are not lists are the header and the footer. */}
      <SectionList
        sections={sections}
        keyExtractor={keyOfName}
        renderItem={renderPickRow}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        ListHeaderComponent={
          <View style={styles.formBlock}>
            <View style={styles.category}>
              <Text style={styles.section}>description</Text>
              <TextInput
                style={styles.input}
                value={frame.description}
                onChangeText={description => onChange({ description })}
                editable={editor.editable}
                placeholder="what the orchestrator reads before spawning this agent"
                placeholderTextColor={styles.placeholder.color}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Agent description"
              />
            </View>

            <View style={styles.category}>
              <Text style={styles.section}>base</Text>
              <View style={styles.chips}>
                {/* The browser base is the browser agent's alone (the shared Chromium's toolbox, reached
                    through delegate_browser_task): shown when the file has it, never offered. */}
                {(frame.base === 'browser' ? (['browser'] as const) : (['general', 'research'] as const)).map(base => (
                  <Chip
                    key={base}
                    label={base}
                    active={frame.base === base}
                    onPress={() => onChange({ base })}
                    accessibilityLabel={`Agent base ${base}`}
                  />
                ))}
              </View>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.formBlock}>
            <View style={styles.category}>
              <Text style={styles.section}>model</Text>
              <TextInput
                style={styles.input}
                value={frame.model ?? ''}
                onChangeText={model => onChange({ model: model || undefined })}
                editable={editor.editable}
                placeholder="a model id from the configured providers"
                placeholderTextColor={styles.placeholder.color}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Agent model id"
              />
            </View>

            <View style={styles.category}>
              <Text style={styles.section}>workspace</Text>
              <TextInput
                style={styles.input}
                value={frame.workspace ?? ''}
                onChangeText={workspace =>
                  onChange({ workspace: workspace || undefined })
                }
                editable={editor.editable}
                placeholder="a key from config.workspaces"
                placeholderTextColor={styles.placeholder.color}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Agent workspace key"
              />
            </View>

            <View style={styles.category}>
              <Text style={styles.section}>limits</Text>
              <View style={styles.rowPair}>
                <View style={styles.pairColumn}>
                  <Text style={styles.itemHint}>maxIterations</Text>
                  <TextInput
                    style={styles.input}
                    value={
                      frame.maxIterations === undefined
                        ? ''
                        : String(frame.maxIterations)
                    }
                    onChangeText={value => {
                      const n = Number(value);
                      onChange({
                        maxIterations:
                          value === '' || !Number.isInteger(n) || n <= 0
                            ? undefined
                            : n,
                      });
                    }}
                    editable={editor.editable}
                    keyboardType="number-pad"
                    placeholder="inherit"
                    placeholderTextColor={styles.placeholder.color}
                    accessibilityLabel="Agent max iterations"
                  />
                </View>
                <View style={styles.pairColumn}>
                  <Text style={styles.itemHint}>contextCap (0 = none)</Text>
                  <TextInput
                    style={styles.input}
                    value={
                      frame.contextCap === undefined
                        ? ''
                        : String(frame.contextCap)
                    }
                    onChangeText={value => {
                      const n = Number(value);
                      onChange({
                        contextCap:
                          value === '' || !Number.isInteger(n) || n < 0
                            ? undefined
                            : n,
                      });
                    }}
                    editable={editor.editable}
                    keyboardType="number-pad"
                    placeholder="inherit"
                    placeholderTextColor={styles.placeholder.color}
                    accessibilityLabel="Agent context cap"
                  />
                </View>
              </View>
            </View>

            <View style={styles.category}>
              <Text style={styles.section}>instructions</Text>
              <View style={styles.chips}>
                {(['CORE', 'SOUL', 'AGENTS', 'USER'] as const).map(layer => {
                  const active = (frame.instructions ?? []).includes(layer);
                  return (
                    <Chip
                      key={layer}
                      label={layer}
                      active={active}
                      onPress={() =>
                        onChange({
                          instructions: active
                            ? (frame.instructions ?? []).filter(
                                l => l !== layer,
                              )
                            : [...(frame.instructions ?? []), layer],
                        })
                      }
                      accessibilityLabel={`Prompt layer ${layer}`}
                    />
                  );
                })}
              </View>
              {layersOffNote ? (
                <Text
                  style={styles.layerOffNote}
                  accessibilityLabel="Warning a layer is off at the workspace level"
                >
                  {layersOffNote}
                </Text>
              ) : null}
            </View>

            <View style={styles.category}>
              <Text style={styles.section}>prompt</Text>
              <TextInput
                style={[styles.input, styles.bodyInput]}
                value={frame.prompt}
                onChangeText={prompt => onChange({ prompt })}
                editable={editor.editable}
                multiline
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                textAlignVertical="top"
                placeholder="what this agent does, beyond the metadata"
                placeholderTextColor={styles.placeholder.color}
                accessibilityLabel="Agent prompt body"
              />
            </View>

            {editor.editable ? (
              <Pressable
                onPress={onDelete}
                style={styles.deleteButton}
                accessibilityRole="button"
                accessibilityLabel={`Delete agent ${editor.name}`}
              >
                <Text style={styles.deleteText}>Delete agent</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

function Header({
  title,
  editable,
  busy,
  onBack,
  onSave,
  canSave,
}: {
  title: string;
  editable: boolean;
  busy: boolean;
  onBack: () => void;
  onSave: () => void;
  canSave: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Back to agent"
      >
        <ChevronIcon direction="left" size={22} tone="text" />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {editable
            ? 'definition file, editable'
            : 'definition file, read-only'}
        </Text>
      </View>
      {editable ? (
        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[
            styles.saveButton,
            canSave ? styles.saveEnabled : styles.saveDisabled,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={busy ? 'Saving agent file' : 'Save agent file'}
        >
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>
            {busy ? '...' : 'Save'}
          </Text>
        </Pressable>
      ) : null}
      <CloseButton />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
    >
      <Text style={active ? styles.chipTextActive : styles.chipTextIdle}>
        {label}
      </Text>
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
  headerText: { flex: 1, gap: 1 },
  title: {
    fontSize: font.title,
    fontWeight: '600' as const,
    color: palette.text,
  },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  saveButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.surface,
  },
  saveTextOff: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.textFaint,
  },
  // No `gap` here: the rows of a picker are list items, and a gap would prise the card apart.
  // The blocks that are not rows carry their own spacing instead.
  body: { padding: space.md, paddingBottom: space.xl },
  formBlock: { gap: space.lg, paddingVertical: space.lg },
  sectionHead: { gap: space.xs, paddingTop: space.lg, paddingBottom: space.xs },
  category: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  note: {
    fontSize: font.micro,
    color: palette.textFaint,
    paddingHorizontal: space.xs,
  },
  chips: {
    flexDirection: 'row' as const,
    gap: space.sm,
    flexWrap: 'wrap' as const,
  },
  chip: {
    flex: 1,
    minWidth: 84,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipIdle: { backgroundColor: palette.surface, borderColor: palette.border },
  chipTextActive: {
    fontSize: font.small,
    fontWeight: '600' as const,
    color: palette.surface,
  },
  chipTextIdle: { fontSize: font.small, color: palette.textMuted },
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
  bodyInput: { minHeight: 160 },
  placeholder: { color: palette.textFaint },
  // The card and its separators live in CardEdge now: they are drawn per row so the pickers
  // inside them can virtualize.
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  glyph: {
    fontSize: 18,
    color: palette.accent,
    width: 22,
    textAlign: 'center' as const,
  },
  removed: { color: palette.danger },
  rowPair: { flexDirection: 'row' as const, gap: space.md },
  pairColumn: { flex: 1, gap: space.xs },
  deleteButton: {
    marginTop: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.danger,
    alignItems: 'center' as const,
  },
  deleteText: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.danger,
  },
  forkArea: { gap: space.md, paddingHorizontal: space.xs },
  forkButton: {
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
    alignItems: 'center' as const,
  },
  forkText: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.accent,
  },
  layerOffNote: {
    fontSize: font.micro,
    color: palette.danger,
    paddingHorizontal: space.xs,
  },
  emptyArea: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.lg,
  },
  empty: {
    fontSize: font.meta,
    color: palette.textFaint,
    textAlign: 'center' as const,
  },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  conflict: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
