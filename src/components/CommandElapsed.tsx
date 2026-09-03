import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { font, scaleFont, useThemedStyles, type Palette } from '../theme';

/** `47s`, then `1m 47s`: the shape the server already uses when it reports a run's duration. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Milliseconds since `since`, refreshed every second.
 *
 * A hook rather than a shared component, because the caller owns the typography: the same counter
 * sits under a command at body size and beside the reasoning label at micro size. Whoever calls
 * it is the only thing the tick redraws, never the thread around it.
 */
export function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
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
    <Text style={[styles.elapsed, onAccent ? styles.elapsedAccent : null]}>{` ${formatElapsed(elapsed)}`}</Text>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  elapsed: { fontSize: scaleFont(font.small, scale), color: palette.textFaint },
  /** On the owner's own bubble, whose background is the accent: the faint grey vanishes there. */
  elapsedAccent: { color: palette.accentText, opacity: 0.7 },
});
