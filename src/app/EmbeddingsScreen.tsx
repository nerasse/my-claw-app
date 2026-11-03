import { ChevronIcon } from '../components/icons';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { connection } from '../core/connection';
import {
  encodeServicesGet,
  encodeServicesSet,
  type EmbeddingConsumerView,
  type EmbeddingModelOption,
} from '../core/protocol';
import { servicesStore, useServices } from '../core/services';
import { overlayStore } from '../core/overlay';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

/**
 * What each consumer does, in the words a person uses. The server sends the ids and the state;
 * only the sentences live here, because a page that rendered `consolidate` would be a config file
 * with buttons.
 */
const CONSUMER_LABELS: Record<EmbeddingConsumerView['id'], { title: string; hint: string }> = {
  recall: { title: 'Memory recall', hint: 'finds a memory by meaning on every message' },
  dedup: { title: 'Duplicate check', hint: 'spots a fact already stored, in other words' },
  consolidate: { title: 'Consolidation', hint: 're-embeds the facts it merges' },
  import: { title: 'Markdown import', hint: 'MEMORY.md and its hand edits' },
  skills: { title: 'Skill suggestions', hint: 'picks the skills a message is about' },
};

/**
 * Embeddings, one page for the whole subject: the model everything runs on, then one row per thing
 * that embeds text, each able to follow that default, take its own model, or be switched off.
 *
 * The default is the useful case (one model, one vector space, nothing to think about); a per-row
 * choice is the exception and is marked as such. Two consumers on different models keep separate
 * vectors for the same memory, which is why the page says so rather than pretending it is free.
 */
