import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { connection } from '../core/connection';
import {
  encodeProvidersEnvSet,
  encodeServicesFree,
  encodeServicesGet,
  encodeServicesSet,
  type ServiceSource,
  type ServiceView,
} from '../core/protocol';
import { useProvidersEnv } from '../core/providers';
import { SERVICE_LABELS, SOURCE_LABELS, servicesStore, useServices } from '../core/services';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/** A compose install runs a local engine as a profile the owner starts on the host. */
const COMPOSE_PROFILE: Partial<Record<ServiceView['id'], string>> = { stt: 'whisper', tts: 'piper', search: 'searxng' };

/** How often the page asks again while an engine downloads: progress is the server's to tell. */
const INSTALL_POLL_MS = 3000;

function sizeOf(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/** An env name (`GROQ_API_KEY`) is a key to paste; anything else is a setting to fill. */
const isEnvName = (name: string): boolean => /^[A-Z][A-Z0-9_]*$/.test(name);

/**
 * Every optional service and where it runs: the cloud (the default), this server, or a URL
 * (docs/services.md in the server repo). A key a source still needs is pasted right here; it goes
 * to the server's .env and never comes back.
 */
export function ServicesScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { frame, error, busy } = useServices();
  const env = useProvidersEnv();

  useEffect(() => {
    connection.send(encodeServicesGet()).catch(() => {});
  }, []);
  // A key saved here lands in .env: the next description says whether it was the missing one.
  const envSnapshot = env.env;
  const firstEnv = useRef(true);
  useEffect(() => {
    if (firstEnv.current) {
      firstEnv.current = false;
      return;
    }
    connection.send(encodeServicesGet()).catch(() => {});
  }, [envSnapshot]);
  const installing = frame?.services.some(s => s.local?.state === 'installing') ?? false;
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(() => connection.send(encodeServicesGet()).catch(() => {}), INSTALL_POLL_MS);
    return () => clearInterval(timer);
  }, [installing]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Services</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Everything starts in the cloud. Run an engine on this server, or point at your own with a URL.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {frame === null ? (
          <Text style={styles.detail}>asking the server…</Text>
        ) : (
          frame.services.map(service => (
            <ServiceCard key={service.id} service={service} install={frame.install} busy={busy} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ServiceCard({
  service,
  install,
  busy,
}: {
  service: ServiceView;
  install: 'native' | 'compose' | 'dev';
  busy: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const label = SERVICE_LABELS[service.id];
  const [editingUrl, setEditingUrl] = useState(false);
  const [url, setUrl] = useState(service.source === 'url' ? service.endpoint ?? '' : '');
  const [keys, setKeys] = useState<Record<string, string>>({});

  const choose = (source: ServiceSource): void => {
    if (source === 'url') {
      setEditingUrl(true);
      return;
    }
    setEditingUrl(false);
    if (source === service.source) return;
    servicesStore.sending();
    connection.send(encodeServicesSet({ id: service.id, source })).catch(() => {});
  };
  const saveUrl = (): void => {
    servicesStore.sending();
    connection.send(encodeServicesSet({ id: service.id, source: 'url', url: url.trim() })).catch(() => {});
    setEditingUrl(false);
  };
  const saveKey = (name: string): void => {
    const value = keys[name]?.trim();
    if (!value) return;
    connection.send(encodeProvidersEnvSet(name, value)).catch(() => {});
    setKeys(current => ({ ...current, [name]: '' }));
  };

  const profile = COMPOSE_PROFILE[service.id];
  const down = service.health === 'down';
  return (
    <View style={styles.card} accessibilityLabel={`Service ${label.title}`}>
      <View style={styles.row}>
        <View style={[styles.dot, service.health === 'up' ? styles.dotUp : down ? styles.dotDown : styles.dotNone]} />
        <Text style={styles.cardTitle}>{label.title}</Text>
      </View>
      <Text style={styles.hint}>{label.hint}</Text>
      <View style={styles.chips}>
        {service.choices.map(source => {
          const on = editingUrl ? source === 'url' : source === service.source;
          return (
            <Pressable
              key={source}
              onPress={() => choose(source)}
              disabled={busy}
              style={[styles.chip, on && styles.chipOn, busy && styles.busy]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label.title}: ${SOURCE_LABELS[source]}`}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{SOURCE_LABELS[source]}</Text>
            </Pressable>
          );
        })}
      </View>
      {editingUrl ? (
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.grow]}
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={saveUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel={`${label.title} URL`}
          />
          <Pressable onPress={saveUrl} style={styles.save} accessibilityRole="button" accessibilityLabel={`Save ${label.title} URL`}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
      ) : null}
      {service.endpoint ? <Text style={styles.detail} numberOfLines={1}>{service.endpoint}{down ? ' · not answering' : ''}</Text> : null}
      {down && install === 'compose' && service.source === 'self-hosted' && profile ? (
        <Text style={styles.detail} selectable>
          Start it on the host: docker compose -f packaging/compose/compose.yml --profile {profile} up -d
        </Text>
      ) : null}
      {service.local?.state === 'installing' ? (
        <Text style={styles.notice}>Downloading the local engine on the server… this takes a few minutes, it starts by itself.</Text>
      ) : null}
      {service.local?.state === 'failed' ? <Text style={styles.error}>Install failed: {service.local.error}</Text> : null}
      {service.local && service.local.bytes > 0 && service.source !== 'self-hosted' && (service.id === 'stt' || service.id === 'embeddings') ? (
        <Pressable
          onPress={() => {
            const id = service.id === 'stt' ? 'stt' : 'embeddings';
            servicesStore.sending();
            connection.send(encodeServicesFree(id)).catch(() => {});
          }}
          disabled={busy}
          style={[styles.free, busy && styles.busy]}
          accessibilityRole="button"
          accessibilityLabel={`Free ${label.title} files`}>
          <Text style={styles.freeText}>Free {sizeOf(service.local.bytes)} on the server</Text>
        </Pressable>
      ) : null}
      {service.missing.map(name =>
        isEnvName(name) ? (
          <View key={name} style={styles.row}>
            <TextInput
              style={[styles.input, styles.grow]}
              value={keys[name] ?? ''}
              onChangeText={value => setKeys(current => ({ ...current, [name]: value }))}
              onSubmitEditing={() => saveKey(name)}
              placeholder={`${name} (missing)`}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={`Key ${name}`}
            />
            <Pressable onPress={() => saveKey(name)} style={styles.save} accessibilityRole="button" accessibilityLabel={`Save ${name}`}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        ) : (
          <Text key={name} style={styles.error}>
            missing: {name}
          </Text>
        ),
      )}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  back: { fontSize: font.screen, color: palette.textFaint, paddingHorizontal: 4 },
  title: { fontSize: font.screen, fontWeight: '600' as const, color: palette.text },
  content: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  hint: { fontSize: font.small, color: palette.textMuted },
  detail: { fontSize: font.small, color: palette.textFaint },
  error: { fontSize: font.small, color: palette.danger },
  notice: { fontSize: font.small, color: palette.accent },
  free: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  freeText: { fontSize: font.small, color: palette.textMuted },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  grow: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUp: { backgroundColor: palette.accent },
  dotDown: { backgroundColor: palette.danger },
  dotNone: { backgroundColor: palette.border },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipOn: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  chipText: { fontSize: font.small, color: palette.textMuted },
  chipTextOn: { color: palette.text, fontWeight: '600' as const },
  busy: { opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    color: palette.text,
    backgroundColor: palette.bg,
    fontSize: font.body,
  },
  save: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  saveText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
});
