import React from 'react';
import { Text, View } from 'react-native';
import type { RunInfo } from '../core/chat';
import { formatSpan } from '../core/utils';
import { font, scaleFont, useThemedStyles, type Palette } from '../theme';

/**
 * Where a finished run signs its work: one faint line at the run's very end.
 *
 * It says what is true of the **run** rather than of whatever row sits above it -- how long the
 * run went, and the word it ended on. The span used to ride the title of the run's last fold
 * ("3 tool calls · memory · 2 h 33 min"), where it read as that fold's own time: "on a
 * l'impression que c'est le temps du dernier regroupement" (2026-09-22). The word `run` is what
 * scopes the number, and standing under the run's last message as its signature is what keeps it
 * from being read as a caption for anything else.
 *
 * Three homes, one shape (docs/run-grouping.md): under the run's last message, under its last
 * fold when it stopped mid-work, or on its own row when nothing else is left to sign.
 *
 * Continue used to be the last word of this line. It is a button of its own at the foot of the
 * thread now (`ContinueButton`): in the signature's type, on the same row as a bubble's `⋯`, it
 * was a target the thumb kept missing.
 */
export function RunFoot({ run }: { run: RunInfo }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const span = run.endTs !== undefined ? formatSpan(run.endTs - run.startTs) : '';
  const failed = run.status === 'error';
  const stopped = run.status === 'aborted';
  return (
    <View style={styles.wrap}>
      <Text style={styles.span}>{span === '' ? 'run' : `run · ${span}`}</Text>
      {/* One vocabulary across the surfaces, and one place: the status is a fact of the run too,
          so it rides its signature instead of repeating on every fold header it passed. */}
      {failed ? <Text style={styles.statusError}> · error</Text> : null}
      {stopped ? <Text style={styles.statusAborted}> · Stopped</Text> : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  // No width: as a column child it stretches to the thread and its content lands right, as a
  // menuRow child it shrinks to the few characters it holds.
  wrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  span: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint },
  statusError: { fontSize: scaleFont(font.micro, scale), color: palette.danger },
  statusAborted: { fontSize: scaleFont(font.micro, scale), color: palette.textMuted },
});
