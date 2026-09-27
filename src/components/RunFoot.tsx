import React, { useContext } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RunInfo } from '../core/chat';
import { formatSpan } from '../core/utils';
import { font, scaleFont, useThemedStyles, type Palette } from '../theme';
import { RunContinueContext } from './runContinue';

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
 */
export function RunFoot({ run }: { run: RunInfo }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const span = run.endTs !== undefined ? formatSpan(run.endTs - run.startTs) : '';
  const failed = run.status === 'error';
  const stopped = run.status === 'aborted';
  // A run still marked running while the thread is at rest is one the server lost when it went
  // down: it never ended, and it can be picked up like a stopped one.
  const lost = run.status === 'running';
  const offer = useContext(RunContinueContext);
  const continuable = offer.onContinue !== undefined && offer.lastRunId === run.id && (failed || stopped || lost);
  return (
    <View style={styles.wrap}>
      <Text style={styles.span}>{span === '' ? 'run' : `run · ${span}`}</Text>
      {/* One vocabulary across the surfaces, and one place: the status is a fact of the run too,
          so it rides its signature instead of repeating on every fold header it passed. */}
      {failed ? <Text style={styles.statusError}> · error</Text> : null}
      {stopped ? <Text style={styles.statusAborted}> · Stopped</Text> : null}
      {/* On the thread's last run only, and only at rest: picks it back up where it was, with no
          new message. A word in the signature line rather than a button, like the rest of it. */}
      {continuable ? (
        <Pressable
          onPress={offer.onContinue}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Continue this run where it stopped">
          <Text style={styles.continue}> · ↻ Continue</Text>
        </Pressable>
      ) : null}
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
  continue: { fontSize: scaleFont(font.micro, scale), color: palette.accent, fontWeight: '600' as const },
});
