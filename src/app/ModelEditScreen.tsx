import { ChevronIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { ModelDeclaration, ModelOption, UnavailableModel } from '../core/protocol';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

/** The server's rule, mirrored so a refusal is not the first feedback: no whitespace, no `@`. */
const ID_RE = /^[^\s@]+$/;

/** Every rung the Anthropic ladder publishes, plus the off rung the resolver adds. */
const EFFORT_RUNGS: readonly string[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

/** The two fields a chat-completions endpoint may want its own reasoning back in. */
const REASONING_FIELDS: ReadonlyArray<{ label: string; value: 'reasoning_content' | 'reasoning_details' }> = [
  { label: 'content', value: 'reasoning_content' },
  { label: 'details', value: 'reasoning_details' },
];

/** What the form starts from: the effective values, whatever they came from. */
export type ModelDraft = ModelOption | UnavailableModel | null;

function digits(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Same parse, with zero kept. On a timeout `0` is the setting that removes the server's wall and
 * leaves Stop as the only one, so `digits` would silently drop the one value worth typing.
 */
function msDigits(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function numberText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** What the typed budget means, said back in the terms the server reports it in. */
function timeoutNote(value: string): string {
  const ms = msDigits(value);
  if (value.trim() === '') return 'blank follows the server default for this backend';
  if (ms === undefined) return 'whole milliseconds, or blank to follow the server default';
  if (ms === 0) return 'no wall at all: only Stop ends a silent request';
  return `cut after ${ms / 1000}s without a single byte back`;
}

/**
 * One declaration of `llm.models`, added or edited.
 *
 * The form opens on the **effective** values, so editing a discovered model shows what actually
 * runs rather than an empty page. Saving writes only what is filled in: the server merges a
 * declaration over discovery field by field, so a blank field means "keep following the provider"
 * and not "unset it". That is what makes an override survive a gateway renaming its catalogue.
 */
export function ModelEditScreen({
  mode,
  model,
  provider,
  providerType,
  declared,
  discovered,
  error,
  busy,
  onSave,
  onDelete,
  onBack,
}: {
  mode: 'create' | 'edit';
  /** The row that was tapped, null when adding. */
  model: ModelDraft;
  /** Provider key the declaration belongs to, pinned by the page it was opened from. */
  provider: string;
  /**
   * That provider's type. Only the Anthropic transport sends a thinking type, so the two switches
   * below are dead weight everywhere else -- saying so is the difference between a stored setting
   * and one the owner believes is doing something.
   */
  providerType?: string;
  /** A `llm.models` entry already carries this id, so there is something to delete. */
  declared: boolean;
  /** Discovery serves this id too, so deleting is a reset rather than a removal. */
  discovered: boolean;
  error: string | null;
  busy: boolean;
  onSave: (entry: ModelDeclaration) => void;
  onDelete: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const option = model as ModelOption | null;
  const [id, setId] = useState(model?.id ?? '');
  const [label, setLabel] = useState(model?.label ?? '');
  const [apiId, setApiId] = useState('');
  const [group, setGroup] = useState(option?.group ?? '');
  const [family, setFamily] = useState('');
  const [vision, setVision] = useState(option?.vision ?? false);
  const [context, setContext] = useState(numberText(option?.context));
  const [output, setOutput] = useState(numberText(option?.output));
  const [reasoningField, setReasoningField] = useState<string>(option?.reasoningField ?? '');
  const [timeoutMs, setTimeoutMs] = useState(numberText(option?.timeoutMs));
  const [supportsEffort, setSupportsEffort] = useState((option?.effortLevels?.length ?? 0) > 0);
  const [rungs, setRungs] = useState<string[]>(option?.effortLevels ?? []);
  const [thinkingAdaptive, setThinkingAdaptive] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);

  const trimmedId = id.trim();
  const idValid = ID_RE.test(trimmedId);
  const canSave = idValid && !busy;

  const toggleRung = (rung: string): void => {
    setRungs(current => (current.includes(rung) ? current.filter(r => r !== rung) : [...current, rung]));
  };

  const save = (): void => {
    const entry: ModelDeclaration = { id: trimmedId, provider };
    if (label.trim()) entry.label = label.trim();
    if (apiId.trim()) entry.apiId = apiId.trim();
    if (group.trim()) entry.group = group.trim();
    if (family.trim()) entry.family = family.trim();
    if (vision) entry.vision = true;
    const ctx = digits(context);
    const out = digits(output);
    if (ctx !== undefined) entry.context = ctx;
    if (out !== undefined) entry.output = out;
    const wall = msDigits(timeoutMs);
    if (wall !== undefined) entry.timeoutMs = wall;
    if (supportsEffort) {
      entry.supportsEffort = true;
      // Ordered by the ladder, never by tap order: the picker renders the list as it arrives.
      if (rungs.length > 0) entry.effortLevels = EFFORT_RUNGS.filter(rung => rungs.includes(rung));
    }
    if (thinkingAdaptive || thinkingEnabled) {
      entry.thinkingAdaptive = thinkingAdaptive;
      entry.thinkingEnabled = thinkingEnabled;
    }
    if (reasoningField === 'reasoning_content' || reasoningField === 'reasoning_details') {
      entry.reasoningField = reasoningField;
    }
    onSave(entry);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to provider">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{mode === 'create' ? 'New model' : 'Model settings'}</Text>
          <Text style={styles.subtitle}>
            {discovered ? `override on ${provider}` : `custom entry on ${provider}`}
          </Text>
        </View>
        <Pressable
          onPress={save}
          disabled={!canSave}
          style={[styles.headerSave, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={mode === 'create' ? 'Create model' : 'Save model'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>
            {busy ? '...' : mode === 'create' ? 'Create' : 'Save'}
          </Text>
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Model error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>id</Text>
          <TextInput
            style={styles.input}
            value={id}
            onChangeText={setId}
            editable={mode === 'create'}
            placeholder="litellm/my-model"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Model id"
          />
          <Text style={styles.note}>
            {mode === 'create'
              ? 'how the model is addressed everywhere · no spaces, no "@"'
              : 'the id names the entry, so it cannot be edited · delete and re-add to rename'}
          </Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>label</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder={trimmedId || 'My model'}
            placeholderTextColor={styles.placeholder.color}
            accessibilityLabel="Model label"
          />
          <Text style={styles.note}>what every menu shows · blank falls back on the id</Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>api id</Text>
          <TextInput
            style={styles.input}
            value={apiId}
            onChangeText={setApiId}
            placeholder="what the provider's API knows"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Model api id"
          />
          <Text style={styles.note}>
            only when it differs from the id · a qualified id already drops its provider prefix
          </Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>menu</Text>
          <TextInput
            style={styles.input}
            value={group}
            onChangeText={setGroup}
            placeholder="group, e.g. Claude/Opus"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            accessibilityLabel="Model group"
          />
          <TextInput
            style={styles.input}
            value={family}
            onChangeText={setFamily}
            placeholder="family, e.g. Opus"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            accessibilityLabel="Model family"
          />
          <Text style={styles.note}>group nests the picker submenu · family tracks a moving alias</Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>window</Text>
          <TextInput
            style={styles.input}
            value={context}
            onChangeText={setContext}
            placeholder="context tokens, e.g. 262144"
            placeholderTextColor={styles.placeholder.color}
            keyboardType="number-pad"
            accessibilityLabel="Context window"
          />
          <TextInput
            style={styles.input}
            value={output}
            onChangeText={setOutput}
            placeholder="max output tokens, e.g. 65536"
            placeholderTextColor={styles.placeholder.color}
            keyboardType="number-pad"
            accessibilityLabel="Output limit"
          />
          <Text style={styles.note}>blank keeps what the provider, models.dev or the model's family says</Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>request wall</Text>
          <TextInput
            style={styles.input}
            value={timeoutMs}
            onChangeText={setTimeoutMs}
            placeholder="silence allowed in ms, e.g. 900000"
            placeholderTextColor={styles.placeholder.color}
            keyboardType="number-pad"
            accessibilityLabel="Request timeout in milliseconds"
          />
          <Text style={styles.note}>{timeoutNote(timeoutMs)}</Text>
        </View>

        <View style={styles.category}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>accepts images</Text>
            <Switch value={vision} onValueChange={setVision} accessibilityLabel="Vision capable" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>accepts effort</Text>
            <Switch
              value={supportsEffort}
              onValueChange={setSupportsEffort}
              accessibilityLabel="Supports effort"
            />
          </View>
          {supportsEffort ? (
            <View style={styles.rungs}>
              {EFFORT_RUNGS.map(rung => {
                const on = rungs.includes(rung);
                return (
                  <Pressable
                    key={rung}
                    onPress={() => toggleRung(rung)}
                    style={[styles.rung, on ? styles.rungOn : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Effort ${rung}${on ? ', supported' : ''}`}>
                    <Text style={on ? styles.rungTextOn : styles.rungText}>{rung}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Text style={styles.note}>
            no rung selected offers the whole ladder · an unpublished rung is refused by the API
          </Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>thinking</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>adaptive</Text>
            <Switch
              value={thinkingAdaptive}
              onValueChange={setThinkingAdaptive}
              accessibilityLabel="Thinking adaptive"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>enabled</Text>
            <Switch
              value={thinkingEnabled}
              onValueChange={setThinkingEnabled}
              accessibilityLabel="Thinking enabled"
            />
          </View>
          <Text style={providerType === 'anthropic' ? styles.note : styles.warnNote}>
            {providerType === 'anthropic'
              ? 'naming a type the model refuses is an HTTP 400, so leave both off unless /v1/models said so'
              : `not read by ${providerType ?? 'this provider'} · only the Anthropic transport sends a thinking type, so these switches are stored but change nothing here`}
          </Text>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>reasoning replay</Text>
          <View style={styles.rungs}>
            {REASONING_FIELDS.map(choice => {
              const on = reasoningField === choice.value;
              return (
                <Pressable
                  key={choice.label}
                  onPress={() => setReasoningField(on ? '' : choice.value)}
                  style={[styles.rung, on ? styles.rungOn : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Reasoning field ${choice.label}${on ? ', selected' : ''}`}>
                  <Text style={on ? styles.rungTextOn : styles.rungText}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>
            the message field this model reads its own prior reasoning back from · models.dev
            fills it, the model's family covers the rest, and off means nothing is replayed
          </Text>
        </View>


        {declared ? (
          <Pressable
            onPress={onDelete}
            style={styles.dangerRow}
            accessibilityRole="button"
            accessibilityLabel={discovered ? 'Reset to discovered' : 'Delete model'}>
            <Text style={styles.dangerText}>
              {discovered ? 'Reset to what the provider says' : 'Delete model'}
            </Text>
          </Pressable>
        ) : null}
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
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.sm },
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
  warnNote: { color: palette.warn, fontSize: 12, lineHeight: 17 },
  placeholder: { color: palette.textFaint },
  note: { fontSize: font.micro, color: palette.textFaint },
  switchRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  switchLabel: { fontSize: font.body, color: palette.text },
  rungs: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  rung: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  rungOn: { backgroundColor: palette.surfaceAlt, borderColor: palette.accent },
  rungText: { fontSize: font.meta, color: palette.textMuted },
  rungTextOn: { fontSize: font.meta, color: palette.text, fontWeight: '600' as const },
  // In the header, like every other editor: at the end of a long form it went under the keyboard.
  headerSave: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  saveTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  dangerRow: {
    borderWidth: 1,
    borderColor: palette.danger,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    alignItems: 'center' as const,
  },
  dangerText: { fontSize: font.body, color: palette.danger, fontWeight: '600' as const },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
