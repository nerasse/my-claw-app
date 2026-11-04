import { CheckIcon } from '../components/icons';
import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDismissKeyboard, useKeyboardHeight, useSheetBottomInset } from '../core/keyboard';
import { useLayout } from '../core/layout';
import { keyLayerProps } from '../core/keyNav';
import { useMenuFocus } from '../core/menuFocus';
import { useScrollIndicator } from './ScrollIndicator';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

export interface SheetOption {
  /** Identity of the row, when the label is not unique (two providers, one model name). */
  key?: string;
  label: string;
  /**
   * The mark the row wears, to the left of its label.
   *
   * Optional, and that is the point: a sheet of model names, workspaces or folders has no verb to
   * mark, and half a menu with icons reads as an unfinished menu. Verbs get one; lists do not.
   */
  icon?: React.ReactNode;
  /** Explains what the action does, when the label alone is not the whole answer. */
  hint?: string;
  /** Rendered with a checkmark: this is the option in effect. */
  selected?: boolean;
  danger?: boolean;
  /** The key that does the same from anywhere (`⇧B`), printed at the end of the row on the web. */
  shortcut?: string;
  onPress: () => void;
}

/** A divider between options, when a menu needs its first row to stand alone. */
export interface SheetSeparator {
  type: 'separator';
  key?: string;
}

/**
 * A status line. Not an option.
 *
 * "no model matches" and "loading routes..." used to be rows with `onPress: () => {}`: focusable,
 * announced as buttons, and doing nothing when pressed. The keyboard walked onto them and the
 * screen reader offered a control that does not exist.
 */
export interface SheetNote {
  type: 'note';
  key?: string;
  text: string;
}

export type SheetEntry = (SheetOption & { type?: undefined }) | SheetSeparator | SheetNote;

const keyOfEntry = (entry: SheetEntry): string => {
  if (entry.type === 'separator') return entry.key ?? 'separator';
  if (entry.type === 'note') return entry.key ?? entry.text;
  return entry.key ?? entry.label;
};

/**
 * The same key, made unique across a whole list.
 *
 * A separator carries no identity of its own, so every one of them answered `separator` and a
 * sheet with two groups logged "two children with the same key" on every render -- which is a
 * React warning today and a dropped row the day the behaviour changes.
 */
function uniqueKeys(entries: SheetEntry[]): string[] {
  const seen = new Map<string, number>();
  return entries.map(entry => {
    const base = keyOfEntry(entry);
    const prior = seen.get(base);
    seen.set(base, (prior ?? 0) + 1);
    return prior === undefined ? base : `${base}#${prior + 1}`;
  });
}

/**
 * How many rows the sheet lays out before it starts batching. The model search caps itself at 40
 * results precisely because a sheet is read, not scrolled; this covers that cap plus the rows
 * around it (the overflow count, the back row). Virtualization therefore only ever kicks in on
 * the one list that ignores the cap: browsing a provider group in a catalogue of hundreds.
 */
const EAGER_ROWS = 48;

/**
 * The one bottom sheet of the app: message actions, conversation actions, confirmations,
 * checklists. Every menu shares it, so a new command costs one option instead of a new
 * overlay. Custom content (effort chips, model submenu headers) slots in above the options.
 *
 * The text field remains unfocused on mount. A user tap is the only thing that opens its keyboard;
 * once open, `useSheetBottomInset` moves this sheet above it.
 */
