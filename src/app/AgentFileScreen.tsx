import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { AgentFileResultFrame, FileScopeMode } from '../core/protocol';
import type { AgentFileEditorState } from '../core/agentsFile';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

export interface ScopeOption {
  name: string;
  description: string;
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
  const [query, setQuery] = useState<Record<string, string>>({ skills: '', mcp: '', tools: '' });

  const busy = editor.status === 'loading' || editor.status === 'saving';
  const frame = editor.frame;

  if (editor.status === 'loading' || frame === null) {
    return (
      <View style={styles.screen}>
        <Header title={editor.name} editable={editor.editable} busy={busy} onBack={onBack} onSave={onSave} canSave={false} />
        <View style={styles.emptyArea}>
          <Text style={styles.empty}>loading...</Text>
        </View>
      </View>
    );
  }

  const canSave =
    editor.editable && !busy && editor.status !== 'conflict' && frame.description.trim().length > 0;

  const toggleTool = (name: string): void => {
    const current = frame.tools ?? [];
    onChange({ tools: current.includes(name) ? current.filter(n => n !== name) : [...current, name] });
  };

  const toggleName = (kind: 'skills' | 'mcp', name: string): void => {
    const current = frame[kind] ?? [];
    onChange({ [kind]: current.includes(name) ? current.filter(n => n !== name) : [...current, name] });
  };

