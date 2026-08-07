import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ModelOption, ProviderInfo } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * The models one provider contributes, filtered from the shared catalog with the same rule the
 * server uses to count them (a model with no provider of its own follows the global default).
 * Tapping a model makes it the global default; the one in force carries a checkmark.
 */
export function ProviderScreen({
  provider,
  models,
  defaultModel,
  error,
  onSetDefault,
  onBack,
}: {
  provider: ProviderInfo;
  models: ModelOption[];
  /** The global default id, so the row in force is marked. */
  defaultModel: string;
  /** Server refused the last write: shown here, where the user asked for it. */
  error: string | null;
  onSetDefault: (modelId: string) => void;
  onBack: () => void;
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
          accessibilityLabel="Back to providers">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{provider.group || provider.key}</Text>
          <Text style={styles.subtitle}>
            {`${models.length} model${models.length === 1 ? '' : 's'} · tap one to make it the default`}
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Agents error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {models.map((model, index) => {
            const isDefault = model.id === defaultModel;
            return (
              <View key={model.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <Pressable
                  style={[styles.row, styles.link]}
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
              </View>
            );
          })}
        </View>
        {models.length === 0 ? (
          <View style={styles.emptyArea}>
            <Text style={styles.empty}>no models known for this provider yet</Text>
          </View>
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
  emptyArea: { marginTop: space.lg, alignItems: 'center' as const },
  empty: { fontSize: font.meta, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
