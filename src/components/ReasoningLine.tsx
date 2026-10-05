import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { CollapsibleAside } from './CollapsibleAside';
import { useElapsed } from './CommandElapsed';
import { formatSpan } from '../core/utils';
import { requestReasoning, useKnownReasoning } from '../core/reasoningFetch';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/** "1.2k" rather than "1234": this is a progress hint, not an accounting figure. */
function compactCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/**
 * How long the thinking has been going, climbing once a second.
 *
 * Its own component, so the tick redraws these few characters and nothing else: the label sits
 * inside a bubble that is streaming markdown at the same time, and re-rendering that on every
 * second to move a counter would be paid for by the whole thread.
 */
function ThinkingElapsed({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.elapsed}>{formatSpan(useElapsed(since))}</Text>;
}

/**
 * What the model thought, as one muted line at the top of its own bubble, collapsed by default and
 * expanded on tap. Deliberately quiet: it must lose every contest with the answer.
 *
 * It carries how long the thinking took, live while it lasts and fixed once the answer starts.
 * A model can think for a minute with nothing else on screen, and the line is the only place that
 * says the wait is progress rather than a stall.
 *
 * Engines that redact their thinking (the Claude bridge) send only a token estimate. There is then
 * nothing to reveal, so the line renders as static text rather than a button that opens nothing.
 * See the server's docs/reasoning-visibility.md.
 */
export function ReasoningLine({
  id,
  threadId,
  reasoning,
  reasoningChars,
  tokens,
  startedAt,
  durationMs,
  streaming,
  expandReasoning,
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
  tokens?: number;
  /** When the thinking started, while it is still running. */
  startedAt?: number;
  /** How long it took, once it is over. */
  durationMs?: number;
  /** The bubble is still being written: the thinking may not be over. */
  streaming: boolean;
  /** Server-owned pref: start expanded instead of folded. */
  expandReasoning?: boolean;
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

  if (!hasBody && !count) return null;

  // Running only while the bubble is still open and nothing has sealed the span: a thread
  // rehydrated from server history carries neither field, and must not start a counter from an
  // instant it does not have.
  const running = streaming && durationMs === undefined && startedAt !== undefined;
  const elapsed = running ? (
    <ThinkingElapsed since={startedAt} />
  ) : durationMs !== undefined ? (
    <Text style={styles.elapsed}>{formatSpan(durationMs)}</Text>
  ) : null;

  if (!hasBody) {
    return (
      <View style={styles.line}>
        {/*
          One name in every state, like the aside below: the running counter is what says the
          thinking is still going, and the word does not have to move to say it. It used to read
          "Thinking... N tokens" live and "Thought - N tokens" once sealed, which renamed a thing
          the reader was looking at instead of letting it hold still.
        */}
        <Text style={styles.label}>{`Reasoning · ${count} tokens`}</Text>
        {elapsed}
      </View>
    );
  }

  return (
    <CollapsibleAside
      label="Reasoning"
      trailing={elapsed}
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
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.3 },
  /** One step fainter than the label it follows: a duration is context on an aside, not a second
   *  label competing with it. */
  elapsed: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, opacity: 0.75 },
});
