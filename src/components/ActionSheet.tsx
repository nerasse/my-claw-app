import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDismissKeyboard, useSheetBottomInset } from '../core/keyboard';
import { useScrollIndicator } from './ScrollIndicator';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

export interface SheetOption {
  label: string;
  /** Explains what the action does, when the label alone is not the whole answer. */
  hint?: string;
  /** Rendered with a checkmark: this is the option in effect. */
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
}

/**
 * The one bottom sheet of the app: message actions, conversation actions, confirmations,
 * checklists. Every menu shares it, so a new command costs one option instead of a new
 * overlay. Custom content (effort chips, model submenu headers) slots in above the options.
 */
export function ActionSheet({
  preview,
  options,
  children,
  onClose,
}: {
  preview?: string;
  options?: SheetOption[];
  /** Custom content above the options (submenu headers, chips). */
  children?: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // Nothing in this sheet is typed into: the composer's keyboard goes, or it covers the lower
  // options. The inset stays for a keyboard that comes back up under a sheet that outlives it.
  useDismissKeyboard();
  const bottomInset = useSheetBottomInset(space.xl);
  const { scrollProps, indicator } = useScrollIndicator();
  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      {/* Same absolute-positioning trap as the drawer: pad the gesture bar ourselves. */}
      <View style={[styles.sheet, { paddingBottom: bottomInset }]}>
        <View style={styles.grabber} />
        {preview ? (
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        {children}
        {options && options.length > 0 ? (
          <View style={styles.scrollWrap}>
            <ScrollView
              {...scrollProps}
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled>
              {options.map(option => (
                <Pressable
                  key={option.label}
                  style={styles.option}
                  onPress={option.onPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.selected ?? false }}
                  accessibilityLabel={option.label}>
                  <View style={styles.optionMain}>
                    <Text style={[styles.optionLabel, option.danger && styles.optionDanger]}>
                      {option.label}
                    </Text>
                    {option.hint ? (
                      <Text style={styles.optionHint} numberOfLines={2}>
                        {option.hint}
                      </Text>
                    ) : null}
                  </View>
                  {option.selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
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
    // A long option list (every model) must scroll without leaving the screen.
    maxHeight: '70%' as const,
  },
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
