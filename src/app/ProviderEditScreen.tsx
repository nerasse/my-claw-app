import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { ProviderInfo, ProvidersEnvResultFrame } from '../core/protocol';
import { envNamePresent } from '../core/providers';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export type ProviderType = 'openai' | 'codex' | 'anthropic';

/** Server rule for the config key (the MCP one: it becomes part of the model namespace). */
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** Env names cannot carry dashes: the suggestion turns the key into one. */
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The suggestion for a fresh provider: `<KEY>_API_KEY`, dashes folded to underscores. */
export function suggestEnvName(key: string): string {
  const cleaned = key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return `${cleaned}_API_KEY`;
}

/**
 * The provider form, one page for both halves: creating (empty key, the env value may ride
 * along on the same Save) and editing (the key is the rename target, the env key has its own
 * page). Fields are type-aware: codex and anthropic own their tokens, so baseUrl, the env
 * section and prompt caching are openai-only, and fallbackModel is anthropic/codex-only.
 */
export function ProviderEditScreen({
  mode,
  provider,
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
  /** The entry being edited, null in create mode. */
  provider: ProviderInfo | null;
  env: Omit<ProvidersEnvResultFrame, 'type'> | null;
  error: string | null;
  busy: boolean;
  onSave: (patch: {
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
  }) => void;
  onDelete: () => void;
  onOpenEnv: () => void;
  onBack: () => void;
  /** Writes one ~/.my-claw/.env line -- the Claude Code version lever lives there. */
  onEnvSet: (name: string, value: string) => void;
  onEnvRemove: (name: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [key, setKey] = useState(provider?.key ?? '');
  const [providerType, setProviderType] = useState<ProviderType>(
    (provider?.type as ProviderType) ?? 'openai',
  );
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [group, setGroup] = useState(provider?.group ?? '');
  const [discover, setDiscover] = useState(provider?.discover ?? false);
  const [promptCache, setPromptCache] = useState(provider?.promptCache ?? false);
  // `?? true`, not `?? false`: this one is on unless the owner turns it off. The providers that
  // document reasoning replay require it, and an endpoint that returns no reasoning gets none back.
  const [reasoningReplay, setReasoningReplay] = useState(provider?.reasoningReplay ?? true);
  const [pricingProvider, setPricingProvider] = useState(provider?.pricingProvider ?? '');
  const [fallbackModel, setFallbackModel] = useState(provider?.fallbackModel ?? '');
  const [apiKeyEnv, setApiKeyEnv] = useState(provider?.keyEnv ?? (mode === 'create' ? '' : ''));
  const [envValue, setEnvValue] = useState('');
  const [cliVersion, setCliVersion] = useState('');
  const claim = env?.claudeClaim;

  const envName = apiKeyEnv.trim();
  const envSet = envNamePresent(env, envName);
  const envNameValid = envName === '' || ENV_NAME_RE.test(envName);
  const keyValid = KEY_RE.test(key);
  const openai = providerType === 'openai';
  const baseUrlValid = !openai || baseUrl.trim() !== '';
  const canSave = keyValid && envNameValid && baseUrlValid && !busy;

  const onSuggestedKey = (value: string): void => {
    setKey(value);
    if (mode === 'create' && !apiKeyEnv) setApiKeyEnv(suggestEnvName(value));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={mode === 'create' ? 'Back to providers' : 'Back to provider'}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{mode === 'create' ? 'New provider' : 'Provider settings'}</Text>
          <Text style={styles.subtitle}>
            {mode === 'create' ? 'a new entry under llm.providers' : provider?.key ?? ''}
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Provider error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>key</Text>
          <TextInput
            style={styles.input}
            value={key}
            onChangeText={onSuggestedKey}
            placeholder="openrouter"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Provider key"
          />
          <Text style={styles.note}>
            {mode === 'create'
              ? 'lowercase letters, digits and dashes · the model namespace'
              : 'changing it renames the entry and every reference to it'}
          </Text>
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
                <Text style={providerType === type ? styles.segmentTextActive : styles.segmentText}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {openai ? (
          <View style={styles.category}>
            <Text style={styles.section}>base url</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://api.example.com/v1"
              placeholderTextColor={styles.placeholder.color}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Provider base url"
            />
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>display</Text>
          <TextInput
            style={styles.input}
            value={group}
            onChangeText={setGroup}
            placeholder="OpenRouter (the picker group)"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            accessibilityLabel="Provider group"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>discover models</Text>
            <Switch
              value={discover}
              onValueChange={setDiscover}
              accessibilityLabel="Provider discover"
            />
          </View>
          {openai ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>prompt caching</Text>
              <Switch
                value={promptCache}
                onValueChange={setPromptCache}
                accessibilityLabel="Provider prompt cache"
              />
            </View>
          ) : null}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>reasoning replay</Text>
            <Switch
              value={reasoningReplay}
              onValueChange={setReasoningReplay}
              accessibilityLabel="Provider reasoning replay"
            />
          </View>
        </View>

        {openai ? (
          <View style={styles.category}>
            <Text style={styles.section}>environment variable</Text>
            {mode === 'create' ? (
              <>
                <TextInput
                  style={styles.input}
                  value={apiKeyEnv}
                  onChangeText={setApiKeyEnv}
                  placeholder={suggestEnvName(key || 'provider')}
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  accessibilityLabel="Provider env name"
                />
                {envSet ? (
                  <Text style={styles.note}>already set on the server · it will be reused, no value needed</Text>
                ) : envName ? (
                  <>
                    <Text style={styles.note}>not set yet · the value below is written to .env on Save</Text>
                    <TextInput
                      style={styles.input}
                      value={envValue}
                      onChangeText={setEnvValue}
                      placeholder="the secret value, never shown back"
                      placeholderTextColor={styles.placeholder.color}
                      secureTextEntry
                      autoCorrect={false}
                      accessibilityLabel="Provider env value"
                    />
                  </>
                ) : (
                  <Text style={styles.note}>no variable: the provider will have no API key</Text>
                )}
              </>
            ) : (
              <Pressable
                onPress={onOpenEnv}
                style={[styles.linkRow, styles.link]}
                accessibilityRole="button"
                accessibilityLabel="Open environment settings">
                <View style={styles.linkMain}>
                  <Text style={styles.linkText}>{envName || 'none'}</Text>
                  {envName ? (
                    <Text style={styles.note}>
                      {envSet ? 'set on the server · reused' : 'not set yet · no value on the server'}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.note}>
            {providerType} keeps its own credentials on the server · no variable to configure
          </Text>
        )}

        <View style={styles.category}>
          <Text style={styles.section}>advanced</Text>
          {openai ? (
            <>
              <TextInput
                style={styles.input}
                value={pricingProvider}
                onChangeText={setPricingProvider}
                placeholder="models.dev provider for /status costs (rarely needed)"
                placeholderTextColor={styles.placeholder.color}
                autoCorrect={false}
                accessibilityLabel="Provider pricing provider"
              />
              <TextInput
                style={styles.input}
                value={fallbackModel}
                onChangeText={setFallbackModel}
                placeholder="fallback model id (codex and anthropic only)"
                placeholderTextColor={styles.placeholder.color}
                autoCorrect={false}
                accessibilityLabel="Provider fallback model"
              />
            </>
          ) : providerType === 'anthropic' ? (
            <TextInput
              style={styles.input}
              value={fallbackModel}
              onChangeText={setFallbackModel}
              placeholder="fallback model id when the primary errors out"
              placeholderTextColor={styles.placeholder.color}
              autoCorrect={false}
              accessibilityLabel="Provider fallback model"
            />
          ) : null}
        </View>

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

        <Pressable
          onPress={() =>
            onSave({
              key: key.trim(),
              providerType,
              baseUrl: baseUrl.trim(),
              group: group.trim(),
              discover,
              promptCache,
              reasoningReplay,
              pricingProvider: pricingProvider.trim(),
              fallbackModel: fallbackModel.trim(),
              apiKeyEnv: envName,
              envValue: envValue.trim(),
            })
          }
          disabled={!canSave}
          style={[styles.saveButton, canSave ? styles.saveEnabled : styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={mode === 'create' ? 'Create provider' : 'Save provider'}>
          <Text style={canSave ? styles.saveText : styles.saveTextOff}>
            {busy ? '...' : mode === 'create' ? 'Create' : 'Save'}
          </Text>
        </Pressable>

        {mode === 'edit' && provider ? (
          <Pressable
            onPress={onDelete}
            style={styles.dangerRow}
            accessibilityRole="button"
            accessibilityLabel="Delete provider">
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
