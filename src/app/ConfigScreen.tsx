import { ChevronIcon } from '../components/icons';
import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

export type ConfigStatus = 'loading' | 'ready' | 'saving' | 'conflict';

export interface ConfigEditorState {
  status: ConfigStatus;
  draft: string;
  loaded: string;
  sha: string;
  maxBytes: number;
  error: string | null;
  /** What the last successful save applied, so the page can report the hot reload. */
  changed: string[];
  rebootRequired: string[];
}

/**
 * The raw config.json editor, for everything the structured pages do not cover. The sha round
 * trip and the conflict handling are the instructions page's contract; on top of it, a save that
 * the server accepted reports which hot-reloaded sections changed and which ones need a reboot
 * (channel tokens, the bind port, the workspace path).
 */
export function ConfigScreen({
  editor,
  onBack,
  onChange,
  onSave,
  onReload,
}: {
  editor: ConfigEditorState;
  onBack: () => void;
  onChange: (draft: string) => void;
  onSave: () => void;
  onReload: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const tooLarge = editor.maxBytes > 0 && editor.draft.length > editor.maxBytes;
  const busy = editor.status === 'loading' || editor.status === 'saving';
  const dirty = editor.draft !== editor.loaded;
  const canSave = dirty && !busy && !tooLarge && editor.status !== 'conflict';

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
          <Text style={styles.title}>config.json</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {editor.rebootRequired.length > 0
              ? `reboot needed for: ${editor.rebootRequired.join(', ')}`
              : 'hot-reloaded on save'}
          </Text>
        </View>
        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[styles.saveButton, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={editor.status === 'saving' ? 'Saving config' : 'Save config'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>
            {editor.status === 'saving' ? '...' : 'Save'}
          </Text>
        </Pressable>
        <CloseButton />
      </View>

      {editor.status === 'conflict' ? (
        <View style={styles.conflict}>
          <Text style={styles.conflictText} accessibilityLabel={`Config conflict ${editor.error ?? ''}`}>
            {editor.error ?? 'changed on the server since it was opened'}
          </Text>
          <Pressable
            onPress={onReload}
            style={styles.conflictButton}
            accessibilityRole="button"
            accessibilityLabel="Reload the config from the server, losing this draft">
            <Text style={styles.conflictButtonText}>Reload</Text>
          </Pressable>
        </View>
      ) : editor.error ? (
        <Text style={styles.error} accessibilityLabel={`Config error ${editor.error}`}>
          {editor.error}
        </Text>
      ) : null}

      {editor.changed.length > 0 && !dirty ? (
        <Text style={styles.saved} accessibilityLabel="Config saved and hot-reloaded">
          {`saved · applied: ${editor.changed.join(', ')}`}
        </Text>
      ) : null}

      {tooLarge ? (
        <Text style={styles.error} accessibilityLabel="Config too large to save">
          {`too large to save: ${editor.draft.length} of ${editor.maxBytes} characters`}
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
            editable={editor.status !== 'saving'}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textAlignVertical="top"
            accessibilityLabel="config.json content"
          />
          <Text style={styles.note}>
            validated through the boot parser before saving · a broken section is refused, a
            valid one is hot-reloaded
          </Text>
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
  body: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: space.md,
    fontSize: font.meta,
    color: palette.text,
    minHeight: 320,
  },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  emptyArea: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.lg },
  empty: { fontSize: font.meta, color: palette.textFaint, textAlign: 'center' as const },
  conflict: {
    padding: space.md,
    gap: space.sm,
    alignItems: 'center' as const,
  },
  conflictText: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
  },
  conflictButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  conflictButtonText: { fontSize: font.small, fontWeight: '600' as const, color: palette.danger },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  saved: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textMuted,
    padding: space.sm,
  },
});
