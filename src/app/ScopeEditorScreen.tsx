import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

/**
 * The catalogue lives inside this page's scroll view, so it cannot virtualize: a list nested in a
 * scrollable of the same axis mounts every row whatever it is told. On the tools kind that
 * catalogue reaches the hundreds, so it is cut and the filter above it is how the rest is
 * reached — the same bargain the model picker and the agent file make.
 */
const PICKER_MAX_ROWS = 40;

/** The scope mode union the config and the agent file share: unset means "no key at all",
 *  which the config spells "inherit" and the file spells "absent". */
export type ScopeMode = 'inherit' | 'absent' | 'all' | 'list';

export interface ScopeItem {
  name: string;
  description: string;
}

/**
 * One scope's picker: skills or MCP servers of one agent, edited in the resolver's own
 * vocabulary. Three chips express the whole semantic: unset (the orchestrator's list applies,
 * or everything), all (the `*` wildcard), or a picked list. In list mode the live catalog is
 * checkable, with the entries the agent references but the catalog no longer carries pinned at
 * the top in red: they still exist in config, so they have to stay visible to be removed.
 * A save sends the whole choice; the caller decides whether it lands in config or the file.
 */
export function ScopeEditorScreen({
  title,
  subtitle,
  kind,
  available,
  mode,
  names,
  unknown,
  unsetLabel,
  unsetValue,
  error,
  saving,
  onBack,
  onSave,
}: {
  title: string;
  subtitle: string;
  kind: 'skills' | 'mcp' | 'tools';
  available: ScopeItem[];
  mode: ScopeMode;
  names: string[];
  /** Entries the agent references that the catalog no longer carries. Pinned red on top. */
  unknown: string[];
  /** The chip label for the no-key state: "Inherit" for the config, "Unset" for a file. */
  unsetLabel: string;
  /** The mode value that chip saves: "inherit" for the config, "absent" for a file. */
  unsetValue: 'inherit' | 'absent';
  error: string | null;
  saving: boolean;
  onBack: () => void;
  onSave: (mode: ScopeMode, names: string[]) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(names));
  const [chosen, setChosen] = useState<ScopeMode>(mode);

  const toggle = (name: string): void => {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setPicked(next);
  };

  const selected = useMemo(() => new Set(names), [names]);
  // Membership through a set, not a scan per pick: the tool catalogue reaches the hundreds and
  // this was `O(picked × available)` on every keystroke in the filter above.
  const pickedUnknown = useMemo(() => {
    const known = new Set(available.map(item => item.name));
    const gone = new Set(unknown);
    return [...picked].filter(name => gone.has(name) || !known.has(name));
  }, [available, picked, unknown]);
  // The needle is lowercased once, not twice per candidate.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return available;
    return available.filter(
      item =>
        item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle),
    );
  }, [available, query]);
  const rows = filtered.slice(0, PICKER_MAX_ROWS);
  const activeNames = chosen === 'list' ? [...picked] : [];

  const save = (): void => onSave(chosen, activeNames);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back from scope editor">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.saveButton, saving ? styles.saveDisabled : styles.saveEnabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          accessibilityLabel={saving ? 'Saving scope' : 'Save scope'}>
          <Text style={styles.saveText}>{saving ? '...' : 'Save'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Scope error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          {(
            [
              [unsetValue, unsetLabel],
              ['all', 'All'],
              ['list', 'Select'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setChosen(value)}
              style={[styles.chip, chosen === value ? styles.chipActive : styles.chipIdle]}
              accessibilityRole="button"
              accessibilityLabel={`Scope mode ${label}`}
              accessibilityState={{ selected: chosen === value }}>
              <Text style={chosen === value ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>
          {chosen === unsetValue
            ? unsetValue === 'inherit'
              ? 'the orchestrator\'s list applies, or everything when it has none'
              : 'the file carries no key: the config override or the tier below applies'
            : chosen === 'all'
              ? 'every installed item, current and future'
              : 'the names checked below'}
        </Text>

        {chosen === 'list' ? (
          <>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={`Filter ${kind === 'skills' ? 'skills' : kind === 'mcp' ? 'servers' : 'tools'}...`}
              placeholderTextColor={styles.placeholder.color}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={`Filter ${kind}`}
            />
            {pickedUnknown.length > 0 ? (
              <View style={styles.category}>
                <Text style={styles.section}>no longer exists</Text>
                <View style={[styles.card, styles.cardRemoved]}>
                  {pickedUnknown.map((name, index) => (
                    <View key={name}>
                      {index > 0 ? <View style={styles.separator} /> : null}
                      <Pressable
                        style={[styles.row, styles.link]}
                        onPress={() => toggle(name)}
                        accessibilityRole="button"
                        accessibilityLabel={`${selected.has(name) ? 'Remove' : 'Keep'} removed ${name}`}
                        accessibilityState={{ selected: picked.has(name) }}>
                        <Text style={[styles.itemName, styles.removed]}>{name}</Text>
                        <Text style={[styles.itemHint, styles.removed]} numberOfLines={1}>
                          {kind === 'skills' ? 'no such skill installed' : kind === 'mcp' ? 'no such MCP server declared' : 'no such tool in the catalog'}
                        </Text>
                        <Text style={[styles.glyph, styles.removed]}>{picked.has(name) ? '✓' : '✕'}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.category}>
              <Text style={styles.section}>{kind === 'skills' ? 'installed skills' : kind === 'mcp' ? 'declared servers' : 'tool catalog'}</Text>
              <View style={styles.card}>
                {rows.length === 0 ? (
                  <View style={styles.row}>
                    <Text style={styles.itemHint}>no match</Text>
                  </View>
                ) : (
                  rows.map((item, index) => (
                    <View key={item.name}>
                      {index > 0 ? <View style={styles.separator} /> : null}
                      <Pressable
                        style={[styles.row, styles.link]}
                        onPress={() => toggle(item.name)}
                        accessibilityRole="button"
                        accessibilityLabel={`Toggle ${item.name}`}
                        accessibilityState={{ selected: picked.has(item.name) }}>
                        <View style={styles.itemMain}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemHint} numberOfLines={1}>
                            {item.description}
                          </Text>
                        </View>
                        <Text style={styles.glyph}>{picked.has(item.name) ? '✓' : ''}</Text>
                      </Pressable>
                    </View>
                  ))
                )}
                {filtered.length > rows.length ? (
                  <View style={styles.row}>
                    <Text style={styles.itemHint}>
                      {`${filtered.length - rows.length} more · narrow the filter`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </>
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
  saveButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  chips: { flexDirection: 'row' as const, gap: space.sm },
  chip: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipIdle: { backgroundColor: palette.surface, borderColor: palette.border },
  chipTextActive: { fontSize: font.small, fontWeight: '600' as const, color: palette.surface },
  chipTextIdle: { fontSize: font.small, color: palette.textMuted },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  search: {
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
  category: { gap: space.xs },
  section: {
    fontSize: font.micro,
    color: palette.textFaint,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  cardRemoved: { borderColor: palette.danger },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  glyph: { fontSize: 18, color: palette.accent, width: 22, textAlign: 'center' as const },
  removed: { color: palette.danger },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
