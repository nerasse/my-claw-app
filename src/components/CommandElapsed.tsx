import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { formatSpan, msOf } from '../core/utils';
import { font, scaleFont, useThemedStyles, type Palette } from '../theme';

/**
 * Milliseconds since `since`, refreshed every second.
 *
 * A hook rather than a shared component, because the caller owns the typography: the same counter
 * sits under a command at body size and beside the reasoning label at micro size. Whoever calls
 * it is the only thing the tick redraws, never the thread around it.
 *
 * The figure is computed at every render from the real clock, and the interval's whole job is to
 * cause one. A `now` captured once in state froze the reading for as long as the component stayed
 * mounted, and a caller mounted before its instant existed -- a live group whose first card landed
 * later -- read a negative delta and drew `0 ms` until something else happened to re-render it.
 * `undefined` rather than `NaN` when the instant cannot be parsed at all: the caller draws no
 * figure instead of `NaN h` (2026-11-14).
 *
 * Accepts a number or a date string because the wire carries both: a `chat.tool` frame stamps its
 * `ts` as ISO, and the store copies what it is given onto a field typed `number`.
 */
export function useElapsed(since: number | string | undefined, paused = false): number | undefined {
  const [, tick] = useState(0);
  useEffect(() => {
    // Paused is not cosmetic: the compaction rule drops its counter when a stop is in flight (the
    // state takes the number's place), and a timer still ticking would re-render the rule -- and
    // every aside under it, which can be thousands of tokens of open summary -- once a second for a
    // figure nothing is reading any more.
    if (paused) return;
    const timer = setInterval(() => tick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [paused]);
  const at = msOf(since);
  return at === undefined ? undefined : Math.max(0, Date.now() - at);
}

/**
 * How long the server has been busy on a command. A `/compact` runs for one to two minutes with
 * nothing on the wire between the "running" notice and the result, so the bubble would otherwise
 * sit on the same words for the whole operation, which reads as a frozen app.
 */
export function CommandElapsed({ since, onAccent = false }: { since: number; onAccent?: boolean }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const elapsed = useElapsed(since);
  return (
    <Text style={[styles.elapsed, onAccent ? styles.elapsedAccent : null]}>
      {elapsed === undefined ? '' : ` ${formatSpan(elapsed)}`}
    </Text>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  elapsed: { fontSize: scaleFont(font.small, scale), color: palette.textMeta },
  /** On the owner's own bubble, which is a neutral surface: the faint grey vanishes there. */
  elapsedAccent: { color: palette.bubbleUserText, opacity: 0.62 },
});
