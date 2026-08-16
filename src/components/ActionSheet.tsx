import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDismissKeyboard, useKeyboardHeight, useSheetBottomInset } from '../core/keyboard';
import { useLayout } from '../core/layout';
import { useScrollIndicator } from './ScrollIndicator';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

export interface SheetOption {
  /** Identity of the row, when the label is not unique (two providers, one model name). */
  key?: string;
  label: string;
  /** Explains what the action does, when the label alone is not the whole answer. */
  hint?: string;
  /** Rendered with a checkmark: this is the option in effect. */
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
}

/** A divider between options, when a menu needs its first row to stand alone. */
export interface SheetSeparator {
  type: 'separator';
  key?: string;
}

export type SheetEntry = (SheetOption & { type?: undefined }) | SheetSeparator;

const keyOfEntry = (entry: SheetEntry): string =>
  entry.type === 'separator' ? entry.key ?? 'separator' : entry.key ?? entry.label;

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

  const renderEntry = useCallback(
    ({ item: option }: { item: SheetEntry }) =>
      option.type === 'separator' ? (
        <View style={styles.optionSeparator} />
      ) : (
        <Pressable
          style={styles.option}
          onPress={option.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: option.selected ?? false }}
          accessibilityLabel={option.label}>
          <View style={styles.optionMain}>
            <Text style={[styles.optionLabel, option.danger && styles.optionDanger]}>{option.label}</Text>
            {option.hint ? (
              <Text style={styles.optionHint} numberOfLines={2}>
                {option.hint}
              </Text>
            ) : null}
          </View>
          {option.selected ? <Text style={styles.check}>✓</Text> : null}
        </Pressable>
      ),
    [styles],
  );

  return (
    <View style={[styles.backdrop, dialogs && styles.backdropCentered]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      {/* Same absolute-positioning trap as the drawer: pad the gesture bar ourselves. */}
      <View
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
            style={styles.search}
            value={search.value}
            onChangeText={search.onChange}
            placeholder={search.placeholder}
            placeholderTextColor={palette.textFaint}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
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
              keyExtractor={keyOfEntry}
              renderItem={renderEntry}
              keyboardShouldPersistTaps="handled"
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
    width: 460,
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
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.border,
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
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionMain: { flex: 1, gap: 1 },
  optionLabel: { fontSize: font.title, color: palette.text },
  optionDanger: { color: palette.danger },
  optionHint: { fontSize: font.small, color: palette.textFaint },
  check: { fontSize: font.body, color: palette.accent, fontWeight: '700' as const },
});
