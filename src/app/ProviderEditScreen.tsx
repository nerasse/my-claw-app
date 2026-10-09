import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { ProviderInfo, ProvidersEnvResultFrame } from '../core/protocol';
import { envNamePresent } from '../core/providers';
import {
  discoveryLine,
  envNameFor,
  freshName,
  keySite,
  NAME_TAKEN,
  nameTaken,
  providerKeyFor,
  serviceOf,
  type ProviderService,
} from '../core/providerServices';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { CloseButton } from '../components/CloseButton';

export type ProviderType = 'openai' | 'codex' | 'anthropic';

/** Server rule for the config key (the MCP one: it becomes part of the model namespace). */
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** Env names cannot carry dashes: the suggestion turns the key into one. */
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ProviderPatch {
  key: string;
  providerType: ProviderType;
  baseUrl: string;
  group: string;
  discover: boolean;
  promptCache: boolean;
  reasoningReplay: boolean;
  pricingProvider: string;
  fallbackModel: string;
  apiKeyEnv: string;
  envValue: string;
}

/**
 * The provider form, for adding one and for editing one. What a newcomer needs is on top: a name,
 * a key and, for a custom one, its address. Everything else (the config key, the engine, the
 * address of a known service, the variable the key is stored in, the switches) is in Advanced,
 * folded but never removed, for every provider (owner, 2026-10-05: "laisse la main pour les
 * utilisateurs avancés").
 *
 * Adding, the key and the variable follow the name until Advanced edits them: "OpenRouter boulot"
 * is `openrouter-boulot` and `OPENROUTER_BOULOT_API_KEY`, so a second account of a service never
 * lands on the first one's key or variable.
 */
