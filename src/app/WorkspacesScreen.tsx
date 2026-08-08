import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { WorkspaceEntry } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/** The loader's workspace key rules, mirrored so the form refuses before the server does. */
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;

type Editor = { mode: 'add' } | { mode: 'edit'; key: string; path: string };

/**
 * The workspaces of the server, with full CRUD. The key is what agents and cron reference, the
 * path is the only thing the key stands for. One edit form handles both: renaming the key moves
 * the agent pins that used it (server-side), changing the path repoints the directory. Removing
 * drops the entry (agent pins pointing at it are flagged red elsewhere and resolve to the
 * default until fixed). Everything is written to config.workspaces, which is hot-reloaded in
 * place: the skills and agent tiers follow live.
 */
export function WorkspacesScreen({
  workspaces,
  error,
  busy,
  onBack,
  onAdd,
  onRemove,
  onRename,
  onSetPath,
}: {
  workspaces: WorkspaceEntry[];
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onAdd: (key: string, path: string) => void;
  onRemove: (key: string) => void;
  onRename: (from: string, to: string) => void;
  onSetPath: (key: string, path: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [pathDraft, setPathDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const openEditor = (next: Editor): void => {
    setEditor(next);
    setKeyDraft(next.mode === 'edit' ? next.key : '');
    setPathDraft(next.mode === 'edit' ? next.path : '');
    setConfirmRemove(null);
  };
  const closeEditor = (): void => setEditor(null);

  const keyValid = KEY_RE.test(keyDraft.trim()) && keyDraft.trim() !== 'default';
  const pathValid = pathDraft.trim().startsWith('/');
  const editing = editor?.mode === 'edit';
  const keyChanged = editing ? keyDraft.trim() !== editor.key : false;
  const pathChanged = editing ? pathDraft.trim() !== editor.path : false;
  const unchanged = editing && !keyChanged && !pathChanged;
  const formValid = keyValid && pathValid && !busy && !unchanged;
  const targetExists = workspaces.some(w => w.key === keyDraft.trim() && (!editing || keyDraft.trim() !== editor.key));

  const submit = (): void => {
    if (!editor || !formValid) return;
    if (editor.mode === 'add') {
      onAdd(keyDraft.trim(), pathDraft.trim());
    } else {
      // One save can move both: the key (renaming it, pins follow) and the path (repointing
      // the directory). Each answer is a fresh listing, so the two frames settle in order.
      if (keyChanged) onRename(editor.key, keyDraft.trim());
      if (pathChanged) onSetPath(keyChanged ? keyDraft.trim() : editor.key, pathDraft.trim());
    }
    closeEditor();
  };

  const named = workspaces.filter(w => !w.default);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Workspaces</Text>
          <Text style={styles.subtitle}>
            {`${named.length} named · the default holds your conversations and memory`}
          </Text>
        </View>
        <Pressable
          onPress={() => (editor?.mode === 'add' ? closeEditor() : openEditor({ mode: 'add' }))}
          style={[styles.addButton, editor?.mode === 'add' ? styles.addActive : styles.addIdle]}
          accessibilityRole="button"
          accessibilityLabel={editor?.mode === 'add' ? 'Cancel add workspace' : 'Add workspace'}>
          <Text style={editor?.mode === 'add' ? styles.addTextActive : styles.addTextIdle}>
            {editor?.mode === 'add' ? '✕' : '+'}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Workspaces error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {editor ? (
          <View style={styles.category}>
            <Text style={styles.section}>
              {editor.mode === 'add' ? 'new workspace' : 'edit workspace'}
            </Text>
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
            {editing ? (
              <Text style={styles.note}>
                renaming moves the agent pins that used this key · changing the path repoints the
                directory
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
                {busy ? '...' : editor.mode === 'add' ? 'Create' : 'Save'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>default</Text>
          {/* The section header already names it: a row repeating "default" reads as a duplicate.
              The path is the whole point of this row, so it wraps instead of being clipped. */}
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.path} selectable>
                {workspaces.find(w => w.default)?.path ?? ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>named</Text>
          <View style={styles.card}>
            {named.length === 0 ? (
              <View style={styles.row}>
                <Text style={styles.itemHint}>no named workspaces yet</Text>
              </View>
            ) : (
              named.map((item, index) => (
                <View key={item.key}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.serverRow}>
                  <View style={styles.rowMain}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.key} numberOfLines={1}>
                        {item.key}
                      </Text>
                    </View>
                    {/* No line cap: a path is a path, and a truncated one would point nowhere
                        visible. It wraps instead, pushing the actions to their own lines. */}
                    <Text style={styles.path} selectable>
                      {item.path}
                    </Text>
                  </View>
                    {confirmRemove === item.key ? (
                      <Pressable
                        onPress={() => {
                          onRemove(item.key);
                          setConfirmRemove(null);
                        }}
                        style={styles.removeButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm remove workspace ${item.key}`}>
                        <Text style={styles.removeText}>remove</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => setConfirmRemove(item.key)}
                        style={styles.actionButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove workspace ${item.key}`}>
                        <Text style={styles.actionText}>remove</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => openEditor({ mode: 'edit', key: item.key, path: item.path })}
                      style={styles.actionButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit workspace ${item.key}`}>
                      <Text style={styles.actionText}>edit</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
          <Text style={styles.note}>
            agents pinned to a removed workspace are flagged red and resolve to the default until
            you fix them · the skills and agent tiers under a path follow live
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
  serverRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  key: {
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
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
