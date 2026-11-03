import { ChevronIcon, CloseIcon, PlusIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { InstructionEntry, NestedInstruction, WorkspaceEntry } from '../core/protocol';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';

/** The loader's workspace key rules, mirrored so the form refuses before the server does. */
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * What a row says about the prompt inside a workspace, so the list keeps the overview the old
 * instructions page gave for free. Empty while the listing is still in flight: a row that
 * claimed "4 inherited" before the answer landed would be wrong for a second.
 */
function promptSummary(
  key: string,
  entries: InstructionEntry[],
  nested: NestedInstruction[],
): string {
  const files = entries.filter(entry => entry.workspace === key);
  if (files.length === 0) return '';
  const own = files.filter(entry => entry.origin === 'own').length;
  const off = files.filter(entry => entry.origin === 'off' || entry.inherit === 'none').length;
  const count = nested.filter(item => item.workspace === key).length;
  const parts = [`${own}/${files.length} own`];
  if (off > 0) parts.push(`${off} off`);
  if (count > 0) parts.push(`${count} nested`);
  return parts.join(' · ');
}

/**
 * The workspaces of the server: this page adds and lists them, each row opening the workspace
 * itself (its directory, its prompt files, its nested AGENTS.md). The key is what agents and cron
 * reference, the path is the only thing the key stands for. Everything is written to
 * config.workspaces, hot-reloaded in place: the skills and agent tiers follow live.
 *
 * Renaming, repointing and removing live on the workspace's own page, next to what they affect --
 * not on this list, where a mis-tap on "remove" was one row away from the workspace above.
 */
export function WorkspacesScreen({
  workspaces,
  entries,
  nested,
  error,
  busy,
  onBack,
  onAdd,
  onOpen,
}: {
  workspaces: WorkspaceEntry[];
  /** The instruction listing, for the per-row summary only. Empty until it lands. */
  entries: InstructionEntry[];
  nested: NestedInstruction[];
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onAdd: (key: string, path: string) => void;
  onOpen: (key: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [adding, setAdding] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [pathDraft, setPathDraft] = useState('');

  const openEditor = (): void => {
    setAdding(true);
    setKeyDraft('');
    setPathDraft('');
  };
  const closeEditor = (): void => setAdding(false);

  const keyValid = KEY_RE.test(keyDraft.trim()) && keyDraft.trim() !== 'default';
  const pathValid = pathDraft.trim().startsWith('/');
  const formValid = keyValid && pathValid && !busy;
  const targetExists = workspaces.some(w => w.key === keyDraft.trim());

  const submit = (): void => {
    if (!adding || !formValid) return;
    onAdd(keyDraft.trim(), pathDraft.trim());
    closeEditor();
  };

  const named = workspaces.filter(w => !w.default);
  const defaultEntry = workspaces.find(w => w.default);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Workspaces</Text>
          <Text style={styles.subtitle}>
            {`${named.length} named · the default holds your conversations and memory`}
          </Text>
        </View>
        <Pressable
          onPress={() => (adding ? closeEditor() : openEditor())}
          style={[styles.addButton, adding ? styles.addActive : styles.addIdle]}
          accessibilityRole="button"
          accessibilityLabel={adding ? 'Cancel add workspace' : 'Add workspace'}>
          {adding ? <CloseIcon size={18} tone="accent" /> : <PlusIcon size={18} tone="accent" />}
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Workspaces error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {adding ? (
          <View style={styles.category}>
            <Text style={styles.section}>new workspace</Text>
            <View style={styles.card}>
              <View style={styles.formRow}>
                <Text style={styles.rowKey}>key (what agents reference)</Text>
                <TextInput
                  style={styles.input}
                  value={keyDraft}
                  onChangeText={setKeyDraft}
                  placeholder="sofa"
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Workspace key"
                />
              </View>
              <View style={styles.separator} />
              <View style={styles.formRow}>
                <Text style={styles.rowKey}>path</Text>
                <TextInput
                  style={styles.input}
                  value={pathDraft}
                  onChangeText={setPathDraft}
                  placeholder="/srv/sofa"
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Workspace path"
                />
              </View>
            </View>
            {targetExists ? (
              <Text style={styles.noteRemoved}>a workspace with this key already exists</Text>
            ) : null}
            <Pressable
              onPress={submit}
              disabled={!formValid}
              style={[styles.saveButton, formValid ? styles.saveEnabled : styles.saveDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !formValid }}
              accessibilityLabel={busy ? 'Saving workspace' : 'Save workspace'}>
              <Text style={formValid ? styles.saveText : styles.saveTextOff}>
                {busy ? '...' : 'Create'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>default</Text>
          <View style={[styles.card, styles.cardDefault]}>
            <Pressable
              style={styles.itemRow}
              onPress={() => onOpen('default')}
              accessibilityRole="button"
              accessibilityLabel="Open workspace default">
              <View style={styles.rowMain}>
                <Text style={[styles.key, styles.keyDefault]}>default</Text>
                <Text style={styles.path} selectable>
                  {defaultEntry?.path ?? ''}
                </Text>
                <Text style={styles.itemHint}>
                  {promptSummary('default', entries, nested) || 'your conversations and memory'}
                </Text>
              </View>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>named</Text>
          <View style={styles.card}>
            {named.length === 0 ? (
              <View style={styles.itemRow}>
                <Text style={styles.itemHint}>no named workspaces yet</Text>
              </View>
            ) : (
              named.map((item, index) => (
                <View key={item.key}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    style={styles.itemRow}
                    onPress={() => onOpen(item.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open workspace ${item.key}`}>
                    <View style={styles.rowMain}>
                      <Text style={styles.key} numberOfLines={1}>
                        {item.key}
                      </Text>
                      {/* No line cap: a path is a path, and a truncated one would point nowhere
                          visible. It wraps instead. */}
                      <Text style={styles.path} selectable>
                        {item.path}
                      </Text>
                      <Text style={styles.itemHint}>{promptSummary(item.key, entries, nested)}</Text>
                    </View>
                    <ChevronIcon direction="right" size={16} tone="faint" />
                  </Pressable>
                </View>
              ))
            )}
          </View>
          <Text style={styles.note}>
            a workspace holds its own prompt files, skills and agents · open one to edit them,
            rename it or repoint its directory
          </Text>
        </View>
      </ScrollView>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
  },
  addActive: { borderColor: palette.danger, backgroundColor: palette.surfaceAlt },
  addIdle: { borderColor: palette.accent, backgroundColor: palette.surfaceAlt },
  addTextActive: { fontSize: 18, color: palette.danger },
  addTextIdle: { fontSize: 18, color: palette.accent },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: { fontSize: font.micro, color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
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
    paddingVertical: space.sm,
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  cardDefault: { borderColor: palette.accent },
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  key: {
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  keyDefault: { color: palette.accent },
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
  path: { flex: 1, fontSize: font.small, color: palette.textMuted, fontFamily: 'monospace' },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  formRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowKey: { fontSize: font.small, color: palette.textMuted, width: 96 },
  input: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body,
    color: palette.text,
  },
  placeholder: { color: palette.textFaint },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  noteRemoved: { fontSize: font.micro, color: palette.danger, paddingHorizontal: space.xs },
  saveButton: {
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  saveTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  actionButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionText: { fontSize: font.small, color: palette.textMuted },
  removeButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  removeText: { fontSize: font.small, fontWeight: '600' as const, color: palette.danger },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
