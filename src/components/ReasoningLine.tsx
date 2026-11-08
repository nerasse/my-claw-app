import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { CollapsibleAside } from './CollapsibleAside';
import { useElapsed } from './CommandElapsed';
import { WAIT_REVEAL_MS } from './WaitLine';
import { formatSpan } from '../core/utils';
import { requestReasoning, useKnownReasoning } from '../core/reasoningFetch';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/** "1.2k" rather than "1234": this is a progress hint, not an accounting figure. */
function compactCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/**
 * How long the reasoning has been going, climbing once a second.
 *
 * Its own component, so the tick redraws these few characters and nothing else: the label sits
 * inside a bubble that is streaming markdown at the same time, and re-rendering that on every
 * second to move a counter would be paid for by the whole thread.
 */
function ReasoningElapsed({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.figure}>{formatSpan(useElapsed(since))}</Text>;
}

/**
 * What a call spent thinking and for how long, after the label: `1.2k tokens · 12 s`.
 *
 * The same figures in both states of the line, so a thought the endpoint summarised and one it kept
 * to itself read alike, one with a chevron and one without.
 */
function ReasoningFigures({
  count,
  startedAt,
  durationMs,
  running,
}: {
  count: string;
  startedAt?: number;
  durationMs?: number;
  running: boolean;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const elapsed =
    running && startedAt !== undefined ? (
      <ReasoningElapsed since={startedAt} />
    ) : durationMs !== undefined ? (
      <Text style={styles.figure}>{formatSpan(durationMs)}</Text>
    ) : null;
  if (!count && !elapsed) return null;
  return (
    <View style={styles.figures}>
      {count ? <Text style={styles.figure}>{`${count} tokens`}</Text> : null}
      {count && elapsed ? <Text style={styles.figure}>·</Text> : null}
      {elapsed}
    </View>
  );
}

/**
 * Whether the reasoning row has anything to draw at all, which is also what decides if the bubble
 * still needs its caret.
 *
 * Single-sourced on purpose: the two used to be decided apart, and a bubble that showed the row and
 * the caret together wore two "working" marks in the same place (2026-10-27, the wait alone on a row).
 */
export function showsReasoningRow({
  reasoning,
  reasoningChars,
  tokens,
  waitMs,
}: {
  reasoning?: string;
  reasoningChars?: number;
  tokens?: number;
  waitMs?: number;
}): boolean {
  const hasBody = Boolean(reasoning?.trim()) || (reasoningChars ?? 0) > 0;
  if (hasBody || (tokens ?? 0) > 0) return true;
  // Nothing to say about the thinking: the row is worth drawing only for a wait long enough to read,
  // the same threshold the live counter uses. A fast answer must not add a line to every bubble.
  return waitMs !== undefined && waitMs >= WAIT_REVEAL_MS;
}

/**
 * What the model thought, as one muted line at the top of its own bubble, collapsed by default and
 * expanded on tap. Deliberately quiet: it must lose every contest with the answer.
 *
 * It carries how long the thinking took, live while it lasts and fixed once the answer starts, what
 * the call spent on it once the call has answered, and opposite all of it the wait that preceded the
 * first word. A model can think for a minute with nothing else on screen, and the line is the only
 * place that says the wait is progress rather than a stall.
 *
 * An endpoint may keep the words of a thought and report only its count (the Responses API
 * summarises part of its thoughts). There is then nothing to reveal, so the line renders as static
 * text rather than a button that opens nothing. See the server's docs/reasoning-visibility.md.
 */
export function ReasoningLine({
  id,
  threadId,
  reasoning,
  reasoningChars,
  tokens,
  startedAt,
  durationMs,
  waitMs,
  streaming,
  expandReasoning,
  actions,
  headHeight,
  at,
}: {
  /**
   * The bubble this reasoning belongs to, which is what keeps a section the reader opened open.
   *
   * Without it the open state lived in local component state, and the live-to-history transition
   * threw it away: a section expanded mid-stream slammed shut the moment the run ended. The id is
   * stable across that transition -- the live bubble's id is the entry's id.
   */
  id?: string;
  /** Where to ask for a reasoning the page left on the server. */
  threadId?: string;
  reasoning?: string;
  /** The page carried its length instead of the text: asked for when the line opens. */
  reasoningChars?: number;
  /** What the call spent thinking, once it has answered. */
  tokens?: number;
  /** When the thinking started, while it is still running. */
  startedAt?: number;
  /** How long it took, once it is over. */
  durationMs?: number;
  /** How long the call took to say anything at all, measured by the server. */
  waitMs?: number;
  /** The bubble is still being written: the thinking may not be over. */
  streaming: boolean;
  /** Server-owned pref: start expanded instead of folded. */
  expandReasoning?: boolean;
  /**
   * The bubble's own controls, for the bubble that is nothing but a thought: it has no message under
   * the line to hang them on, so they close this row while it is folded.
   */
  actions?: React.ReactNode;
  /** The head row's exact height, on a run's spine: the chevron must sit on the dot's axis. */
  headHeight?: number;
  /** When the thought happened, drawn at the bottom right of what it unfolds. */
  at?: number;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const known = useKnownReasoning(threadId, id);
  const onDemand = !reasoning?.trim() && (reasoningChars ?? 0) > 0;
  const ask = useCallback(() => {
    if (threadId && id) requestReasoning(threadId, id);
  }, [threadId, id]);

  const body = (reasoning?.trim() || known?.trim()) ?? '';
  const hasBody = body.length > 0 || onDemand;
  const count = tokens && tokens > 0 ? compactCount(tokens) : '';
  const hasThought = hasBody || count !== '';
  // A thought of its own gets the figure whatever it cost -- it is a footnote on a row that is
  // already there. Alone, it has to be worth a line of its own; `showsReasoningRow` says which.
  const wait = showsReasoningRow({ reasoning, reasoningChars, tokens, waitMs }) && waitMs !== undefined && waitMs > 0
    ? waitMs
    : undefined;

  if (!hasThought && wait === undefined) return null;

  // Running only while the bubble is still open and nothing has sealed the span: a thread
  // rehydrated from server history carries neither field, and must not start a counter from an
  // instant it does not have.
  const running = streaming && durationMs === undefined && startedAt !== undefined;
  const figures = <ReasoningFigures count={count} startedAt={startedAt} durationMs={durationMs} running={running} />;
  // `wait` and not a bare span: the duration beside the label is what the thinking lasted, and two
  // bare figures on one row would read as one span measured twice.
  const waitFigure = wait !== undefined ? (
    <Text style={styles.figure}>{`wait ${formatSpan(wait)}`}</Text>
  ) : null;

  // Nothing to open: a thought the endpoint kept to itself, or a call that only had a long wait.
  // The row is static text, and the label goes only where there is a thought for it to name.
  if (!hasBody) {
    // With a count there is still a row to hang the wait off, and the wait keeps the far end it has
    // everywhere else. Alone it starts the row instead: a lone figure pushed right sits exactly
    // where the bubble's own clock sits, and would read as a second one.
    const alone = count === '';
    return (
      // The same head height the open state takes, for the same reason: on a line of a run's spine
      // the wait sits on the dot's axis only if the row is the height the dot is centred on
      // (owner, 2026-11-08: "le wait est pas aligné sur le dot").
      <View style={[styles.line, headHeight !== undefined ? { height: headHeight } : null]}>
        {count ? (
          /*
            One name in every state, like the aside below: the figures say what the thinking cost,
            and the word does not have to move to say it.
          */
          <Text style={styles.label}>Reasoning</Text>
        ) : null}
        {figures}
        {alone ? null : <View style={styles.spacer} />}
        {waitFigure}
        {actions}
      </View>
    );
  }

  return (
    <CollapsibleAside
      label="Reasoning"
      trailing={figures}
      right={waitFigure}
      {...(actions ? { actions } : {})}
      {...(headHeight !== undefined ? { headHeight } : {})}
      {...(at !== undefined ? { clockAt: at } : {})}
      body={body}
      showHint="Show the model's reasoning"
      hideHint="Hide the model's reasoning"
      defaultOpen={expandReasoning ?? false}
      {...(id ? { persistKey: `reasoning:${id}` } : {})}
      {...(onDemand && !body ? { pending: known === null ? 'no longer available' : 'loading…', onOpen: ask } : {})}
    />
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: 2 },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, letterSpacing: 0.3 },
  figures: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, flexShrink: 1 },
  /** Pushes the wait to the far end: it is a footnote to the row, not part of its sentence. */
  spacer: { flex: 1 },
  /** One step fainter than the label it follows: what the thinking cost is context on an aside, not
   *  a second label competing with it. */
  figure: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, opacity: 0.75 },
});
