import { ChevronIcon } from '../components/icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { CloseButton } from '../components/CloseButton';

/** Name rules of the server loader: lowercase, digits, dashes, no leading dash. */
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The empty shell a new agent starts from: the mandatory description and a body placeholder. */
export const NEW_AGENT_BODY = 'You are the <name> agent. Describe what you do and when to use you.\n';

/**
 * Creates a new agent: one file in the custom tier with the loader's own name rules and the one
 * mandatory field. The description is the load-bearing line -- it is what the orchestrator reads
 * to decide whether to spawn the agent -- so it is validated client-side for the one rule that
 * matters (a single line) and the server keeps the rest of the checks.
 */
export function NewAgentScreen({
  error,
  busy,
  onBack,
  onCreate,
}: {
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onCreate: (name: string, description: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const valid = NAME_RE.test(name) && description.trim().length > 0 && !description.includes('\n');
  const canCreate = valid && !busy;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to agents">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>New agent</Text>
          <Text style={styles.subtitle}>one file in the custom tier, hot-reloaded</Text>
        </View>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`New agent error ${error}`}>
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
            placeholder="reviewer (the filename)"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="New agent name"
          />
          <Text style={styles.note}>lowercase letters, digits and dashes · becomes agents/&lt;name&gt;.md</Text>
        </View>
        <View style={styles.category}>
          <Text style={styles.section}>description</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="what the orchestrator reads before spawning this agent"
            placeholderTextColor={styles.placeholder.color}
            autoCorrect={false}
            accessibilityLabel="New agent description"
          />
        </View>
        <Pressable
          onPress={() => onCreate(name.trim(), description.trim())}
          disabled={!canCreate}
          style={[styles.createButton, canCreate ? styles.createEnabled : styles.createDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate }}
          accessibilityLabel="Create agent">
          <Text style={canCreate ? styles.createText : styles.createTextOff}>
            {busy ? '...' : 'Create'}
          </Text>
        </Pressable>
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
  category: { gap: space.xs },
  section: { fontSize: font.micro, color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
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
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  createButton: {
    marginTop: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center' as const,
  },
  createEnabled: { backgroundColor: palette.accent },
  createDisabled: { backgroundColor: palette.surfaceAlt },
  createText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  createTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
