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
  // A stopped compaction is the boundary's sibling: same rule, same count of turns, and the
  // wording is the only difference -- nothing was folded, so it says what it kept instead of what
  // it summarized. The body is empty by contract (no summary was ever written), so no aside is
  // offered: the reader sees a rule and nothing to open.
  return (
    <View style={styles.row} accessibilityRole="summary">
      <View style={styles.rule}>
        <View style={styles.line} />
        <Text style={styles.label}>
          {item.compactionStopped
            ? `Compaction stopped · ${turns(count)} kept`
            : `Context compacted · ${turns(count)} summarized`}
        </Text>
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
export function CompactionRunning({ since, text, reasoning, stopping }: { since: number; text?: string; reasoning?: string; stopping?: boolean }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // The counter is dropped the moment a stop is in flight, so its tick goes with it: the rule then
  // reads as one steady word instead of redrawing itself every second.
  const elapsed = useElapsed(since, stopping === true);
  const summary = text?.trim() ?? '';
  const thinking = reasoning?.trim() ?? '';
  return (
    <View style={styles.row} accessibilityRole="summary">
      <View style={styles.rule}>
        <View style={styles.line} />
        {/*
          A stop in flight takes the counter's place: the operation is ending, not progressing,
          and a number still climbing would say the opposite of the truth the moment the reader
          looks at it. The same word as the session menu, so one stop reads the same everywhere.
        */}
        <Text style={styles.label}>
          {stopping ? 'Stopping…' : `Compacting the context · ${formatThinkingSpan(elapsed)}`}
        </Text>
        <View style={styles.line} />
      </View>
      {/*
        What it is thinking, before a word of the summary exists. A summarizer that inherits the
        session's effort spends its first minute here, and the rule with a counter was all there
        was to see: a model thinking hard read exactly like a dead provider, which is what the
        owner was staring at while deepseek answered nothing at all (2026-09-14).
      */}
      {thinking ? (
        <CollapsibleAside
          label="Thinking…"
          body={thinking}
          showHint="Show what the compaction is thinking"
          hideHint="Hide what the compaction is thinking"
          persistKey={`compaction-think:${since}`}
        />
      ) : null}
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