export function EmbeddingsScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { frame, error, busy } = useServices();

  useEffect(() => {
    connection.send(encodeServicesGet()).catch(() => {});
  }, []);

  const service = frame?.services.find(s => s.id === 'embeddings');
  const models = frame?.embeddingModels ?? [];
  const consumers = frame?.embeddingConsumers ?? [];
  const defaultModel = service?.model;
  const defaultProvider = service?.provider;

  /** The catalogue's label for a wire id: a person reads "Gemini Embedding 001", not the id. */
  const labelOf = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : (models.find(m => m.id === id)?.label ?? id);

  /** Provider then model, exactly as Services does; a lone model is picked without a second step. */
  const pickModel = (target: EmbeddingConsumerView['id'] | undefined): void => {
    if (models.length === 0) return;
    const providers = [...new Set(models.map(m => m.provider))];
    const current = target === undefined
      ? defaultProvider
      : consumers.find(c => c.id === target)?.provider;
    const send = (m: EmbeddingModelOption): void => {
      servicesStore.sending();
      connection
        .send(
          encodeServicesSet({
            id: 'embeddings',
            source: 'cloud',
            provider: m.provider,
            model: m.id,
            ...(target === undefined ? {} : { consumer: target }),
          }),
        )
        .catch(() => {});
    };
    const listModels = (provider: string): void => {
      const offered = models.filter(m => m.provider === provider);
      if (offered.length === 1) {
        send(offered[0]!);
        return;
      }
      overlayStore.open({
        kind: 'sheet',
        options: offered.map(m => ({
          key: `${m.provider}/${m.id}`,
          label: m.label,
          hint: m.id,
          selected: m.id === (target === undefined ? defaultModel : consumers.find(c => c.id === target)?.model),
          onPress: () => send(m),
        })),
      });
    };
    overlayStore.open({
      kind: 'sheet',
      options: providers.map(key => {
        const count = models.filter(m => m.provider === key).length;
        return {
          key,
          label: key,
          hint: count === 1 ? '1 model' : `${count} models`,
          selected: key === current,
          onPress: () => listModels(key),
        };
      }),
    });
  };

  /** Turns the default off entirely: no consumer embeds anything until one is chosen again. */
  const stopAll = (): void => {
    servicesStore.sending();
    connection.send(encodeServicesSet({ id: 'embeddings', source: 'off' })).catch(() => {});
  };

  /** One consumer switched off, its model kept for when it comes back. */
  const toggle = (row: EmbeddingConsumerView, on: boolean): void => {
    // A consumer that follows the default has no model of its own to keep, and still gets a
    // switch: off means "this one stops embedding", not "give it a model". The server writes an
    // entry carrying only the switch, which is why switching it back on needs no choice.
    servicesStore.sending();
    connection
      .send(encodeServicesSet({ id: 'embeddings', source: 'cloud', consumer: row.id, enabled: on }))
      .catch(() => {});
  };

  /** Drops a consumer's own model, back on the default. */
  const follow = (row: EmbeddingConsumerView): void => {
    servicesStore.sending();
    connection
      .send(encodeServicesSet({ id: 'embeddings', source: 'cloud', consumer: row.id, inherit: true }))
      .catch(() => {});
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          hitSlop={8}
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <Text style={styles.title}>Embeddings</Text>
        <CloseButton />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          How the agent compares texts by meaning: memory recall, the duplicate check, and which
          skills a message is about. One provider you already use is enough; nothing else to install.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {frame === null ? (
          <Text style={styles.detail}>asking the server…</Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Everything</Text>
                {defaultModel ? (
                  <Pressable
                    hitSlop={8}
                    onPress={stopAll}
                    disabled={busy}
                    style={[styles.linkButton, busy && styles.busy]}
                    accessibilityRole="button"
                    accessibilityLabel="Turn embeddings off"
                  >
                    <Text style={styles.linkText}>Turn off</Text>
                  </Pressable>
                ) : null}
              </View>
              {defaultModel ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => pickModel(undefined)}
                  disabled={busy}
                  style={[styles.chosen, busy && styles.busy]}
                  accessibilityRole="button"
                  accessibilityLabel={`Change the model every consumer runs on: ${labelOf(defaultModel)}`}
                >
                  <View style={styles.grow}>
                    <Text style={styles.chosenLabel} numberOfLines={1}>
                      {labelOf(defaultModel)}
                    </Text>
                    <Text style={styles.detail} numberOfLines={1}>
                      {defaultProvider ? `${defaultProvider} · ${defaultModel}` : defaultModel}
                    </Text>
                  </View>
                  <ChevronIcon direction="right" size={16} tone="faint" />
                </Pressable>
              ) : (
                <Text style={styles.detail}>
                  Nothing yet: pick a model from a provider you already configured.
                </Text>
              )}
              {models.length === 0 ? (
                <Text style={styles.detail}>
                  No provider of this install serves an embedding model. Add one on the Models page
                  with its key, then come back.
                </Text>
              ) : !defaultModel ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => pickModel(undefined)}
                  disabled={busy}
                  style={[styles.primaryButton, busy && styles.busy]}
                  accessibilityRole="button"
                  accessibilityLabel="Choose the embedding model"
                >
                  <Text style={styles.primaryText}>Choose a model</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Who uses it</Text>
            <Text style={styles.sectionHint}>
              Each follows the model above unless it has its own. Two consumers on different models
              keep separate vectors for the same memory, and each re-embeds its own on the server.
            </Text>
            <View style={styles.card}>
              {consumers.map((row, index) => (
                <View
                  key={row.id}
                  style={[styles.consumerRow, index > 0 && styles.consumerDivider]}
                >
                  <View style={styles.consumerMain}>
                    <Text style={styles.consumerTitle}>{CONSUMER_LABELS[row.id].title}</Text>
                    <Text style={styles.detail} numberOfLines={1}>
                      {CONSUMER_LABELS[row.id].hint}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => pickModel(row.id)}
                      disabled={busy || models.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Model for ${CONSUMER_LABELS[row.id].title}`}
                    >
                      <Text style={styles.modelLine} numberOfLines={1}>
                        {row.active
                          ? `${row.own ? '' : 'follows · '}${labelOf(row.model) ?? 'no model'}`
                          : 'off'}
                      </Text>
                    </Pressable>
                    {row.own && defaultModel ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => follow(row)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Make ${CONSUMER_LABELS[row.id].title} follow the default again`}
                      >
                        <Text style={styles.linkSmall}>follow the default</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Switch
                    value={row.active}
                    onValueChange={on => toggle(row, on)}
                    disabled={busy || !defaultModel}
                    accessibilityLabel={`${CONSUMER_LABELS[row.id].title} on`}
                  />
                </View>
              ))}
            </View>
            {service?.endpoint ? (
              <Text style={styles.detail} numberOfLines={1}>
                {service.endpoint}
              </Text>
            ) : null}
            {service?.source === 'self-hosted' ? (
              <Text style={styles.detail}>
                Running on this server: the model is downloaded once, then nothing leaves the machine.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1 },
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
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  content: { paddingVertical: space.md, gap: space.sm, paddingBottom: space.xl },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  sectionTitle: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
    marginTop: space.sm,
  },
  sectionHint: { fontSize: font.small, color: palette.textMuted, marginBottom: space.xs },
  hint: { fontSize: font.small, color: palette.textMuted },
  detail: { fontSize: font.small, color: palette.textFaint },
  error: { fontSize: font.small, color: palette.danger },
  rowBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  grow: { flex: 1 },
  chosen: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: palette.bg,
  },
  chosenLabel: { fontSize: font.body, color: palette.text },
  linkButton: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  linkText: { fontSize: font.small, color: palette.danger },
  linkSmall: { fontSize: font.small, color: palette.accent, marginTop: 2 },
  primaryButton: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  primaryText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  consumerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
  },
  consumerDivider: { borderTopWidth: 1, borderTopColor: palette.border },
  consumerMain: { flex: 1, gap: 2 },
  consumerTitle: { fontSize: font.body, color: palette.text },
  modelLine: { fontSize: font.small, color: palette.textMuted },
  busy: { opacity: 0.6 },
});
