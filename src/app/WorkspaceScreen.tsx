import { ChevronIcon, MoreIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { InstructionEntry, NestedInstruction, WorkspaceEntry } from '../core/protocol';
import type { InstructionsStatus } from '../core/instructions';
import { sourceStatusOf, sourceOwnsFile } from '../core/layers';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import { CloseButton } from '../components/CloseButton';

/** The loader's workspace key rules, mirrored so the form refuses before the server does. */
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;

function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function unavailableText(status: InstructionsStatus, error: string | null): string {
  if (status === 'unsupported') {
    return 'this server is too old for the instructions page (needs 0.1.169 or later)';
  }
  return error ?? 'loading instructions...';
}

export interface RowBadge {
  text: string;
  danger: boolean;
}

export interface RowText {
  badge: RowBadge | null;
  hint: string;
}

/**
 * What a row says about one file, from the resolution the server sent. The badge names the
 * state; the hint says the consequence. `missing` never appears: a workspace without a file
 * reads something, and the row says what.
 */
export function rowText(
  entry: InstructionEntry,
  workspaceKeys: string[],
  entries: InstructionEntry[],
): RowText {
  if (entry.origin === 'own') {
    return { badge: null, hint: `in this workspace · ${sizeLabel(entry.bytes)}` };
  }
  if (entry.origin === 'off') {
    return {
      badge: { text: 'off', danger: true },
      hint:
        entry.bytes > 0
          ? `off: ${entry.workspace}/${entry.file} exists but is never read`
          : 'off: this layer is left out of the prompt',
    };
  }
  if (entry.origin === 'inherited') {
    return {
      badge: { text: 'inherited', danger: false },
      hint: `inherited from ${entry.from || 'default'} · ${sizeLabel(entry.bytes)}`,
    };
  }
  // origin 'fallback': nothing any workspace owns, or a source that could not deliver.
  const source = sourceStatusOf(entry, workspaceKeys);
  if (source.kind === 'none') {
    return { badge: { text: 'no layer', danger: false }, hint: 'nothing: this layer is left out of the prompt' };
  }
  // A source that is cut and owns no file. Only the server can tell this apart from a source that
  // is merely empty-handed, and the two end differently: nothing at all versus the template. The
  // row has to say which, or it promises a template that is never read.
  if (entry.empty === true && source.kind === 'workspace') {
    return {
      badge: { text: 'no layer', danger: false },
      hint: `${source.key} has this layer off and no ${entry.file} to pass on · nothing is read`,
    };
  }
  if (source.kind === 'builtin') {
    return {
      badge: { text: 'built-in', danger: false },
      hint: 'always the shipped template, even if default has one',
    };
  }
  // The one-hop rule, and the reason this branch is about the source *not* owning the file: the
  // server only says "fallback" once the source failed to deliver, and a source that owns the
  // file never fails. So the common shape here is a source without that file, which the ladder
  // does not follow any further -- it stops on the shipped template.
  if (source.kind === 'workspace' && !source.self && !source.removed && !sourceOwnsFile(entry, entries)) {
    return {
      badge: { text: 'built-in', danger: false },
      hint: `read from ${source.key}, which has no ${entry.file} either · lands on the shipped template`,
    };
  }
  // Source owns the file, yet the server called it a fallback: the listing and the resolution
  // disagree, which only happens on a snapshot taken across a write. Read it the optimistic way;
  // the next list settles it.
  if (source.kind === 'workspace' && !source.self && !source.removed) {
    return {
      badge: { text: 'inherited', danger: false },
      hint: `read from ${source.key} · ${sizeLabel(entry.bytes)}`,
    };
  }
  if (source.kind === 'workspace' && source.removed) {
    return {
      badge: { text: 'broken', danger: true },
      hint: `reads from ${source.key}, which no longer exists · falls back to the shipped template`,
    };
  }
  if (source.kind === 'workspace' && source.self) {
    return {
      badge: { text: 'broken', danger: true },
      hint: `points at ${entry.workspace} itself · falls back to the shipped template`,
    };
  }
  return {
    badge: { text: 'built-in', danger: false },
    hint: 'shipped template, no file yet',
  };
}

/**
 * One workspace: what it is (the directory), the markdown that builds the prompt inside it, and
 * the nested AGENTS.md found under it. The three used to live on two pages -- a workspace list
 * that only did config CRUD, and an instructions page that stacked every workspace's files -- and
 * a reader had to hold the mapping in their head.
 *
 * A file this workspace does not carry is never shown as missing: the agent reads the default
 * workspace's copy, so the row says where the content comes from. Nested files are listed apart
 * because they are not prompt layers: they reach tool results during a run, not the system prompt.
 *
 * The default workspace carries no key form and cannot be removed: it is `config.workspace`, not
 * an entry of `config.workspaces`, and everything else falls back to it.
 */
export function WorkspaceScreen({
  workspace,
  entries,
  nested,
  nestedTruncated,
  workspaceKeys,
  status,
  error,
  configError,
  busy,
  backLabel,
  onBack,
  onOpen,
  onOpenLayer,
  onOpenNested,
  onRename,
  onSetPath,
  onRemove,
}: {
  workspace: WorkspaceEntry;
  /** Every entry, not just this workspace's: a row's source resolution reads the others. */
  entries: InstructionEntry[];
  /** Every workspace's nested files; this page shows its own. */
  nested: NestedInstruction[];
  /** Workspaces whose nested list the server cut at its cap. */
  nestedTruncated: string[];
  workspaceKeys: string[];
  status: InstructionsStatus;
  /** The instructions listing's error. */
  error: string | null;
  /** The config edit's error, which fails for its own reasons (a key taken, a bad path). */
  configError: string | null;
  busy: boolean;
  backLabel: string;
  onBack: () => void;
  onOpen: (entry: InstructionEntry) => void;
  onOpenLayer: (entry: InstructionEntry) => void;
  onOpenNested: (item: NestedInstruction) => void;
  onRename: (from: string, to: string) => void;
  onSetPath: (key: string, path: string) => void;
  onRemove: (key: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [editing, setEditing] = useState(false);
  const [keyDraft, setKeyDraft] = useState(workspace.key);
  const [pathDraft, setPathDraft] = useState(workspace.path);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuEntry, setMenuEntry] = useState<InstructionEntry | null>(null);

  const openEditor = (): void => {
    setKeyDraft(workspace.key);
    setPathDraft(workspace.path);
    setConfirmRemove(false);
    setEditing(true);
  };

  const keyValid = KEY_RE.test(keyDraft.trim()) && keyDraft.trim() !== 'default';
  const pathValid = pathDraft.trim().startsWith('/');
  const keyChanged = keyDraft.trim() !== workspace.key;
  const pathChanged = pathDraft.trim() !== workspace.path;
  const formValid = keyValid && pathValid && !busy && (keyChanged || pathChanged);
  const targetExists = keyChanged && workspaceKeys.includes(keyDraft.trim());

  const submit = (): void => {
    if (!formValid) return;
    // One save can move both: the key (renaming it, pins follow) and the path (repointing the
    // directory). Each answer is a fresh listing, so the two frames settle in order.
    if (keyChanged) onRename(workspace.key, keyDraft.trim());
    if (pathChanged) onSetPath(keyChanged ? keyDraft.trim() : workspace.key, pathDraft.trim());
    setEditing(false);
  };

  const files = entries.filter(entry => entry.workspace === workspace.key);
  const ownNested = nested.filter(item => item.workspace === workspace.key);
  const cut = files.filter(entry => entry.origin === 'off' || entry.inherit === 'none').length;
  const layersSupported = entries.some(entry => entry.inherit !== undefined);
  const fileMenuOptions: SheetEntry[] = [];
  if (menuEntry && menuEntry.origin !== 'own' && menuEntry.origin !== 'off') {
    fileMenuOptions.push({
      label: menuEntry.bytes > 0 ? 'Create from template' : 'Create file',
      hint:
        menuEntry.bytes > 0
          ? `save a copy of the content this workspace reads${menuEntry.from ? ` from ${menuEntry.from}` : ''}`
          : 'open a blank file and save it in this workspace',
      onPress: () => {
        const entry = menuEntry;
        setMenuEntry(null);
        onOpen(entry);
      },
    });
  }
  if (menuEntry?.inherit !== undefined) {
    fileMenuOptions.push({
      label: 'Layer settings',
      onPress: () => {
        const entry = menuEntry;
        setMenuEntry(null);
        onOpenLayer(entry);
      },
    });
  }

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
          <Text style={styles.title} accessibilityLabel={`Workspace ${workspace.key}`}>
            {workspace.key}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {workspace.default ? 'your conversations and memory live here' : workspace.path}
          </Text>
        </View>
        <CloseButton />
      </View>

      {configError ? (
        <Text style={styles.error} accessibilityLabel={`Workspaces error ${configError}`}>
          {configError}
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityLabel={`Instructions error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>directory</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              {/* No line cap: a path is a path, and a truncated one points nowhere visible. */}
              <Text style={styles.path} selectable>
                {workspace.path}
              </Text>
            </View>
            {workspace.default ? null : (
              <>
                <View style={styles.separator} />
                {editing ? (
                  <View style={styles.form}>
                    <TextInput
                      value={keyDraft}
                      onChangeText={setKeyDraft}
                      placeholder="key"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      accessibilityLabel="Workspace key"
                    />
                    <TextInput
                      value={pathDraft}
                      onChangeText={setPathDraft}
                      placeholder="/absolute/path"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      accessibilityLabel="Workspace path"
                    />
                    {targetExists ? (
                      <Text style={styles.noteDanger}>a workspace already uses that key</Text>
                    ) : keyChanged ? (
                      <Text style={styles.note}>
                        the agents and jobs pinned to {workspace.key} follow the new key
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={submit}
                      disabled={!formValid}
                      style={[styles.saveButton, formValid ? styles.saveEnabled : styles.saveDisabled]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !formValid }}
                      accessibilityLabel={busy ? 'Saving workspace' : 'Save workspace'}>
                      <Text style={formValid ? styles.saveText : styles.saveTextOff}>
                        {busy ? '...' : 'Save'}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={openEditor}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit workspace ${workspace.key}`}>
                    <View style={styles.linkMain}>
                      <Text style={styles.linkTitle}>key and path</Text>
                      <Text style={styles.hint}>
                        renaming moves the agents and jobs pinned to it
                      </Text>
                    </View>
                    <ChevronIcon direction="right" size={16} tone="faint" />
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>instructions</Text>
          {files.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.hint}>{unavailableText(status, error)}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              {files.map((entry, index) => {
                const row = rowText(entry, workspaceKeys, entries);
                return (
                  <View key={entry.file}>
                    {index > 0 ? <View style={styles.separator} /> : null}
                    <View style={styles.row}>
                      {/* linkMain only: `link` is flexDirection row, and applying it here laid
                          the hint beside the title instead of under it, so the size ran past
                          the flex box and over the ⋯ button. */}
                      <Pressable
                        style={styles.linkMain}
                        onPress={() => onOpen(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${entry.file} of ${workspace.key}`}>
                        <View style={styles.linkTitleLine}>
                          <Text style={styles.linkTitle}>{entry.file}</Text>
                          {row.badge ? (
                            <Text
                              style={[styles.badge, row.badge.danger ? styles.badgeDanger : null]}
                              accessibilityLabel={`${entry.file} of ${workspace.key} ${row.badge.text}`}>
                              {row.badge.text}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.hint} numberOfLines={2}>
                          {row.hint}
                        </Text>
                      </Pressable>
                      {entry.origin !== 'own' || entry.inherit !== undefined ? (
                        <Pressable
                          style={styles.layerButton}
                          onPress={() => setMenuEntry(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Actions for ${entry.file} of ${workspace.key}`}>
                          <MoreIcon size={16} tone="faint" />
                        </Pressable>
                      ) : null}
                      <ChevronIcon direction="right" size={16} tone="faint" />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {cut > 0 ? (
            <Text style={styles.note}>
              {`${cut} ${cut === 1 ? 'layer' : 'layers'} never reach the prompt · open ⋯ on a row to see why`}
            </Text>
          ) : null}
          {files.length > 0 && !layersSupported ? (
            <Text style={styles.note}>
              this server always falls back to the default workspace (per-file sources need a newer server)
            </Text>
          ) : null}
        </View>

        {ownNested.length > 0 ? (
          <View style={styles.category}>
            <Text style={styles.section}>nested AGENTS.md</Text>
            <View style={styles.card}>
              {ownNested.map((item, index) => (
                <View key={item.path}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={() => onOpenNested(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Read ${item.path} of ${item.workspace}`}>
                    <View style={styles.linkMain}>
                      <View style={styles.linkTitleLine}>
                        <Text style={styles.linkTitle} numberOfLines={1}>
                          {item.path}
                        </Text>
                        <Text style={styles.badge}>read only</Text>
                      </View>
                      <Text style={styles.hint} numberOfLines={1}>
                        {sizeLabel(item.bytes)}
                      </Text>
                    </View>
                    <ChevronIcon direction="right" size={16} tone="faint" />
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              added to tool results while a run touches their directory, not to the system prompt
            </Text>
            {nestedTruncated.includes(workspace.key) ? (
              <Text style={styles.noteDanger} accessibilityLabel="Nested list truncated">
                the server stopped scanning at {ownNested.length} files · there are more under this
                directory than the page can list
              </Text>
            ) : null}
          </View>
        ) : null}

        {workspace.default ? null : (
          <View style={styles.category}>
            <Text style={styles.section}>remove</Text>
            <View style={[styles.card, styles.cardDanger]}>
              {confirmRemove ? (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    setConfirmRemove(false);
                    onRemove(workspace.key);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm remove workspace ${workspace.key}`}>
                  <View style={styles.linkMain}>
                    <Text style={styles.removeText}>remove {workspace.key}</Text>
                    <Text style={styles.hint}>
                      the directory is left alone · agents pinned to it resolve to the default until
                      you fix them
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.row}
                  onPress={() => setConfirmRemove(true)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove workspace ${workspace.key}`}>
                  <View style={styles.linkMain}>
                    <Text style={styles.removeText}>remove from the config</Text>
                    <Text style={styles.hint}>the files stay on disk, the key stops existing</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>
      {menuEntry ? (
        <ActionSheet
          preview={`${menuEntry.file} · ${workspace.key}`}
          options={fileMenuOptions}
          onClose={() => setMenuEntry(null)}
        />
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
  cardDanger: { borderColor: palette.danger },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  linkMain: { flex: 1, gap: 2 },
  linkTitleLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexWrap: 'wrap' as const,
  },
  linkTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  hint: { fontSize: font.small, color: palette.textMuted },
  path: { flex: 1, fontSize: font.small, color: palette.textMuted, fontFamily: 'monospace' },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  form: { padding: space.md, gap: space.sm },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    color: palette.text,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    fontSize: font.body,
  },
  saveButton: {
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center' as const,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.accentText },
  saveTextOff: { fontSize: font.body, color: palette.textFaint },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  badgeDanger: { color: palette.danger, borderColor: palette.danger },
  layerButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  layerGlyph: { fontSize: 18, color: palette.accent },
  removeText: { fontSize: font.body, fontWeight: '600' as const, color: palette.danger },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  noteDanger: { fontSize: font.micro, color: palette.danger, paddingHorizontal: space.xs },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
