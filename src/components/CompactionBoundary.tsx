import React from 'react';
import { Text, View } from 'react-native';
import type { TextItem } from '../core/chat';
import { CollapsibleAside } from './CollapsibleAside';
import { useElapsed } from './CommandElapsed';
import { formatThinkingSpan } from '../core/utils';
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
          persistKey={`compaction:${item.id}`}
          trailing={
            item.compactionMs !== undefined ? (
              <Text style={styles.span}>{formatThinkingSpan(item.compactionMs)}</Text>
            ) : undefined
          }
        />
      ) : null}
    </View>
  );
});

/**
 * The same rule while the compaction is still running, at the bottom of the thread.
 *
 * The operation is one to two minutes of nothing on the wire, and a thread that shows nothing for
 * that long reads as a frozen app. It used to be a bubble ("Compacting the context...", a command
 * placeholder in the list) and that shape was the bug: an item is kept by sync deltas, moved to the
 * end by each of them, and removed by exactly one frame, so a lost end left ghosts of it wandering
 * through the run an hour later. This is drawn from thread state instead (`useCompacting`): one
 * per thread by construction, and it goes when the boundary it becomes arrives, or when anything
 * else shows the operation is over.
 */
export function CompactionRunning({ since, text }: { since: number; text?: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const elapsed = useElapsed(since);
  const summary = text?.trim() ?? '';
  return (
    <View style={styles.row} accessibilityRole="summary">
      <View style={styles.rule}>
        <View style={styles.line} />
        <Text style={styles.label}>Compacting the context · {formatThinkingSpan(elapsed)}</Text>
        <View style={styles.line} />
      </View>
      {/*
        The summary as the summarizer writes it, folded like every other aside. It is what makes
        the minute or two readable instead of a spinner: the owner can see the shape of what is
        being kept. Folded by default because it is thousands of tokens by the end, and this line
        sits at the bottom of the thread the reader is looking at.
      */}
      {summary ? (
        <CollapsibleAside
          label="Writing the summary…"
          body={summary}
          showHint="Show what the compaction is writing"
          hideHint="Hide what the compaction is writing"
          persistKey={`compaction-live:${since}`}
        />
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { width: '100%' as const, marginBottom: space.md, paddingHorizontal: space.sm },
  rule: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  line: { flex: 1, height: 1, backgroundColor: palette.border },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.3 },
  span: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint },
});
