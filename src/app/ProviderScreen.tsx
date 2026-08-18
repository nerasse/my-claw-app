import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Text, TextInput, View } from 'react-native';
import type { ModelOption, ProviderInfo } from '../core/protocol';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { DiscoveryButton, DiscoveryNote } from '../components/DiscoveryRefresh';

/** A component of its own, not a closure in render: FlatList keeps it across renders. */
function Separator(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
}

/**
 * Below this the whole list fits on one screen: a search row would be one more thing to read
 * before the handful of models under it. Same threshold as the model picker.
 */
const SEARCH_MIN_MODELS = 12;

const keyOfModel = (model: ModelOption): string => model.id;

/**
 * How the hardware back key reaches the search box. The query stays local to this screen — lifted
 * into the shell it re-rendered the entire app on every keystroke, over the longest list in it —
 * so the one caller that needs it from the outside gets a handle rather than a prop.
 */
export type ProviderSearch = { query: string; clear: () => void };

/** One model. Memoized, and handed the id: a provider page can hold hundreds of these. */
const ModelRow = React.memo(function ModelRowView({
  model,
  isDefault,
  onSetDefault,
}: {
  model: ModelOption;
  isDefault: boolean;
  onSetDefault: (modelId: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      style={styles.row}
      onPress={() => onSetDefault(model.id)}
      accessibilityRole="button"
      accessibilityState={{ selected: isDefault }}
      accessibilityLabel={isDefault ? `${model.label}, already the default` : `Set default ${model.label}`}>
      <View style={styles.linkMain}>
        <View style={styles.linkTitleLine}>
          <Text style={styles.linkTitle}>{model.label}</Text>
          {isDefault ? <Text style={styles.badge}>default</Text> : null}
        </View>
        {model.id !== model.label ? (
          <Text style={styles.hint} numberOfLines={1}>
            {model.id}
          </Text>
        ) : null}
      </View>
      <Text style={styles.checkmark}>{isDefault ? '✓' : ''}</Text>
    </Pressable>
  );
});

/**
 * The models one provider contributes, filtered from the shared catalog with the same rule the
 * server uses to count them (a model with no provider of its own follows the global default).
 * Tapping a model makes it the global default; the one in force carries a checkmark.
 */
export function ProviderScreen({
  provider,
  models,
  defaultModel,
  searchHandle,
  error,
  onSetDefault,
  onEditProvider,
  onBack,
}: {
  provider: ProviderInfo;
  models: ModelOption[];
  /** The global default id, so the row in force is marked. */
  defaultModel: string;
  /** Where the hardware back key reads and clears the search from. */
  searchHandle?: React.MutableRefObject<ProviderSearch>;
  /** Server refused the last write: shown here, where the user asked for it. */
  error: string | null;
  onSetDefault: (modelId: string) => void;
  onEditProvider: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  useDismissKeyboard();

  const [query, setQuery] = useState('');
  const needle = useMemo(() => query.trim().toLowerCase(), [query]);
  const shown = useMemo(
    () =>
      needle
        ? models.filter(
            model => model.label.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle),
          )
        : models,
    [models, needle],
  );

  useEffect(() => {
    if (!searchHandle) return;
    const handle = searchHandle;
    handle.current = { query, clear: () => setQuery('') };
    return () => {
      handle.current = { query: '', clear: () => {} };
    };
  }, [query, searchHandle]);

  const renderModel = useCallback(
    ({ item }: { item: ModelOption }) => (
      <ModelRow model={item} isDefault={item.id === defaultModel} onSetDefault={onSetDefault} />
    ),
    [defaultModel, onSetDefault],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to providers">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{provider.group || provider.key}</Text>
          <Text style={styles.subtitle}>
            {`${models.length} model${models.length === 1 ? '' : 's'} · tap one to make it the default`}
          </Text>
        </View>
        {/* The models on this page come from discovery: the button that re-runs it belongs where
            they are read, not on a settings page three taps away. */}
        <DiscoveryButton />
        <Pressable
          onPress={onEditProvider}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Edit provider">
          <Text style={styles.editGlyph}>⚙</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Agents error ${error}`}>
          {error}
        </Text>
      ) : null}
      <DiscoveryNote />

      {models.length >= SEARCH_MIN_MODELS ? (
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search models"
          placeholderTextColor={palette.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search models"
        />
      ) : null}

      {/* A discovering provider floods its page with hundreds of models: the list virtualizes,
          the header, the error and the card look stay put above it. */}
      <FlatList
        data={shown}
        keyExtractor={keyOfModel}
        renderItem={renderModel}
        ItemSeparatorComponent={Separator}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <View style={styles.emptyArea}>
            <Text style={styles.empty}>
              {needle ? 'no model matches the search' : 'no models known for this provider yet'}
            </Text>
          </View>
        }
        contentContainerStyle={shown.length === 0 ? styles.body : [styles.body, styles.card]}
        keyboardShouldPersistTaps="handled"
      />
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
  editGlyph: { fontSize: 18, lineHeight: 20, color: palette.text },
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
  linkMain: { flex: 1, gap: 2 },
  linkTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  linkTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  hint: { fontSize: font.small, color: palette.textMuted },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  badge: {
    fontSize: font.micro,
    color: palette.accent,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  checkmark: { fontSize: font.body, color: palette.accent, fontWeight: '600' as const },
  search: {
    marginHorizontal: space.md,
    marginTop: space.md,
    marginBottom: 0,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    color: palette.text,
    fontSize: font.body,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  emptyArea: { marginTop: space.lg, alignItems: 'center' as const },
  empty: { fontSize: font.meta, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
