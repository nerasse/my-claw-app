import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useElapsed } from './CommandElapsed';
import { formatSpan } from '../core/utils';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * How long a call has to stay silent before the wait is worth saying.
 *
 * The engines that stream their reasoning put the first delta on screen in one to two seconds
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
 * The wait before a model's first output, climbing in the bubble the call opened.
 *
 * The engines that think before they write leave the screen empty for that whole stretch -- a Codex
 * turn at effort max sends nothing for twenty seconds, a provider being retried for minutes -- and
 * the thread read as dead, the Stop button its only sign of life (2026-09-30). The line says the
 * wait is work, and the first thing the turn produces takes it down.
 *
 * It is labelled `wait` and not with a word about thinking, because nothing has come out of the
 * call yet and the app genuinely does not know: the model may be reasoning, may be reading a long
 * prompt, may be queued behind a retry. The same figure comes back on the reasoning row as
 * `wait 4 s` once there is a thought to sit beside, so the number does not change identity between
 * the wait and the answer -- only its place.
 */
export function WaitLine({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.line} accessibilityRole="progressbar" accessibilityLabel="The model is working">
      <Text style={styles.label}>wait</Text>
      <Text style={styles.elapsed}>{formatSpan(useElapsed(since))}</Text>
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: 6, paddingHorizontal: 2 },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.3 },
  elapsed: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, opacity: 0.75 },
});
