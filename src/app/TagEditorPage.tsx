import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { connection } from '../core/connection';
import { useModelCatalog } from '../core/model';
import { useTags } from '../core/tags';
import { encodeAgentsConfigGet, encodeModelList, encodeTagsRouteUpsert, encodeTagsUpsert, type TagRouteCandidate } from '../core/protocol';
import { ModelPickerPage, pickerStart, type PickerState } from '../components/ModelSheet';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

function routeOf(tag: { route?: TagRouteCandidate[]; model?: string; effort?: string; contextCap?: number } | null): TagRouteCandidate[] {
  if (tag?.route?.length) return tag.route.map(candidate => ({ ...candidate }));
  return tag?.model ? [{ model: tag.model, ...(tag.effort ? { effort: tag.effort } : {}), ...(tag.contextCap !== undefined ? { contextCap: tag.contextCap } : {}) }] : [];
}

function sameRoute(a: TagRouteCandidate[], b: TagRouteCandidate[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ordered concrete model route editor. Picker changes stay local until Save. */
export function TagEditorPage({
  name,
  picker,
  pickerIndex,
  onPickerChange,
  onStartPicker,
  onClosePicker,
  onBack,
  onDelete,
  onDirtyChange,
}: {
  name: string;
  picker: PickerState | null;
  pickerIndex: number | null;
  onPickerChange: (state: PickerState) => void;
  onStartPicker: (index: number | null) => void;
  onClosePicker: () => void;
  onBack: () => void;
  onDelete: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const catalog = useModelCatalog();
  const { tags, error } = useTags();
  const tag = tags?.find(entry => entry.name === name) ?? null;
  const serverRoute = useMemo(() => routeOf(tag), [tag]);
  const [draft, setDraft] = useState<TagRouteCandidate[]>(serverRoute);
  const [fallbackToGlobalDefault, setFallbackToGlobalDefault] = useState(tag?.fallbackToGlobalDefault === true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty && !saving) {
      setDraft(serverRoute);
      setFallbackToGlobalDefault(tag?.fallbackToGlobalDefault === true);
    }
  }, [dirty, saving, serverRoute, tag?.fallbackToGlobalDefault]);

  useEffect(() => {
    if (!saving || !sameRoute(serverRoute, draft) || (tag?.fallbackToGlobalDefault === true) !== fallbackToGlobalDefault) return;
    setSaving(false);
    setDirty(false);
    onDirtyChange(false);
  }, [draft, fallbackToGlobalDefault, onDirtyChange, saving, serverRoute, tag?.fallbackToGlobalDefault]);

  useEffect(() => {
    onDirtyChange(dirty || saving);
  }, [dirty, onDirtyChange, saving]);

  const markDirty = (): void => {
    setDirty(true);
    onDirtyChange(true);
  };
  const candidate = pickerIndex === null ? undefined : draft[pickerIndex];
  const legacyTag = tag && !Array.isArray(tag.route);

  if (legacyTag) {
    return (
      <ModelPickerPage
        title={`Tag ${name}`}
        backLabel="Back to the tags list"
        models={catalog.models.filter(model => !model.id.startsWith('tag:'))}
        activeId={tag.model ?? ''}
        state={picker ?? pickerStart}
        onStateChange={onPickerChange}
        onClose={onBack}
        onCommit={choice => {
          const effort = choice.effort === undefined ? tag.effort : choice.effort ?? undefined;
          const contextCap = choice.context === undefined ? tag.contextCap : choice.context === 'full' ? undefined : choice.context;
          connection.send(encodeTagsUpsert(name, choice.model, effort, contextCap)).catch(() => {});
          connection.send(encodeModelList()).catch(() => {});
          connection.send(encodeAgentsConfigGet()).catch(() => {});
          onDirtyChange(false);
          onBack();
        }}
        skipPinsOnTag
        effort={{ current: tag.effort ?? '' }}
        context={{ ...(tag.contextCap === undefined ? {} : { current: tag.contextCap }) }}
      />
    );
  }

  if (picker) {
    return (
      <ModelPickerPage
        title={pickerIndex === null ? `Add model to ${name}` : `Edit route item ${pickerIndex + 1}`}
        backLabel={`Back to ${name}`}
        models={catalog.models.filter(model => !model.id.startsWith('tag:'))}
        activeId={candidate?.model ?? ''}
        state={picker}
        onStateChange={onPickerChange}
        onClose={onClosePicker}
        onCommit={choice => {
          const current = candidate;
          const next: TagRouteCandidate = {
            model: choice.model,
            ...(choice.effort === undefined ? (current?.effort ? { effort: current.effort } : {}) : choice.effort ? { effort: choice.effort } : {}),
            ...(choice.context === undefined
              ? (current?.contextCap !== undefined ? { contextCap: current.contextCap } : {})
              : choice.context === 'full'
                ? {}
                : { contextCap: choice.context }),
          };
          setDraft(previous => pickerIndex === null ? [...previous, next] : previous.map((entry, index) => index === pickerIndex ? next : entry));
          markDirty();
          onClosePicker();
        }}
        skipPinsOnTag
        effort={{ current: candidate?.effort ?? '' }}
        context={{ ...(candidate?.contextCap === undefined ? {} : { current: candidate.contextCap }) }}
      />
    );
  }

  const save = (): void => {
    if (draft.length === 0 || saving) return;
    setSaving(true);
    connection.send(encodeTagsRouteUpsert(name, draft, fallbackToGlobalDefault)).catch(() => setSaving(false));
    connection.send(encodeModelList()).catch(() => {});
    connection.send(encodeAgentsConfigGet()).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to tags">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Tag {name}</Text>
        {tag ? <Pressable onPress={onDelete} disabled={saving} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Delete tag ${name}`}><Text style={styles.deleteText}>Delete</Text></Pressable> : null}
        <Pressable onPress={save} disabled={draft.length === 0 || saving} style={[styles.saveButton, draft.length > 0 && !saving ? styles.saveEnabled : styles.saveDisabled]} accessibilityRole="button" accessibilityLabel="Save">
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Fallback order</Text>
        {draft.map((entry, index) => (
          <View key={`${entry.model}-${index}`} style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.index}>{index + 1}</Text>
              <View style={styles.candidateMain}>
                <Text style={styles.model} numberOfLines={2}>{entry.model}</Text>
                <Text style={styles.meta}>{entry.effort ?? 'provider effort'} · {entry.contextCap === undefined ? 'agent/global cap' : `${entry.contextCap} tokens`}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable disabled={index === 0} onPress={() => { setDraft(previous => previous.map((item, i) => i === index - 1 ? previous[index]! : i === index ? previous[index - 1]! : item)); markDirty(); }}><Text style={index === 0 ? styles.disabledAction : styles.action}>↑</Text></Pressable>
              <Pressable disabled={index === draft.length - 1} onPress={() => { setDraft(previous => previous.map((item, i) => i === index ? previous[index + 1]! : i === index + 1 ? previous[index]! : item)); markDirty(); }}><Text style={index === draft.length - 1 ? styles.disabledAction : styles.action}>↓</Text></Pressable>
              <Pressable onPress={() => onStartPicker(index)}><Text style={styles.action}>edit</Text></Pressable>
              <Pressable onPress={() => { setDraft(previous => previous.filter((_, i) => i !== index)); markDirty(); }}><Text style={styles.delete}>delete</Text></Pressable>
            </View>
          </View>
        ))}
        <Pressable style={styles.addRow} onPress={() => onStartPicker(null)} accessibilityRole="button" accessibilityLabel="Add model">
          <Text style={styles.addGlyph}>+</Text><Text style={styles.addText}>Add model</Text>
        </Pressable>
        <Pressable style={styles.toggleRow} onPress={() => { setFallbackToGlobalDefault(value => !value); markDirty(); }} accessibilityRole="checkbox" accessibilityState={{ checked: fallbackToGlobalDefault }}>
          <View style={[styles.checkbox, fallbackToGlobalDefault && styles.checkboxOn]}>{fallbackToGlobalDefault ? <Text style={styles.check}>✓</Text> : null}</View>
          <View style={styles.toggleCopy}><Text style={styles.toggleTitle}>Fallback to global default</Text><Text style={styles.meta}>Try the global model after this route is exhausted</Text></View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: palette.border },
  backButton: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  title: { flex: 1, fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  deleteButton: { paddingHorizontal: space.sm, paddingVertical: space.sm },
  deleteText: { fontSize: font.small, color: palette.danger },
  saveButton: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.small, fontWeight: '600' as const, color: palette.surface },
  body: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
  sectionTitle: { fontSize: font.small, color: palette.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, backgroundColor: palette.surface, overflow: 'hidden' as const },
  cardMain: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, padding: space.md },
  index: { fontSize: font.body, color: palette.textMuted, width: 20, textAlign: 'center' as const },
  candidateMain: { flex: 1, gap: 3 },
  model: { fontSize: font.body, color: palette.text, fontWeight: '600' as const },
  meta: { fontSize: font.small, color: palette.textMuted },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: palette.surfaceAlt },
  action: { color: palette.accent, fontSize: font.small },
  disabledAction: { color: palette.border, fontSize: font.small },
  delete: { color: palette.danger, fontSize: font.small },
  addRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.md, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: palette.border, borderRadius: radius.lg },
  addGlyph: { color: palette.accent, fontSize: 20 },
  addText: { color: palette.accent, fontSize: font.body, fontWeight: '600' as const },
  toggleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, padding: space.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, marginTop: space.sm },
  checkbox: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  checkboxOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  check: { color: palette.surface, fontWeight: '700' as const },
  toggleCopy: { flex: 1, gap: 2 },
  toggleTitle: { color: palette.text, fontSize: font.body },
  error: { color: palette.danger, padding: space.md },
});
