import { ChevronIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ProviderInfo, ProvidersEnvResultFrame } from '../core/protocol';
import { envNamePresent } from '../core/providers';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

/**
 * The env key of one provider, page-sized (the user asked for real config pages, not menus
 * sliding under the list). Four operations, each deliberately distinct:
 *  - a value, only when the name is not set anywhere: setting a key that already works is
 *    refused on the page instead of asking for a value nobody needs;
 *  - a rename of the .env line itself (value preserved, server refuses a duplicate name);
 *  - a rebind onto an existing variable (the .env line stays untouched);
 *  - an unbind, which leaves the variable in .env for the other providers that share it.
 */
export function ProviderEnvScreen({
  provider,
  env,
  error,
  onBack,
  onSaveValue,
  onRename,
  onBind,
  onUnbind,
}: {
  provider: ProviderInfo;
  /** The names known to the server, or null while the store has not answered yet. */
  env: Omit<ProvidersEnvResultFrame, 'type'> | null;
  error: string | null;
  onBack: () => void;
  onSaveValue: (name: string, value: string) => void;
  onRename: (from: string, to: string) => void;
  onBind: (name: string) => void;
  onUnbind: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const name = provider.keyEnv ?? '';
  const present = envNamePresent(env, name);
  const [replace, setReplace] = useState(false);
  const [value, setValue] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const renamed = renameTo.trim();
  const renameTaken = renamed !== '' && renamed !== name && (env?.names.includes(renamed) ?? false);
  const canRename = renamed !== '' && renamed !== name && !renameTaken;

  // Names that hold a value somewhere on the server, for the one-tap rebind list.
  const rebindable = [...new Set([...(env?.present ?? []), ...(env?.names ?? [])])]
    .sort()
    .filter(candidate => candidate !== name);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to provider settings">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Environment variable</Text>
          <Text style={styles.subtitle}>{provider.key} · {name || 'none'}</Text>
        </View>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Provider env error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {name ? (
          <View style={styles.category}>
            <Text style={styles.section}>current</Text>
            <Text style={styles.name}>{name}</Text>
            {present ? (
              <>
                <Text style={styles.note}>
                  already configured on the server · this provider uses it as is
                </Text>
                <Pressable
                  onPress={() => setReplace(current => !current)}
                  style={styles.linkRow}
                  accessibilityRole="button"
                  accessibilityLabel="Replace the value">
                  <Text style={styles.linkText}>Replace the value</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.note}>not set yet · the value below is written to .env on the server</Text>
            )}
            {!present || replace ? (
              <View style={styles.valueRow}>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  placeholder="the secret value, never shown back"
                  placeholderTextColor={styles.placeholder.color}
                  secureTextEntry
                  autoCorrect={false}
                  accessibilityLabel="Provider env value"
                />
                <Pressable
                  onPress={() => {
                    if (value.trim()) {
                      onSaveValue(name, value.trim());
                      setValue('');
                      setReplace(false);
                    }
                  }}
                  disabled={!value.trim()}
                  style={[styles.button, value.trim() ? styles.buttonPrimary : styles.buttonDisabled]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !value.trim() }}
                  accessibilityLabel={present ? 'Save new value' : 'Save value to .env'}>
                  <Text style={value.trim() ? styles.buttonTextPrimary : styles.buttonTextOff}>Save</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {name ? (
          <View style={styles.category}>
            <Text style={styles.section}>rename the variable</Text>
            <TextInput
              style={styles.input}
              value={renameTo}
              onChangeText={setRenameTo}
              placeholder={name}
              placeholderTextColor={styles.placeholder.color}
              autoCorrect={false}
              autoCapitalize="characters"
              accessibilityLabel="Rename the env variable"
            />
            {renameTaken ? <Text style={styles.note}>{renamed} already exists in .env · rebind instead</Text> : null}
            <Pressable
              onPress={() => {
                if (canRename) onRename(name, renamed);
              }}
              disabled={!canRename}
              style={[styles.button, canRename ? styles.buttonPrimary : styles.buttonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canRename }}
              accessibilityLabel="Rename the variable">
              <Text style={canRename ? styles.buttonTextPrimary : styles.buttonTextOff}>Rename</Text>
            </Pressable>
            <Text style={styles.note}>renames the .env line itself · the value is preserved</Text>
          </View>
        ) : null}

        {name ? (
          <View style={styles.category}>
            <Text style={styles.section}>use another variable</Text>
            <Text style={styles.note}>the .env line stays untouched · this provider reads the picked name</Text>
            <View style={styles.card}>
              {rebindable.map((candidate, index) => (
                <Pressable
                  key={candidate}
                  style={[styles.row, styles.link]}
                  onPress={() => onBind(candidate)}
                  accessibilityRole="button"
                  accessibilityLabel={`Bind to ${candidate}`}>
                  <Text style={styles.rowText}>{candidate}</Text>
                  {index < rebindable.length - 1 ? <View style={styles.separator} /> : null}
                </Pressable>
              ))}
              {rebindable.length === 0 ? (
                <Text style={styles.empty}>no other variable set on the server</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {name ? (
          <Pressable
            onPress={onUnbind}
            style={styles.dangerRow}
            accessibilityRole="button"
            accessibilityLabel="Stop using the env variable">
            <Text style={styles.dangerText}>Stop using an environment variable</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>this provider reads no environment variable</Text>
        )}
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
  name: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  note: { fontSize: font.micro, color: palette.textFaint },
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
  valueRow: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'center' as const },
  button: {
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignSelf: 'flex-start' as const,
  },
  buttonPrimary: { backgroundColor: palette.accent },
  buttonDisabled: { backgroundColor: palette.surfaceAlt },
  buttonTextPrimary: { fontSize: font.meta, fontWeight: '600' as const, color: palette.accentText },
  buttonTextOff: { fontSize: font.meta, fontWeight: '600' as const, color: palette.textFaint },
  linkRow: { paddingVertical: space.xs },
  linkText: { fontSize: font.meta, color: palette.accent, fontWeight: '600' as const },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  row: { paddingHorizontal: space.md, paddingVertical: space.sm },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  rowText: { fontSize: font.body, color: palette.text },
  separator: { height: 1, backgroundColor: palette.border },
  empty: { fontSize: font.meta, color: palette.textFaint, padding: space.md },
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
