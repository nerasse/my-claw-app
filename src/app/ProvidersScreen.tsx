import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ProviderInfo } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { DiscoveryButton, DiscoveryNote } from '../components/DiscoveryRefresh';

/**
 * The configured providers. Each row names the config key, the backend type, the model count
 * and whether the key is actually set on the server -- never the key itself. The + opens the
 * create form; a row opens the provider's models, which carry their own edit entry.
 */
export function ProvidersScreen({
  providers,
  error,
  onBack,
  onNewProvider,
  onOpenProvider,
}: {
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
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();

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
          <Text style={styles.title}>Providers</Text>
          <Text style={styles.subtitle}>
            {providers.length} configured · models come from the server catalog
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
          <Text style={styles.addGlyph}>+</Text>
        </Pressable>
      </View>

      <DiscoveryNote />

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Providers error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {providers.every(provider => provider.type === 'tags') ? (
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onNewProvider}
              accessibilityRole="button"
              accessibilityLabel="Add your first provider">
              <View style={styles.linkMain}>
                <Text style={styles.linkTitle}>Add your first provider</Text>
                <Text style={styles.hint}>OpenRouter, OpenAI, Groq… then paste its API key</Text>
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          ) : null}
          {providers.length > 0 && providers.every(provider => provider.type === 'tags') ? <View style={styles.separator} /> : null}
          {providers.map((provider, index) => (
            <View key={provider.key}>
              {index > 0 ? <View style={styles.separator} /> : null}
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
                  </View>
                  <Text style={styles.hint} numberOfLines={1}>
                    {`${provider.group ? `${provider.key} · ` : ''}${provider.models} model${
                      provider.models === 1 ? '' : 's'
                    }${
                      provider.keyEnv
                        ? ` · key ${provider.keyPresent ? 'set' : 'missing'} (${provider.keyEnv})`
                        : ' · no key needed'
                    }`}
                  </Text>
                </View>
                <Text style={styles.linkGlyph}>›</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
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
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  addGlyph: { fontSize: 22, lineHeight: 24, color: palette.text },
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  body: { padding: space.md, paddingBottom: space.xl },
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
});