  const scopeOptions = (kind: 'skills' | 'mcp'): ScopeOption[] => (kind === 'skills' ? skills : mcpServers);
  const unknownOf = (kind: 'skills' | 'mcp'): string[] => {
    const known = new Set(scopeOptions(kind).map(o => o.name));
    return (frame[kind] ?? []).filter(n => !known.has(n));
  };
  const unknownTools = frame.unknownTools ?? [];
  const filtered = (kind: 'skills' | 'mcp'): ScopeOption[] => {
    const q = query[kind] ?? '';
    return scopeOptions(kind).filter(
      o => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.description.toLowerCase().includes(q.toLowerCase()),
    );
  };
  const filteredTools = (frame.toolOptions ?? []).filter(
    t => !query.tools || t.toLowerCase().includes((query.tools ?? '').toLowerCase()),
  );

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
        <Text style={styles.conflict} accessibilityLabel={`Agent file conflict ${editor.error ?? ''}`}>
          {editor.error ?? 'changed on the server since it was opened'}
        </Text>
      ) : error ? (
        <Text style={styles.error} accessibilityLabel={`Agent file error ${error}`}>
          {error}
        </Text>
      ) : null}

      {!editor.editable ? (
        <View style={styles.forkArea}>
          <Text style={styles.error}>built-in agents are repo-synced · edit your own copy instead</Text>
          <Pressable
            onPress={onFork}
            style={styles.forkButton}
            accessibilityRole="button"
            accessibilityLabel={`Fork agent ${editor.name} to custom`}>
            <Text style={styles.forkText}>Fork to custom</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
            {(['general', 'research'] as const).map(base => (
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

        <View style={styles.category}>
          <Text style={styles.section}>tools</Text>
          <Text style={styles.note}>
            names are intersected with the {frame.base ?? 'general'} baseline · naming one outside it is ignored at run time
          </Text>
          {unknownTools.length > 0 ? (
            <View style={[styles.card, styles.cardRemoved]}>
              {unknownTools.map((name, index) => (
                <View key={name}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => toggleTool(name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle tool ${name}`}
                    accessibilityState={{ selected: (frame.tools ?? []).includes(name) }}>
                    <Text style={[styles.itemName, styles.removed]}>{name}</Text>
                    <Text style={[styles.itemHint, styles.removed]} numberOfLines={1}>
                      outside the baseline
                    </Text>
                    <Text style={[styles.glyph, styles.removed]}>{(frame.tools ?? []).includes(name) ? '✓' : '✕'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <TextInput
            style={styles.input}
            value={query.tools}
            onChangeText={tools => setQuery({ ...query, tools })}
            placeholder="filter tools..."
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Filter tools"
          />
          <View style={styles.card}>
            {filteredTools.length === 0 ? (
              <View style={styles.row}>
                <Text style={styles.itemHint}>no match</Text>
              </View>
            ) : (
              filteredTools.map((name, index) => (
                <View key={name}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => toggleTool(name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle tool ${name}`}
                    accessibilityState={{ selected: (frame.tools ?? []).includes(name) }}>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName}>{name}</Text>
                    </View>
                    <Text style={styles.glyph}>{(frame.tools ?? []).includes(name) ? '✓' : ''}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>

        <ScopeSection
          title="skills"
          mode={frame.skillsMode}
          names={frame.skills ?? []}
          unknown={unknownOf('skills')}
          available={filtered('skills')}
          query={query.skills}
          onQuery={value => setQuery({ ...query, skills: value })}
          onMode={skillsMode => onChange({ skillsMode } as Partial<AgentFileResultFrame>)}
          onToggle={name => toggleName('skills', name)}
        />

        <ScopeSection
          title="MCP"
          mode={frame.mcpMode}
          names={frame.mcp ?? []}
          unknown={unknownOf('mcp')}
          available={filtered('mcp')}
          query={query.mcp}
          onQuery={value => setQuery({ ...query, mcp: value })}
          onMode={mcpMode => onChange({ mcpMode } as Partial<AgentFileResultFrame>)}
          onToggle={name => toggleName('mcp', name)}
        />

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
            onChangeText={workspace => onChange({ workspace: workspace || undefined })}
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
                value={frame.maxIterations === undefined ? '' : String(frame.maxIterations)}
                onChangeText={value => {
                  const n = Number(value);
                  onChange({ maxIterations: value === '' || !Number.isInteger(n) || n <= 0 ? undefined : n });
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
                value={frame.contextCap === undefined ? '' : String(frame.contextCap)}
                onChangeText={value => {
                  const n = Number(value);
                  onChange({ contextCap: value === '' || !Number.isInteger(n) || n < 0 ? undefined : n });
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
                        ? (frame.instructions ?? []).filter(l => l !== layer)
                        : [...(frame.instructions ?? []), layer],
                    })
                  }
                  accessibilityLabel={`Prompt layer ${layer}`}
                />
              );
            })}
          </View>
          {(() => {
            const offChecked = (frame.instructions ?? []).filter(layer => layerOff?.[layer]);
            if (offChecked.length === 0) return null;
            const workspace = frame.workspace ?? 'default';
            return (
              <Text style={styles.layerOffNote} accessibilityLabel="Warning a layer is off at the workspace level">
                {`${offChecked.join(', ')} ${offChecked.length === 1 ? 'is' : 'are'} off for the ${workspace} workspace · this agent will not get ${offChecked.length === 1 ? 'it' : 'them'}, even checked here`}
              </Text>
            );
          })()}
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
            accessibilityLabel={`Delete agent ${editor.name}`}>
            <Text style={styles.deleteText}>Delete agent</Text>
          </Pressable>
        ) : null}
      </ScrollView>
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
        accessibilityLabel="Back to agent">
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {editable ? 'definition file, editable' : 'definition file, read-only'}
        </Text>
      </View>
      {editable ? (
        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[styles.saveButton, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={busy ? 'Saving agent file' : 'Save agent file'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>{busy ? '...' : 'Save'}</Text>
        </Pressable>
      ) : null}
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
      accessibilityState={{ selected: active }}>
      <Text style={active ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
    </Pressable>
  );
}

function ScopeSection({
  title,
  mode,
  names,
  unknown,
  available,
  query,
  onQuery,
  onMode,
  onToggle,
}: {
  title: string;
  mode: FileScopeMode;
  names: string[];
  unknown: string[];
  available: ScopeOption[];
  query: string;
  onQuery: (query: string) => void;
  onMode: (mode: FileScopeMode) => void;
  onToggle: (name: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.category}>
      <Text style={styles.section}>{title}</Text>
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
            onPress={() => onMode(value)}
            accessibilityLabel={`${title} mode ${label}`}
          />
        ))}
      </View>
      {mode === 'list' ? (
        <>
          {unknown.length > 0 ? (
            <View style={[styles.card, styles.cardRemoved]}>
              {unknown.map((name, index) => (
                <View key={name}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => onToggle(name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle ${name}`}
                    accessibilityState={{ selected: names.includes(name) }}>
                    <Text style={[styles.itemName, styles.removed]}>{name}</Text>
                    <Text style={[styles.itemHint, styles.removed]} numberOfLines={1}>
                      no longer exists
                    </Text>
                    <Text style={[styles.glyph, styles.removed]}>{names.includes(name) ? '✓' : '✕'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={onQuery}
            placeholder={`filter ${title.toLowerCase()}...`}
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={`Filter ${title}`}
          />
          <View style={styles.card}>
            {available.length === 0 ? (
              <View style={styles.row}>
                <Text style={styles.itemHint}>no match</Text>
              </View>
            ) : (
              available.map((item, index) => (
                <View key={item.name}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => onToggle(item.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle ${item.name}`}
                    accessibilityState={{ selected: names.includes(item.name) }}>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemHint} numberOfLines={1}>
                        {item.description}
                      </Text>
                    </View>
                    <Text style={styles.glyph}>{names.includes(item.name) ? '✓' : ''}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </View>
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
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  saveTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  chips: { flexDirection: 'row' as const, gap: space.sm, flexWrap: 'wrap' as const },
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
  chipTextActive: { fontSize: font.small, fontWeight: '600' as const, color: palette.surface },
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
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  cardRemoved: { borderColor: palette.danger },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  glyph: { fontSize: 18, color: palette.accent, width: 22, textAlign: 'center' as const },
  removed: { color: palette.danger },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
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
  deleteText: { fontSize: font.body, fontWeight: '600' as const, color: palette.danger },
  forkArea: { gap: space.md, paddingHorizontal: space.xs },
  forkButton: {
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
    alignItems: 'center' as const,
  },
  forkText: { fontSize: font.body, fontWeight: '600' as const, color: palette.accent },
  layerOffNote: { fontSize: font.micro, color: palette.danger, paddingHorizontal: space.xs },
  emptyArea: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg },
  empty: { fontSize: font.meta, color: palette.textFaint, textAlign: 'center' as const },
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
