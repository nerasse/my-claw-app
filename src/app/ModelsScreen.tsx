import { ChevronIcon, PlusIcon } from '../components/icons';
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { AgentsConfigResultFrame, ProviderInfo } from '../core/protocol';
import { connection } from '../core/connection';
import { encodeQuotaGet } from '../core/protocol';
import { QuotaLine } from '../components/QuotaCard';
import { useModelCatalog, useModelIndex } from '../core/model';
import { discoveryLine } from '../core/providerServices';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { DiscoveryButton, DiscoveryNote } from '../components/DiscoveryRefresh';
import { useAccounts } from '../core/accounts';
import type { AccountKind, AccountView } from '../core/protocol';
import { ACCOUNT_LABELS, accountSummary } from './AccountScreen';
import { CloseButton } from '../components/CloseButton';
import { shortTokens } from '../core/context';

/** A plan in the providers list: its name, its kind, and whether it is signed in. */
function PlanRow({
  provider,
  kind,
  view,
  onOpen,
}: {
  provider: ProviderInfo;
  kind: AccountKind;
  view: AccountView | undefined;
  onOpen: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const name = provider.group || provider.key;
  // The account frame says more (email, plan); the providers snapshot alone still says signed in.
  const summary = view ? accountSummary(kind, view) : provider.keyPresent ? 'Connected' : 'Not signed in';
  const connected = view?.connected ?? provider.keyPresent;
  return (
    <Pressable style={[styles.row, styles.link]} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open account ${name}`}>
      <View style={styles.linkMain}>
        <View style={styles.linkTitleLine}>
          <Text style={styles.linkTitle}>{name}</Text>
          <Text style={styles.badge}>{`${ACCOUNT_LABELS[kind].title} plan`}</Text>
          {provider.disabled ? <Text style={styles.badgeOff}>off</Text> : null}
        </View>
        <Text style={[styles.hint, connected && styles.connected]} numberOfLines={1}>
          {`${summary} · ${provider.models} model${provider.models === 1 ? '' : 's'}`}
        </Text>
        {provider.quota ? <QuotaLine provider={provider.key} /> : null}
      </View>
      <ChevronIcon direction="right" size={16} tone="faint" />
    </Pressable>
  );
}

/** "30 s, 1 min, 2 min": the waits as the owner reads them, seconds under a minute. */
export function retryScheduleText(delaysMs: readonly number[]): string {
  if (delaysMs.length === 0) return 'no wait';
  return delaysMs
    .map(ms => (ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`))
    .join(', ');
}

/**
 * What the global ceiling row says. An agent's own cap and a tag candidate's pin outrank it, which
 * is the one thing that makes the value look ignored, so the row says so.
 */
export function contextCapText(cap: { value?: number; default: number }): string {
  const value = cap.value ?? cap.default;
  const head = value === 0 ? 'no ceiling: every model gets its full window' : `${shortTokens(value)} tokens`;
  return `${head}${cap.value === undefined ? ' · server default' : ''} · an agent or tag cap outranks it`;
}

/**
 * Everything about which model answers, on one page (owner, 2026-10-04): the defaults every agent
 * falls back to (they were on Agents), the subscriptions, the providers and their keys, and the
 * tags (a row hidden among the providers until then). Each provider row names the config key, the
 * backend type, the model count and whether the key is set on the server -- never the key itself.
 */
