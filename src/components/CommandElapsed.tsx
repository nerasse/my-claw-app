import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { formatSpan } from '../core/utils';
import { font, scaleFont, useThemedStyles, type Palette } from '../theme';

/**
 * Milliseconds since `since`, refreshed every second.
 *
 * A hook rather than a shared component, because the caller owns the typography: the same counter
 * sits under a command at body size and beside the reasoning label at micro size. Whoever calls
 * it is the only thing the tick redraws, never the thread around it.
 */
export function useElapsed(since: number, paused = false): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Paused is not cosmetic: the compaction rule drops its counter when a stop is in flight (the
    // state takes the number's place), and a timer still ticking would re-render the rule -- and
    // every aside under it, which can be thousands of tokens of open summary -- once a second for a
    // figure nothing is reading any more.
    if (paused) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [paused]);
  return now - since;
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
    <Text style={[styles.elapsed, onAccent ? styles.elapsedAccent : null]}>{` ${formatSpan(elapsed)}`}</Text>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  elapsed: { fontSize: scaleFont(font.small, scale), color: palette.textFaint },
  /** On the owner's own bubble, which is a neutral surface: the faint grey vanishes there. */
  elapsedAccent: { color: palette.bubbleUserText, opacity: 0.62 },
});