export function ProviderEditScreen({
  mode,
  provider,
  service,
  providers,
  env,
  error,
  busy,
  onBack,
  onSave,
  onDelete,
  onOpenEnv,
  onEnvSet,
  onEnvRemove,
}: {
  mode: 'create' | 'edit';
  /** The entry being edited, null when adding. */
  provider: ProviderInfo | null;
  /** The service being added, absent for Custom. */
  service?: ProviderService;
  /** Every declared provider: the names and keys a new one must not take. */
  providers: readonly ProviderInfo[];
  env: Omit<ProvidersEnvResultFrame, 'type'> | null;
  error: string | null;
  busy: boolean;
  onSave: (patch: ProviderPatch) => void;
  onDelete: () => void;
  onOpenEnv: () => void;
  onBack: () => void;
  /** Writes one ~/.my-claw/.env line -- the Claude Code version lever lives there. */
  onEnvSet: (name: string, value: string) => void;
  onEnvRemove: (name: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const creating = mode === 'create';
  const known = creating ? service : provider ? serviceOf(provider) : undefined;
  const takenKeys = providers.map(p => p.key);

  const [name, setName] = useState(provider?.group ?? (service ? freshName(service, providers) : ''));
  // Null while the key follows the name; a string once Advanced edited it. Editing, it is the key.
  const [keyDraft, setKeyDraft] = useState<string | null>(provider?.key ?? null);
  const [envDraft, setEnvDraft] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<ProviderType>(
    (provider?.type as ProviderType | undefined) ?? service?.type ?? 'openai',
  );
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? service?.baseUrl ?? '');
  // On for a new provider: without discovery a fresh entry lists no model, and the default model
  // picker is empty with nothing saying why.
  const [discover, setDiscover] = useState(provider?.discover ?? true);
  const [promptCache, setPromptCache] = useState(provider?.promptCache ?? false);
  // `?? true`, not `?? false`: this one is on unless the owner turns it off. The providers that
  // document reasoning replay require it, and an endpoint that returns no reasoning gets none back.
  const [reasoningReplay, setReasoningReplay] = useState(provider?.reasoningReplay ?? true);
  const [pricingProvider, setPricingProvider] = useState(provider?.pricingProvider ?? service?.pricingProvider ?? '');
  const [fallbackModel, setFallbackModel] = useState(provider?.fallbackModel ?? '');
  const [envValue, setEnvValue] = useState('');
  const [cliVersion, setCliVersion] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const claim = env?.claudeClaim;

  const key = keyDraft ?? providerKeyFor(name, service?.key ?? 'custom', takenKeys);
  const openai = providerType === 'openai';
  const plan = provider?.account !== undefined;
  // An Anthropic provider with a key of its own (the Claude API, Anthropic-compatible relays) takes
  // its key from .env like an OpenAI one; a plan signs in on its own page instead.
  const keyed = !plan && (openai || providerType === 'anthropic');
  // A custom provider gets a variable only once a key is given: a local endpoint needs none, and a
  // variable that holds nothing reads as a missing key.
  const derivedEnv = keyed && (service || envValue.trim()) ? envNameFor(key, service) : '';
  const apiKeyEnv = (creating ? envDraft ?? derivedEnv : provider?.keyEnv ?? '').trim();
  // Editing, the provider's own snapshot says whether its key is there; the variable list may not
  // have arrived yet, and read as "missing" for a key that is perfectly set.
  const envSet = creating ? envNamePresent(env, apiKeyEnv) : provider?.keyPresent === true;

  const keyValid = KEY_RE.test(key);
  const keyTaken = (creating || key !== provider?.key) && takenKeys.includes(key);
  const envNameValid = apiKeyEnv === '' || ENV_NAME_RE.test(apiKeyEnv);
  const baseUrlValid = !openai || baseUrl.trim() !== '';
  const nameClash = nameTaken(name, providers, provider?.key);
  const nameValid = name.trim() !== '' && !nameClash;
  // A known service is nothing without its key: Add waits for one, unless the variable holds it.
  const keyGiven = !creating || !service || envSet || envValue.trim() !== '';
  const advancedValid = keyValid && !keyTaken && envNameValid && (creating && !service ? true : baseUrlValid);
  const canSave = nameValid && keyGiven && advancedValid && baseUrlValid && !busy;

  const title = creating ? (service ? `Add ${service.label}` : 'Custom provider') : name.trim() || provider?.key || '';
  const subtitle = creating ? (service ? service.hint : 'any OpenAI-compatible API') : 'provider settings';
  const models = !creating && provider ? discoveryLine(provider) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={creating ? 'Back to add a provider' : 'Back to provider'}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Pressable
          onPress={() =>
            // The disabled prop stops the touch, not a stray programmatic press (tests, AT).
            canSave &&
            onSave({
              key: key.trim(),
              providerType,
              baseUrl: baseUrl.trim(),
              group: name.trim(),
              discover,
              promptCache,
              reasoningReplay,
              pricingProvider: pricingProvider.trim(),
              fallbackModel: fallbackModel.trim(),
              apiKeyEnv,
              envValue: envValue.trim(),
            })
          }
          disabled={!canSave}
          style={[styles.headerSave, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={creating ? 'Create provider' : 'Save provider'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>{busy ? '...' : creating ? 'Add' : 'Save'}</Text>
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Provider error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={service ? service.name : 'My endpoint'}
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            accessibilityLabel="Provider name"
          />
          {nameClash ? (
            <Text style={[styles.note, styles.noteTaken]}>{NAME_TAKEN}</Text>
          ) : (
            <Text style={styles.note}>how it reads in the model picker · two accounts of one service, two names</Text>
          )}
        </View>

        {creating && !service ? (
          <View style={styles.category}>
            <Text style={styles.section}>address</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://api.example.com/v1"
              placeholderTextColor={styles.placeholder.color}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
              accessibilityLabel="Provider base url"
            />
            <Text style={styles.note}>the OpenAI-compatible base, the one /models and /chat/completions hang off</Text>
          </View>
        ) : null}

        {keyed ? (
          <View style={styles.category}>
            <Text style={styles.section}>API key</Text>
            {!creating && apiKeyEnv ? (
              <Text style={[styles.note, !envSet && styles.noteTaken]}>
                {envSet ? 'set on the server · paste a new one below to replace it' : 'missing on the server · paste it below'}
              </Text>
            ) : null}
            {creating || apiKeyEnv ? (
              <TextInput
                style={styles.input}
                value={envValue}
                onChangeText={setEnvValue}
                placeholder={!creating && envSet ? 'a new key, to replace the one set' : 'paste the key, never shown back'}
                placeholderTextColor={styles.placeholder.color}
                secureTextEntry
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Provider API key"
              />
            ) : (
              <Text style={styles.note}>no key: this provider sends none · a variable can be set in Advanced</Text>
            )}
            {creating && envSet && apiKeyEnv ? (
              <Text style={styles.note}>{`a key is already set in ${apiKeyEnv} · leave this empty to use it`}</Text>
            ) : creating && !service ? (
              <Text style={styles.note}>optional: a local endpoint may need none</Text>
            ) : null}
            {known ? (
              <Pressable
                onPress={() => Linking.openURL(known.keyUrl).catch(() => {})}
                accessibilityRole="link"
                accessibilityLabel={`Get a key at ${keySite(known)}`}>
                <Text style={styles.keyLink}>{`Get a key at ${keySite(known)} ↗`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.note}>signs in on its own page · no key to paste here</Text>
        )}

        {models ? (
          <View style={styles.category}>
            <Text style={styles.section}>models</Text>
            <Text style={[styles.status, models.failed && styles.statusFailed]} accessibilityLabel={`Provider models ${models.text}`}>
              {models.text}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => setAdvanced(open => !open)}
          style={styles.advancedToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          accessibilityLabel="Advanced settings">
          <Text style={styles.advancedText}>advanced</Text>
          <Text style={styles.chevron}>{advanced ? '⌄' : '›'}</Text>
        </Pressable>
        {!advanced && !advancedValid ? (
          <Text style={[styles.note, styles.noteTaken]}>a setting in Advanced needs attention</Text>
        ) : null}

        {advanced ? (
          <View style={styles.advancedBody}>
            <View style={styles.category}>
              <Text style={styles.section}>key</Text>
              <TextInput
                style={styles.input}
                value={key}
                onChangeText={setKeyDraft}
                placeholder="openrouter"
                placeholderTextColor={styles.placeholder.color}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Provider key"
              />
              {keyTaken ? (
                <Text style={[styles.note, styles.noteTaken]}>a provider with this key already exists · pick another</Text>
              ) : !keyValid ? (
                <Text style={[styles.note, styles.noteTaken]}>lowercase letters, digits, dashes and underscores only</Text>
              ) : (
                <Text style={styles.note}>
                  {creating
                    ? 'the model namespace: models read key/model · follows the name until edited here'
                    : 'changing it renames the entry and every reference to it'}
                </Text>
              )}
            </View>

            <View style={styles.category}>
              <Text style={styles.section}>engine</Text>
              <View style={styles.segment}>
                {(['openai', 'codex', 'anthropic'] as const).map(type => (
                  <Pressable
                    key={type}
                    onPress={() => setProviderType(type)}
                    style={[styles.segmentItem, providerType === type && styles.segmentActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: providerType === type }}
                    accessibilityLabel={`Engine ${type}`}>
                    <Text style={providerType === type ? styles.segmentTextActive : styles.segmentText}>{type}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {(openai || (providerType === 'anthropic' && !plan)) && !(creating && !service) ? (
              <View style={styles.category}>
                <Text style={styles.section}>base url</Text>
                <TextInput
                  style={styles.input}
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  placeholder={openai ? 'https://api.example.com/v1' : 'api.anthropic.com when empty'}
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="none"
                  keyboardType="url"
                  accessibilityLabel="Provider base url"
                />
                {openai && !baseUrlValid ? <Text style={[styles.note, styles.noteTaken]}>an OpenAI-compatible provider needs its address</Text> : null}
              </View>
            ) : null}

            {keyed ? (
              <View style={styles.category}>
                <Text style={styles.section}>environment variable</Text>
                {creating ? (
                  <>
                    <TextInput
                      style={styles.input}
                      value={apiKeyEnv}
                      onChangeText={setEnvDraft}
                      placeholder={envNameFor(key, service)}
                      placeholderTextColor={styles.placeholder.color}
                      autoCorrect={false}
                      autoCapitalize="characters"
                      accessibilityLabel="Provider env name"
                    />
                    <Text style={[styles.note, !envNameValid && styles.noteTaken]}>
                      {envNameValid
                        ? 'the ~/.my-claw/.env line the key is written to · empty sends no key'
                        : 'letters, digits and underscores, not starting with a digit'}
                    </Text>
                  </>
                ) : (
                  <Pressable
                    onPress={onOpenEnv}
                    style={[styles.linkRow, styles.link]}
                    accessibilityRole="button"
                    accessibilityLabel="Open environment settings">
                    <View style={styles.linkMain}>
                      <Text style={styles.linkText}>{apiKeyEnv || 'none'}</Text>
                      <Text style={styles.note}>rename the variable, or read the key from another one</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            <View style={styles.category}>
              <Text style={styles.section}>behaviour</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>discover models</Text>
                <Switch value={discover} onValueChange={setDiscover} accessibilityLabel="Provider discover" />
              </View>
              {openai ? (
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>prompt caching</Text>
                  <Switch value={promptCache} onValueChange={setPromptCache} accessibilityLabel="Provider prompt cache" />
                </View>
              ) : null}
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>reasoning replay</Text>
                <Switch value={reasoningReplay} onValueChange={setReasoningReplay} accessibilityLabel="Provider reasoning replay" />
              </View>
            </View>

            {openai ? (
              <View style={styles.category}>
                <Text style={styles.section}>pricing</Text>
                <TextInput
                  style={styles.input}
                  value={pricingProvider}
                  onChangeText={setPricingProvider}
                  placeholder="models.dev provider that prices it"
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Provider pricing provider"
                />
              </View>
            ) : (
              <View style={styles.category}>
                <Text style={styles.section}>fallback model</Text>
                <TextInput
                  style={styles.input}
                  value={fallbackModel}
                  onChangeText={setFallbackModel}
                  placeholder="model id used when the primary errors out"
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Provider fallback model"
                />
              </View>
            )}

            {providerType === 'anthropic' ? (
              <View style={styles.envCard}>
                <Text style={styles.envTitle}>Claude Code version</Text>
                <Text style={styles.note}>
                  {claim
                    ? claim.overridden
                      ? `claims ${claim.version} · overridden in .env (the captured client claims ${claim.pinned})`
                      : `claims ${claim.version} · the captured client, no override`
                    : 'the version subscription requests claim in their headers. Anthropic gates a new model on it.'}
                </Text>
                <Text style={styles.note}>
                  Stored in ~/.my-claw/.env as ANTHROPIC_CLI_VERSION. Applies on the next request of a run in flight: no restart, no end of run.
                </Text>
                <TextInput
                  style={styles.input}
                  value={cliVersion}
                  onChangeText={setCliVersion}
                  placeholder={claim ? `pinned: ${claim.pinned}` : '2.1.280'}
                  placeholderTextColor={styles.placeholder.color}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Claude Code version"
                />
                <Pressable
                  onPress={() => {
                    const value = cliVersion.trim();
                    if (!value) return;
                    onEnvSet('ANTHROPIC_CLI_VERSION', value);
                    setCliVersion('');
                  }}
                  style={[styles.saveButton, cliVersion.trim() ? styles.saveEnabled : styles.saveDisabled]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !cliVersion.trim() }}
                  accessibilityLabel="Save Claude Code version">
                  <Text style={cliVersion.trim() ? styles.saveText : styles.saveTextOff}>Set version</Text>
                </Pressable>
                {claim?.overridden ? (
                  <Pressable
                    onPress={() => onEnvRemove('ANTHROPIC_CLI_VERSION')}
                    style={styles.dangerRow}
                    accessibilityRole="button"
                    accessibilityLabel="Use the pinned Claude Code version">
                    <Text style={styles.dangerText}>Use the pinned version</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}


        {!creating && provider ? (
          <Pressable onPress={onDelete} style={styles.dangerRow} accessibilityRole="button" accessibilityLabel="Delete provider">
            <Text style={styles.dangerText}>Delete provider</Text>
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
  placeholder: { color: palette.textFaint },
  envCard: {
    marginTop: space.lg,
  },
  envTitle: {
    color: palette.text,
    fontSize: font.body,
    fontWeight: '600' as const,
    marginBottom: space.xs,
  },
  note: { fontSize: font.micro, color: palette.textFaint },
  noteTaken: { color: palette.danger },
  keyLink: { fontSize: font.small, color: palette.accent, fontWeight: '600' as const, paddingVertical: space.xs },
  status: { fontSize: font.body, color: palette.text },
  statusFailed: { color: palette.danger },
  advancedToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: space.sm,
  },
  advancedText: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  advancedBody: { gap: space.lg },
  segment: {
    flexDirection: 'row' as const,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden' as const,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: space.sm,
    alignItems: 'center' as const,
  },
  segmentActive: { backgroundColor: palette.surfaceAlt },
  segmentText: { fontSize: font.meta, color: palette.textMuted },
  segmentTextActive: { fontSize: font.meta, color: palette.text, fontWeight: '600' as const },
  switchRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  switchLabel: { fontSize: font.body, color: palette.text },
  linkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  link: { gap: space.sm },
  linkMain: { flex: 1, gap: 1 },
  linkText: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  chevron: { fontSize: 22, color: palette.textFaint },
  saveButton: {
    marginTop: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center' as const,
  },
  // In the header, like every other editor: at the end of a long form it went under the keyboard
  // with nothing on screen to save with (owner, 2026-10-09).
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