export function ModelsScreen({
  config,
  providers,
  error,
  onBack,
  onNewProvider,
  onOpenProvider,
  onOpenAccount,
  onOpenDefaultModel,
  onOpenFallback,
  onSetRetry,
  onOpenContextCap,
  onOpenTags,
}: {
  /** The agents snapshot the defaults are read from; null until the server answers. */
  config: AgentsConfigResultFrame | null;
  providers: ProviderInfo[];
  /**
   * The last refusal, from whatever the page behind this one asked for. A delete is answered after
   * the screen that started it is gone, so this is where its refusal has to surface: without it a
   * refused removal reads as a button that does nothing.
   */
  error: string | null;
  onBack: () => void;
  onNewProvider: () => void;
  onOpenProvider: (key: string) => void;
  onOpenAccount: (provider: string, kind: AccountKind) => void;
  onOpenDefaultModel: () => void;
  onOpenFallback: () => void;
  onSetRetry: (enabled: boolean) => void;
  onOpenContextCap: () => void;
  onOpenTags: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const catalog = useModelCatalog();
  const byId = useModelIndex(catalog.models);
  /** Ids are what the config stores; the label is what every other screen shows. */
  const labelOf = (modelId: string): string => byId.get(modelId)?.label ?? modelId;
  // The tags are a page of their own now, not a provider row: the list is the providers alone.
  const real = providers.filter(provider => provider.type !== 'tags');
  // One read per provider that publishes its limits, when the list first shows it. The line is
  // then kept current by the store, which the server pushes while a provider page is open.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const provider of real) {
      if (!provider.quota || asked.current.has(provider.key)) continue;
      asked.current.add(provider.key);
      connection.send(encodeQuotaGet(provider.key)).catch(() => {});
    }
  }, [real]);
  // Null on a server older than the accounts frames: no section, rather than rows that do nothing.
  const accounts = useAccounts().frame;
  useDismissKeyboard();

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
          <Text style={styles.title}>Models</Text>
          <Text style={styles.subtitle}>
            {real.length} provider{real.length === 1 ? '' : 's'}
          </Text>
        </View>
        {/* Discovery is server-wide, so the button answers for the whole table as well as for one
            provider's page: the model counts on these rows are what it brings up to date. */}
        <DiscoveryButton />
        <Pressable
          onPress={onNewProvider}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="New provider">
          <PlusIcon size={18} tone="text" />
        </Pressable>
        <CloseButton />
      </View>

      <DiscoveryNote />

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Providers error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Default</Text>
        <View style={styles.card}>
          {config ? (
            <>
              <Pressable
                style={[styles.row, styles.link]}
                onPress={onOpenDefaultModel}
                accessibilityRole="button"
                accessibilityLabel="Default model">
                <View style={styles.linkMain}>
                  <Text style={styles.linkTitle}>{config.defaultModel ? labelOf(config.defaultModel) : 'Default model'}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {config.defaultEffort
                      ? `${config.defaultModel} · provider ${config.defaultProvider ?? 'default'} · effort ${config.defaultEffort}`
                      : config.defaultProvider
                        ? `${config.defaultModel} · provider ${config.defaultProvider}`
                        : config.defaultModel
                          ? 'what every agent falls back to'
                          : 'none set · what every agent falls back to'}
                  </Text>
                </View>
                <ChevronIcon direction="right" size={16} tone="faint" />
              </Pressable>
              <View style={styles.separator} />
              <Pressable
                style={[styles.row, styles.link]}
                onPress={onOpenFallback}
                accessibilityRole="button"
                accessibilityLabel="Fallback model">
                <View style={styles.linkMain}>
                  <Text style={styles.linkTitle}>{config.fallback ? labelOf(config.fallback) : 'Fallback model'}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {config.fallback
                      ? `image runs switch to it when ${labelOf(config.defaultModel)} can't take images`
                      : 'what image runs switch to when the model cannot take images'}
                  </Text>
                </View>
                <ChevronIcon direction="right" size={16} tone="faint" />
              </Pressable>
              {config.contextCap ? (
                <>
                  <View style={styles.separator} />
                  <Pressable
                    style={[styles.row, styles.link]}
                    onPress={onOpenContextCap}
                    accessibilityRole="button"
                    accessibilityLabel="Context cap">
                    <View style={styles.linkMain}>
                      <Text style={styles.linkTitle}>Context cap</Text>
                      <Text style={styles.hint}>{contextCapText(config.contextCap)}</Text>
                    </View>
                    <ChevronIcon direction="right" size={16} tone="faint" />
                  </Pressable>
                </>
              ) : null}
              {/* Absent on a server that predates it: not drawn, rather than drawn lying. */}
              {config.retry ? (
                <>
                  <View style={styles.separator} />
                  <View style={[styles.row, styles.link]}>
                    <View style={styles.linkMain}>
                      <Text style={styles.linkTitle}>Retry on provider failure</Text>
                      <Text style={styles.hint}>
                        {config.retry.enabled
                          ? `a refused call is tried again after ${retryScheduleText(config.retry.delaysMs)}, before another model is used`
                          : 'a failed call moves to the next model at once'}
                      </Text>
                    </View>
                    <Switch
                      value={config.retry.enabled}
                      onValueChange={value => onSetRetry(value)}
                      accessibilityLabel="Retry on provider failure"
                      accessibilityRole="switch"
                    />
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <View style={styles.row}>
              <Text style={styles.hint}>loading…</Text>
            </View>
          )}
        </View>

        {/* Every provider, plans and keys alike: a plan is a provider that signs in instead of taking
            a key (owner, 2026-10-04). The + offers both. */}
        <Text style={styles.section}>Providers</Text>
        <View style={styles.card}>
          {real.length === 0 ? (
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onNewProvider}
              accessibilityRole="button"
              accessibilityLabel="Add your first provider">
              <View style={styles.linkMain}>
                <Text style={styles.linkTitle}>Add your first provider</Text>
                <Text style={styles.hint}>a ChatGPT or Claude plan, or an API key</Text>
              </View>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
          ) : null}
          {real.map((provider, index) => (
            <View key={provider.key}>
              {index > 0 ? <View style={styles.separator} /> : null}
              {provider.account ? (
                <PlanRow
                  provider={provider}
                  kind={provider.account}
                  view={accounts?.accounts?.find(account => account.provider === provider.key)}
                  onOpen={() => onOpenAccount(provider.key, provider.account!)}
                />
              ) : (
              <Pressable
                style={[styles.row, styles.link]}
                onPress={() => onOpenProvider(provider.key)}
                accessibilityRole="button"
                accessibilityLabel={`Open provider ${provider.group || provider.key}`}>
                <View style={styles.linkMain}>
                  <View style={styles.linkTitleLine}>
                    <Text style={styles.linkTitle}>{provider.group || provider.key}</Text>
                    <Text style={styles.badge}>{provider.type}</Text>
                    {provider.discover ? <Text style={styles.badge}>discovery</Text> : null}
                    {provider.disabled ? <Text style={styles.badgeOff}>off</Text> : null}
                  </View>
                  {/* A refused key is said here too: "0 models · key set" read as fine. */}
                  {provider.discovery?.state === 'failed' ? (
                    <Text style={[styles.hint, styles.hintFailed]} numberOfLines={1}>
                      {`${provider.group ? `${provider.key} · ` : ''}${discoveryLine(provider).text}`}
                    </Text>
                  ) : (
                    <Text style={styles.hint} numberOfLines={1}>
                      {`${provider.group ? `${provider.key} · ` : ''}${provider.models} model${
                        provider.models === 1 ? '' : 's'
                      }${
                        provider.keyEnv
                          ? ` · key ${provider.keyPresent ? 'set' : 'missing'} (${provider.keyEnv})`
                          : ' · no key needed'
                      }`}
                    </Text>
                  )}
                  {provider.quota ? <QuotaLine provider={provider.key} /> : null}
                </View>
                <ChevronIcon direction="right" size={16} tone="faint" />
              </Pressable>
              )}
            </View>
          ))}
        </View>

        <Text style={styles.section}>Tags</Text>
        <View style={styles.card}>
          <Pressable
            style={[styles.row, styles.link]}
            onPress={onOpenTags}
            accessibilityRole="button"
            accessibilityLabel="Open tags">
            <View style={styles.linkMain}>
              <Text style={styles.linkTitle}>Tags</Text>
              <Text style={styles.hint} numberOfLines={1}>
                named routes: a model, then the ones it falls back to
              </Text>
            </View>
            <ChevronIcon direction="right" size={16} tone="faint" />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  // The same section title as every other settings page: Models used to wear its own, bolder one.
  section: {
    marginTop: space.md,
    paddingHorizontal: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },

  connected: { color: palette.ok },
  error: {
    color: palette.danger,
    fontSize: font.small,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
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
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  body: { paddingBottom: space.xl, gap: space.xs },
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
    paddingVertical: space.md,
  },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  linkMain: { flex: 1, gap: 2 },
  linkTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  linkTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  linkGlyph: { fontSize: 20, color: palette.textFaint },
  hint: { fontSize: font.small, color: palette.textMuted },
  hintFailed: { color: palette.danger },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
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
  /** "off": the same chip shape as a badge, in the muted tone a switched-off thing reads as. */
  badgeOff: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.textFaint,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
});
