import React from 'react';
import { Text, View } from 'react-native';
import type { TextItem } from '../core/chat';
import { CollapsibleAside } from './CollapsibleAside';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

function turns(count: number): string {
  return `${count} ${count === 1 ? 'turn' : 'turns'}`;
}

/**
 * Where a compaction cut the prompt. Not a message, so not a bubble: the server keeps the summary
 * in a `user` turn because that is the role the prompt needs it in, and drawn as one it was a wall
 * of `[Prior context summarized]` in the owner's own voice -- the thread looked like he had typed
 * a transcript of himself.
 *
 * A rule across the thread says what it is, because that is the true shape of the thing: the turns
 * above it still exist and are still scrolled through, they are simply not in the prompt any more.
 * The summary folds under it, like every other aside: what the model was handed instead is worth
 * being able to check, and is not worth a screenful on the way past.
 */
export const CompactionBoundary = React.memo(function CompactionBoundaryView({
  item,
}: {
  item: TextItem;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const count = item.summaryOf ?? 0;
  return (
    <View style={styles.row} accessibilityRole="summary">
      <View style={styles.rule}>
        <View style={styles.line} />
        <Text style={styles.label}>Context compacted · {turns(count)} summarized</Text>
        <View style={styles.line} />
      </View>
      {item.text ? (
        <CollapsibleAside
          label="Summary"
          body={item.text}
          showHint="Show what the compaction kept"
          hideHint="Hide the summary"
        />
      ) : null}
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { width: '100%' as const, marginBottom: space.md, paddingHorizontal: space.sm },
  rule: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  line: { flex: 1, height: 1, backgroundColor: palette.border },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.3 },
});