export function ActionSheet({
  preview,
  options,
  search,
  children,
  onClose,
}: {
  preview?: string;
  options?: SheetEntry[];
  /** Filter row above the list, for a menu too long to read (the model catalog). */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** Numeric custom-context fields use the platform number pad rather than the search keyboard. */
    keyboardType?: 'default' | 'number-pad';
    returnKeyType?: 'search' | 'done';
  } | null;
  /** Custom content above the options (submenu headers, chips). */
  children?: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  // A sheet slides from the bottom because that is where a thumb is. A mouse is nowhere in
  // particular, so on a desktop the same menu is a dialog in the middle of the screen.
  const { dialogs } = useLayout();
  // The composer's keyboard goes on the way in, or it covers the lower options. The search row
  // is never autofocused, so this drops a keyboard the sheet did not ask for and never fights
  // one it did: the field only raises it once the user taps it.
  useDismissKeyboard();
  const bottomInset = useSheetBottomInset(space.xl);
  const keyboard = useKeyboardHeight();
  const { scrollProps, indicator } = useScrollIndicator();

  // The rows a keyboard walks, the search field first: what it focuses on opening, and where the
  // arrows go round (Android; the web does it with the DOM).
  const SEARCH_ROW = -1;
  const rows = [
    ...(search ? [SEARCH_ROW] : []),
    ...(options ?? []).flatMap((option, index) => (option.type === undefined ? [index] : [])),
  ];
  const selected = (options ?? []).findIndex(option => option.type === undefined && option.selected);
  const { refFor, propsFor } = useMenuFocus(rows, search ? SEARCH_ROW : selected >= 0 ? selected : rows[0]);
  // Computed once per options change: `keyExtractor` is read on every render of every row.
  const keys = useMemo(() => uniqueKeys(options ?? []), [options]);

  const renderEntry = useCallback(
    ({ item: option, index }: { item: SheetEntry; index: number }) =>
      option.type === 'separator' ? (
        <View style={styles.optionSeparator} />
      ) : option.type === 'note' ? (
        <Text style={styles.note}>{option.text}</Text>
      ) : (
        <Pressable
          ref={refFor(index)}
          {...propsFor(index)}
          style={[styles.option, dialogs && styles.optionDialog]}
          onPress={option.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: option.selected ?? false }}
          accessibilityLabel={option.label}>
          {/* The slot is always drawn, empty or not. It used to exist only on the rows that
              carried a glyph, so a menu of eleven rows where seven had an icon started those seven
              20 pt further right: the labels formed two columns and the list read as unfinished
              (owner, 2026-11-04: "tu as pas mis des icons pour toutes options et ça fait très
              moche"). One slot for every row keeps the text on one x, iconed menus and plain ones
              alike. The icon carries its own ink: `tone` is resolved inside each icon, so a danger
              row cannot recolour it from here. */}
          <View style={styles.optionIcon}>{option.icon ?? null}</View>
          <View style={styles.optionMain}>
            <Text style={[styles.optionLabel, option.danger && styles.optionDanger]}>{option.label}</Text>
            {option.hint ? (
              <Text style={styles.optionHint} numberOfLines={2}>
                {option.hint}
              </Text>
            ) : null}
          </View>
          {option.shortcut ? <Text style={styles.shortcut}>{option.shortcut}</Text> : null}
          {option.selected ? <CheckIcon size={16} tone="faint" /> : null}
        </Pressable>
      ),
    [styles, refFor, propsFor, dialogs],
  );

  return (
    <View style={[styles.backdrop, dialogs && styles.backdropCentered]}>
      {/* A tap's way out. Not a keyboard stop: Escape is that, and Tab must stay in the menu. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" focusable={false} />
      {/* Same absolute-positioning trap as the drawer: pad the gesture bar ourselves. */}
      <View
        {...keyLayerProps('menu')}
        style={[
          styles.sheet,
          // The padding that lifts the sheet clear of the keyboard counts towards its height:
          // held at 70% the list would be squeezed to a couple of rows the moment the search
          // row is tapped, so the ceiling rises while the keyboard is up.
          keyboard > 0 ? styles.sheetOverKeyboard : styles.sheetCapped,
          { paddingBottom: dialogs ? space.lg : bottomInset },
          dialogs && styles.dialog,
        ]}>
        {/* The grabber says "drag me down": a dialog is not dragged anywhere. */}
        {dialogs ? null : <View style={styles.grabber} />}
        {preview ? (
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        {search ? (
          <TextInput
            ref={refFor(SEARCH_ROW)}
            {...propsFor(SEARCH_ROW)}
            style={styles.search}
            value={search.value}
            onChangeText={search.onChange}
            placeholder={search.placeholder}
            placeholderTextColor={palette.textFaint}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType={search.keyboardType ?? 'default'}
            returnKeyType={search.returnKeyType ?? 'search'}
            accessibilityLabel={search.placeholder}
          />
        ) : null}
        {children}
        {options && options.length > 0 ? (
          <View style={styles.scrollWrap}>
            {/* Virtualized. Browsing a provider group in a catalogue of hundreds used to mount
                every row of it at once, inside a sheet capped at 70% of the screen. */}
            <FlatList
              {...scrollProps}
              style={styles.scroll}
              data={options}
              keyExtractor={(_entry, index) => keys[index] ?? String(index)}
              renderItem={renderEntry}
              keyboardShouldPersistTaps="handled"
              // FlatList detaches the rows scrolled out of view on Android by default: a keyboard
              // going round the menu landed on a row that was not in the window, and the next
              // arrow left the menu for the page under it.
              removeClippedSubviews={false}
              nestedScrollEnabled
              initialNumToRender={EAGER_ROWS}
              maxToRenderPerBatch={20}
              updateCellsBatchingPeriod={50}
              windowSize={9}
            />
            {indicator}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.xs,
  },
  backdropCentered: { justifyContent: 'center' as const, alignItems: 'center' as const },
  dialog: {
    // 320 for a menu, 400 for the model picker: a row of model names is data and needs the room,
    // a list of verbs does not, and a 460-wide menu of five short labels was a billboard.
    width: 320,
    maxWidth: '92%' as const,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingTop: space.lg,
  },
  // A long option list (every model) must scroll without leaving the screen.
  sheetCapped: { maxHeight: '70%' as const },
  sheetOverKeyboard: { maxHeight: '92%' as const },
  search: {
    minHeight: 40,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    marginBottom: space.xs,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    fontSize: font.meta,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  optionSeparator: { height: 1, backgroundColor: palette.border, marginVertical: space.xs },
  grabber: {
    alignSelf: 'center' as const,
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.surfaceRaised,
    marginBottom: space.sm,
  },
  preview: {
    fontSize: font.meta,
    color: palette.textMuted,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: space.sm,
    marginBottom: space.xs,
  },
  scrollWrap: { flexShrink: 1, minHeight: 0 },
  scroll: { flexGrow: 1 },
  /**
   * One metric per rank: a phone row is 46 (a thumb), a desktop dialog row is 34 (a mouse). No
   * rule under it: a sheet is a list of verbs, and a hairline between every pair of them turns
   * eleven rows into eleven compartments. The only rules in a sheet are the separators the caller
   * asked for, and they group intentions rather than punctuate each row.
   */
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: 9,
    borderRadius: radius.sm,
    minHeight: 46,
  },
  optionDialog: { minHeight: 34, paddingHorizontal: 9 },
  note: {
    paddingHorizontal: 9,
    paddingVertical: space.sm,
    fontSize: font.small,
    color: palette.textMeta,
  },
  optionMain: { flex: 1, gap: 1 },
  /** The glyph slot: a fixed 15 pt so a menu with icons and one without still share their text. */
  optionIcon: {
    width: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // 13.5, the POC's own row type: at `font.title` a five-word label in a 320 pt sheet read as a
  // paragraph of headings.
  optionLabel: { fontSize: 13.5, color: palette.text },
  optionDanger: { color: palette.danger },
  optionHint: { fontSize: font.small, color: palette.textMeta },
  shortcut: {
    fontSize: 10.5,
    fontFamily: 'monospace' as const,
    color: palette.textMeta,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden' as const,
  },
});
