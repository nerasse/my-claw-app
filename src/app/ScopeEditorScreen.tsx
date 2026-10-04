import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { CardEdge } from '../components/CardEdge';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';

const EMPTY_ITEMS: ScopeItem[] = [];
Object.freeze(EMPTY_ITEMS);

const keyOfItem = (item: ScopeItem): string => item.name;

/** One catalogue entry. Memoized, and handed the name: the tools kind runs to the hundreds. */
const ScopeRow = React.memo(function ScopeRowView({
  item,
  checked,
  first,
  last,
  onToggle,
}: {
  item: ScopeItem;
  checked: boolean;
  first: boolean;
  last: boolean;
  onToggle: (name: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <CardEdge first={first} last={last}>
      <Pressable
        style={styles.row}
        onPress={() => onToggle(item.name)}
        accessibilityRole="button"
        accessibilityLabel={`Toggle ${item.name}`}
        accessibilityState={{ selected: checked }}
      >
        <View style={styles.itemMain}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemHint} numberOfLines={1}>
            {item.description}
          </Text>
        </View>
        <Text style={styles.glyph}>{checked ? '✓' : ''}</Text>
      </Pressable>
    </CardEdge>
  );
});

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

  const toggle = useCallback((name: string): void => {
    setPicked(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

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
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle),
    );
  }, [available, query]);
  const activeNames = chosen === 'list' ? [...picked] : [];

  const renderRow = useCallback(
    ({ item, index }: { item: ScopeItem; index: number }) => (
      <ScopeRow
        item={item}
        checked={picked.has(item.name)}
        first={index === 0}
        last={index === filtered.length - 1}
        onToggle={toggle}
      />
    ),
    [filtered.length, picked, toggle],
  );

  const save = (): void => onSave(chosen, activeNames);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to the agent"
        >
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
          style={[
            styles.saveButton,
            saving ? styles.saveDisabled : styles.saveEnabled,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          accessibilityLabel={saving ? 'Saving scope' : 'Save scope'}
        >
          <Text style={styles.saveText}>{saving ? '...' : 'Save'}</Text>
        </Pressable>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Scope error ${error}`}>
          {error}
        </Text>
      ) : null}

      {/* The catalogue is the list; everything that sits above it is the list's header, so the
          tool kind can run to hundreds of rows without mounting them all. */}
      <FlatList
        data={chosen === 'list' ? filtered : EMPTY_ITEMS}
        keyExtractor={keyOfItem}
        renderItem={renderRow}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        ListEmptyComponent={
          chosen === 'list' ? (
            <CardEdge first last>
              <View style={styles.row}>
                <Text style={styles.itemHint}>no match</Text>
              </View>
            </CardEdge>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
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
                  style={[
                    styles.chip,
                    chosen === value ? styles.chipActive : styles.chipIdle,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Scope mode ${label}`}
                  accessibilityState={{ selected: chosen === value }}
                >
                  <Text
                    style={
                      chosen === value
                        ? styles.chipTextActive
                        : styles.chipTextIdle
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.note}>
              {chosen === unsetValue
                ? unsetValue === 'inherit'
                  ? "the orchestrator's list applies, or everything when it has none"
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
                    {pickedUnknown.map((name, index) => (
                      <CardEdge
                        key={name}
                        danger
                        first={index === 0}
                        last={index === pickedUnknown.length - 1}
                      >
                        <Pressable
                          style={styles.row}
                          onPress={() => toggle(name)}
                          accessibilityRole="button"
                          accessibilityLabel={`${selected.has(name) ? 'Remove' : 'Keep'} removed ${name}`}
                          accessibilityState={{ selected: picked.has(name) }}
                        >
                          <Text style={[styles.itemName, styles.removed]}>
                            {name}
                          </Text>
                          <Text
                            style={[styles.itemHint, styles.removed]}
                            numberOfLines={1}
                          >
                            {kind === 'skills'
                              ? 'no such skill installed'
                              : kind === 'mcp'
                                ? 'no such MCP server declared'
                                : 'no such tool in the catalog'}
                          </Text>
                          <Text style={[styles.glyph, styles.removed]}>
                            {picked.has(name) ? '✓' : '✕'}
                          </Text>
                        </Pressable>
                      </CardEdge>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.section}>
                  {kind === 'skills'
                    ? 'installed skills'
                    : kind === 'mcp'
                      ? 'declared servers'
                      : 'tool catalog'}
                </Text>
              </>
            ) : null}
          </View>
        }
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
  headerText: { flex: 1, gap: 1 },
  title: {
    fontSize: font.title,
    fontWeight: '600' as const,
    color: palette.text,
  },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  saveButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.surface,
  },
  // No `gap` here: the rows of the card are list items, and a gap would prise them apart.
  body: { padding: space.md, paddingBottom: space.xl },
  headerBlock: { gap: space.md, paddingBottom: space.xs },
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
  chipTextActive: {
    fontSize: font.small,
    fontWeight: '600' as const,
    color: palette.surface,
  },
  chipTextIdle: { fontSize: font.small, color: palette.textMuted },
  note: {
    fontSize: font.micro,
    color: palette.textFaint,
    paddingHorizontal: space.xs,
  },
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
  // The card and its separators live in CardEdge now: they are drawn per row so the list inside
  // them can virtualize.
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  glyph: {
    fontSize: 18,
    color: palette.accent,
    width: 22,
    textAlign: 'center' as const,
  },
  removed: { color: palette.danger },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
