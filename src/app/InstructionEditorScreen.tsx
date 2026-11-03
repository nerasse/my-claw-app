import { ChevronIcon } from '../components/icons';
import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { EditorState } from '../core/instructions';
import { isDirty } from '../core/instructions';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

/** The one-line explanation of what saving will do, which differs per origin. */
export function saveHint(editor: EditorState): string {
  // A nested file is named by its own path, and it is never part of the system prompt: saying
  // which workspace it belongs to would place it on a layer it does not sit on.
  if (editor.origin === 'nested') return `saving edits ${editor.file} · reaches tool results, not the prompt`;
  if (editor.origin === 'own') return `saving edits ${editor.workspace}/${editor.file}`;
  if (editor.origin === 'off') {
    return `this layer is off · saving edits ${editor.workspace}/${editor.file} for when you turn it back on`;
  }
  if (editor.origin === 'inherited') {
    return `saving creates ${editor.workspace}/${editor.file}, today read from ${editor.from || 'default'}`;
  }
  return `saving creates ${editor.workspace}/${editor.file} from the shipped default`;
}

/**
 * One prompt file, editable. An inherited copy opens pre-filled with the content that already
 * applies, so saving it changes nothing for the agent: it only turns a resolution into a file
 * this workspace owns and the user can edit. A nested AGENTS.md is editable too, but never
 * creatable: it is always opened from a file that already exists on disk.
 */
export function InstructionEditorScreen({
  editor,
  maxBytes,
  onBack,
  onChange,
  onSave,
  onReload,
}: {
  editor: EditorState;
  maxBytes: number;
  onBack: () => void;
  onChange: (draft: string) => void;
  onSave: () => void;
  onReload: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const dirty = isDirty(editor);
  const tooLarge = maxBytes > 0 && editor.draft.length > maxBytes;
  const busy = editor.status === 'loading' || editor.status === 'saving';
  const canSave = editor.editable && dirty && !busy && !tooLarge && editor.status !== 'conflict';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to instructions">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{editor.file}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {editor.workspace}
            {editor.origin && editor.origin !== 'own' ? ` · ${editor.origin}` : ''}
          </Text>
        </View>
        {editor.editable ? (
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={[styles.saveButton, canSave ? styles.saveEnabled : styles.saveDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            accessibilityLabel={editor.status === 'saving' ? 'Saving' : 'Save'}>
            <Text style={canSave ? styles.saveText : styles.saveTextOff}>
              {editor.status === 'saving' ? '...' : 'Save'}
            </Text>
          </Pressable>
        ) : null}
        <CloseButton />
      </View>

      {editor.status === 'conflict' ? (
        <View style={styles.conflict}>
          <Text style={styles.conflictText} accessibilityLabel={`Instructions conflict ${editor.error ?? ''}`}>
            {editor.error ?? 'changed on the server since it was opened'}
          </Text>
          {/* The agent writes AGENTS.md too. Reloading is the only honest way out: saving over
              it would drop what it appended, and the user would never know. */}
          <Pressable
            onPress={onReload}
            style={styles.conflictButton}
            accessibilityRole="button"
            accessibilityLabel="Reload from the server, losing this draft">
            <Text style={styles.conflictButtonText}>Reload</Text>
          </Pressable>
        </View>
      ) : editor.error ? (
        <Text style={styles.error} accessibilityLabel={`Instructions error ${editor.error}`}>
          {editor.error}
        </Text>
      ) : null}

      {tooLarge ? (
        <Text style={styles.error} accessibilityLabel="Instructions too large to save">
          {`too large to save: ${editor.draft.length} of ${maxBytes} characters`}
        </Text>
      ) : null}

      {editor.status === 'loading' ? (
        <View style={styles.emptyArea}>
          <Text style={styles.empty}>loading...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            value={editor.draft}
            onChangeText={onChange}
            editable={editor.editable && editor.status !== 'saving'}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textAlignVertical="top"
            accessibilityLabel={`${editor.file} content`}
          />
          <Text style={styles.note}>
            {editor.editable ? saveHint(editor) : 'read-only: injected in tool results during a run'}
          </Text>
          {editor.editable ? (
            <Text style={styles.note}>takes effect on the next message, no restart needed</Text>
          ) : null}
        </ScrollView>
      )}
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
    borderWidth: 1,
  },
  saveEnabled: { borderColor: palette.accent, backgroundColor: palette.surfaceAlt },
  saveDisabled: { borderColor: palette.border },
  saveText: { fontSize: font.meta, fontWeight: '600' as const, color: palette.accent },
  saveTextOff: { fontSize: font.meta, color: palette.textFaint },
  body: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
  input: {
    minHeight: 320,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    padding: space.md,
    fontSize: font.small,
    fontFamily: 'monospace',
  },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  conflict: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    margin: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  conflictText: { flex: 1, fontSize: font.meta, color: palette.danger },
  conflictButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  conflictButtonText: { fontSize: font.meta, fontWeight: '600' as const, color: palette.danger },
  emptyArea: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg },
  empty: { fontSize: font.meta, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
