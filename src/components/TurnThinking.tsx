import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useElapsed } from './CommandElapsed';
import { formatSpan } from '../core/utils';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * How long a call has to stay silent before the wait is worth saying.
 *
 * The engines that stream their thinking put the first delta on screen in one to two seconds
 * (measured: deepseek-v4.1-flash, 1658 ms), and a line that appears and is replaced that fast is a
 * flicker rather than information: the owner read it as "Thinking written before the model even
 * thought" (2026-09-30). What the line is for is the silence -- Codex at effort max sends nothing
 * for thirteen to twenty seconds, a provider being retried for minutes.
 *
 * A threshold rather than a list of engines: which model thinks silently is not a property of a
 * provider, and a list would be wrong the day a new one arrives. Measured on the wire, this is
 * three times the slowest first delta we have.
 */
export const WAIT_REVEAL_MS = 3000;

/**
 * True once `since` is older than `after`. Redraws at the threshold rather than polling: the line
 * must appear without a ticker running for a wait that may never be shown.
 */
export function useRevealed(since: number | undefined, after: number): boolean {
  const [revealed, setRevealed] = useState(() => since !== undefined && Date.now() - since >= after);
  useEffect(() => {
    if (since === undefined) {
      setRevealed(false);
      return;
    }
    const remaining = since + after - Date.now();
    if (remaining <= 0) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    const timer = setTimeout(() => setRevealed(true), remaining);
    return () => clearTimeout(timer);
  }, [since, after]);
  return revealed;
}

/**
 * The wait before a model's first token, drawn in the bubble the call opened: one muted line with
 * a counter, server-dated, in place of the caret an empty streaming bubble would wear.
 *
 * The engines that think before they write leave the screen empty for that whole stretch -- a
 * Codex turn at effort max sends nothing for twenty seconds, a provider being retried for minutes
 * -- and the thread read as dead, the Stop button its only sign of life (2026-09-30). The line
 * says the wait is work, and it is taken down by the first thing the turn produces.
 *
 * Deliberately the quietest thing on the screen: it must lose to every answer, and it is only
 * ever there while there is nothing else to read. The same counter the reasoning line uses, from
 * the same server instant, so a window that joins late counts from the start of the call.
 */
export function TurnThinking({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.line} accessibilityRole="progressbar" accessibilityLabel="The model is working">
      <Text style={styles.label}>Thinking</Text>
      <Text style={styles.elapsed}>{formatSpan(useElapsed(since))}</Text>
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: 6, paddingHorizontal: 2 },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.3 },
  elapsed: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, opacity: 0.75 },
});
