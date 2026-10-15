import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CopyButton } from './CopyButton';
import { useOpenSelection } from '../core/textSelection';
import { chatSelectable } from '../core/platform';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * What a block of text inside the thread offers: take all of it, and -- where the platform
 * cannot select in place -- go and pick a piece.
 *
 * Both are buttons because neither can be a gesture on a phone: a selection cannot cross a Text
 * node and cannot be started inside the chat list without throwing it to the other end, so
 * `select` opens the viewer where it can (docs/text-selection.md), and `copy` covers the common
 * case without leaving the conversation at all.
 *
 * On the web the pair keeps `copy` and drops `select`: the browser selects across nodes on its
 * own, so the viewer would be a second way to do what the pointer already does -- but the owner
 * asked for the copy back (2026-10-15): sweeping a few hundred lines of tool output by hand does
 * not read as a shortcut.
 */
export function BlockActions({ title, value }: { title: string; value: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const openSelection = useOpenSelection();

  return (
    <View style={styles.row}>
      <CopyButton value={value} accessibilityLabel={`Copy ${title.toLowerCase()}`} />
      {chatSelectable ? null : (
        <Pressable
          hitSlop={10}
          onPress={() => openSelection({ title, body: value })}
          accessibilityRole="button"
          accessibilityLabel={`Select text in ${title.toLowerCase()}`}>
          <Text style={styles.select}>select</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  select: { fontSize: scaleFont(font.micro, scale), color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
});
