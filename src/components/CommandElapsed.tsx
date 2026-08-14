import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { font, useThemedStyles, type Palette } from '../theme';

/** `47s`, then `1m 47s`: the shape the server already uses when it reports a run's duration. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * How long the server has been busy on a command. A `/compact` runs for one to two minutes with
 * nothing on the wire between the "running" notice and the result, so the bubble would otherwise
 * sit on the same words for the whole operation, which reads as a frozen app. The state lives
 * here so the tick redraws this line alone and not the thread around it.
 */
export function CommandElapsed({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return <Text style={styles.elapsed}>{` ${formatElapsed(now - since)}`}</Text>;
}

const createStyles = (palette: Palette) => ({
  elapsed: { fontSize: font.small, color: palette.textFaint },
});
