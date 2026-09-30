import React from 'react';
import { Text, View } from 'react-native';
import { useElapsed } from './CommandElapsed';
import { formatSpan } from '../core/utils';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * The wait before a model's first token, at the bottom of the thread: one muted line with a
 * counter, server-dated.
 *
 * The engines that think before they write leave the screen empty for that whole stretch -- a
 * Codex turn at effort max sends nothing for twenty seconds, a provider being retried for
 * minutes -- and the thread read as dead, the Stop button its only sign of life (2026-09-30).
 * The line says the wait is work, and it is taken down by the first thing the turn produces.
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
