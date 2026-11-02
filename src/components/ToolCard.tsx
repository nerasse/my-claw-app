import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import { BlockActions } from './BlockActions';
import { ScrollableBlock } from './ScrollableBlock';
import { formatSpan, summarizeArgs } from '../core/utils';
import { summarizeTool, toolContent, labelArgs } from '../core/toolSummary';
import { requestToolOutput } from '../core/toolOutput';
import { DiffView, splitDiff } from './DiffView';
import { font, lineHeightFor, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';
import { useElapsed } from './CommandElapsed';

/**
 * One executed tool, collapsed to a single dense line and expanded on tap to show the
 * arguments and the output the agent received.
 *
 * `spawn` and `send` do not come through here: a sub-agent call is a door, not a result, and it
 * has its own card (SubAgentCard). ChatScreen routes on `isSubAgentTool`.
 *
 * The card is a View whose head is the pressable, not one big Pressable: the body carries
 * controls of its own, and a control inside a control is announced as one thing by a screen
 * reader and steals the toggle's touch.
 */
/**
 * How many lines a shell preview gets before the layout cuts it.
 *
 * Three, like codex (`STATUS_DETAILS_DEFAULT_MAX_LINES`); pi allows five. Three is the mobile
 * answer: a thread is a column of these, and five turns a dozen calls back into a wall.
 */
const PREVIEW_BLOCK_LINES = 3;

export const ToolCard = React.memo(function ToolCardView({
  item,
  threadId,
  expandTools,
}: {
  item: ToolItem;
  /** The conversation the card belongs to: what a full-output request has to name. */
  threadId?: string;
  /** Server-owned pref: when true the card stays expanded even after its run settles. */
  expandTools?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  // The arguments are a second fold inside the first. What the owner opens a card for is the
  // result; the call that produced it is context, and for an edit tool it is the whole patch
  // again as escaped JSON, pushing the readable diff off the screen. So: folded until asked.
  const [argsOpen, setArgsOpen] = useState(false);
  // Whether the current expansion came from the auto-open below rather than a tap: the settle
  // only folds back what it itself unfolded.
  const autoOpened = useRef(false);
  // A tap during the run gives the owner the hand: no more auto-open and no auto-fold until the
  // run settles, then the flag clears for the next run of the card.
  const userTookControl = useRef(false);
  const duration = item.durationMs !== undefined ? formatSpan(item.durationMs) : '';
  // The identifying argument rather than whichever one the model serialized first: see
  // core/toolSummary. Recomputed only when the call itself changes, not on every delta of the
  // turn around it.
  const summary = useMemo(() => summarizeTool(item.name, item.args, summarizeArgs(item.args)), [item.name, item.args]);
  const preview = summary.detail;
  // Only once unfolded: a thread full of collapsed cards must not stringify every argument list
  // on every streaming delta.
  // The argument whose value is the subject of the call (bash.command, write.content...): its own
  // block, unfolded, because folding it away is what made a written file invisible. See
  // core/toolSummary. Only computed on an open card.
  const content = useMemo(() => (open ? toolContent(item.name, item.args) : null), [open, item.name, item.args]);
  // Everything else, and nothing twice: the fold holds the arguments minus the content one, and
  // is dropped entirely when that leaves nothing to show.
  const rest = useMemo(() => (open ? labelArgs(item.name, item.args) : null), [open, item.name, item.args]);
  const args = open && argsOpen && rest ? JSON.stringify(rest, null, 2) : '';
  const running = item.running === true;
  // The run ended before this call reported: a terminal state of its own, and not a failure. The
  // store froze the duration at the run's end, so the head draws that number like any settled
  // card instead of counting from `ts` against the current clock.
  const interrupted = !running && item.interrupted === true;
  // A tool output carrying a unified diff (apply_patch) renders as colour-coded lines instead of
  // a plain monospace block. splitDiff only runs while the card is expanded (a collapsed card has
  // nothing to paint).
  const split = useMemo(
    () => (open ? splitDiff(item.output) : null),
    [open, item.output],
  );
  const hasDiff = split !== null && split.diff.length > 0;

  // Stream-expansion is owned by the server pref: with expandTools on, the card opens when the
  // tool starts and stays open (the result is on screen). With it off, the card is NEVER opened
  // automatically — not even while running — and only the owner's tap opens it, so a long run
  // leaves a wall of dense collapsed cards, exactly as configured.
  //
  // The grace period below only delays the fold of what auto-open unfolded (i.e. when the pref is
  // on), so a fast tool does not read as an open/close flash. It never opens anything on its own.
  const FOLD_GRACE_MS = 450;
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const streaming = running;
    if (expandTools && streaming) {
      if (foldTimer.current !== null) {
        clearTimeout(foldTimer.current);
        foldTimer.current = null;
      }
      // Watch the tool land live: open it unless the owner already decided otherwise.
      if (!open && !userTookControl.current) {
        setOpen(true);
        autoOpened.current = true;
      }
    } else if (autoOpened.current && !userTookControl.current) {
      // Settled, and this card's opening came from the auto-open: fold it back. The delay lets the
      // final output be visible for a beat before the card collapses. (With expandTools off nothing
      // was ever auto-opened, so autoOpened stays false and this branch is a no-op.)
      if (!expandTools) {
        // expandTools just turned off: fold immediately, no grace period to respect.
        setOpen(false);
        autoOpened.current = false;
        foldTimer.current = null;
      } else {
        if (foldTimer.current === null) {
          foldTimer.current = setTimeout(() => {
            foldTimer.current = null;
            if (!autoOpened.current || userTookControl.current) return;
            setOpen(false);
            autoOpened.current = false;
          }, FOLD_GRACE_MS);
        }
      }
    } else {
      // Nothing auto-opened: the owner's own state stands. Clear the run's takeover flag.
      userTookControl.current = false;
    }
  }, [expandTools, running, open]);
  // Clear the pending fold if the card unmounts (thread switch) so no setState lands on a dead
  // component.
  useEffect(() => {
    return () => {
      if (foldTimer.current !== null) clearTimeout(foldTimer.current);
    };
  }, []);
  // The card was pushed with its output clipped, and somebody is now reading it: ask for the
  // rest. Only on an open card -- a thread full of collapsed ones must cost nothing.
  useEffect(() => {
    if (open && item.truncated && threadId) requestToolOutput(threadId, item.id);
  }, [open, item.truncated, item.id, threadId]);
  // A closed card forgets that its arguments were unfolded: reopening it shows the output first,
  // the same way it did the first time.
  useEffect(() => {
    if (!open) setArgsOpen(false);
  }, [open]);

  return (
    <View style={[styles.card, !item.ok && !running && !interrupted && styles.cardError, open && styles.cardOpen]}>
      <Pressable
        onPress={() => {
          setOpen(value => !value);
          userTookControl.current = true;
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Tool ${item.name}${running ? ', running' : duration ? `, ${duration}` : ''}${interrupted ? ', interrupted' : !item.ok && !running ? ', failed' : ''}`}
        accessibilityHint={open ? 'Collapse details' : 'Show arguments and output'}>
        <View style={styles.head}>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <Text style={styles.name}>{item.name}</Text>
          {!open && preview && !summary.block ? (
            <Text style={[styles.preview, summary.mono && styles.previewMono]} numberOfLines={1}>
              {preview}
            </Text>
          ) : (
            <View style={styles.spacer} />
          )}
          {!open && summary.extraArgs > 0 ? <ExtraArgs count={summary.extraArgs} /> : null}
          {interrupted ? <Text style={styles.interrupted}>interrupted</Text> : null}
          {!item.ok && !running && !interrupted ? <Text style={styles.failed}>failed</Text> : null}
          {running ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {running ? <RunningFor since={item.ts} /> : duration ? <Text style={styles.duration}>{duration}</Text> : null}
        </View>
        {!open && preview && summary.block ? (
          <Text
            style={[styles.preview, styles.previewMono, styles.previewBlock]}
            numberOfLines={PREVIEW_BLOCK_LINES}>
            {preview}
          </Text>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {item.name === 'question' ? (
            <QuestionHistoryBody
              args={item.args}
              output={item.output}
              ok={item.ok !== false}
            />
          ) : null}
          {/* Neither block is selectable in place: a selection inside the chat list focuses its
              text view and Android scrolls the inverted thread to it. Both carry the buttons
              instead -- on the platforms that need them. See docs/text-selection.md. */}
          {content ? (
            <>
              <View style={styles.outputHead}>
                <Text style={styles.label}>{content.key}</Text>
                <BlockActions title={`${item.name} ${content.key}`} value={content.text} />
              </View>
              <ScrollableBlock title={`${item.name} ${content.key}`} style={styles.code}>
                <Text style={styles.codeText}>{content.text}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          {rest ? (
          <Pressable
            onPress={() => setArgsOpen(value => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: argsOpen }}
            accessibilityLabel={`Arguments of ${item.name}`}
            accessibilityHint={argsOpen ? 'Hide the arguments' : 'Show the arguments'}>
            <View style={styles.outputHead}>
              <Text style={styles.chevron}>{argsOpen ? '▾' : '▸'}</Text>
              <Text style={styles.label}>arguments</Text>
              {!argsOpen && preview ? (
                <Text style={styles.preview} numberOfLines={1}>
                  {preview}
                </Text>
              ) : (
                <View style={styles.spacer} />
              )}
              {!argsOpen && summary.extraArgs > 0 ? <ExtraArgs count={summary.extraArgs} /> : null}
            </View>
          </Pressable>
          ) : null}
          {argsOpen && rest ? (
            <>
              <View style={styles.argsActions}>
                <BlockActions title={`${item.name} arguments`} value={args} />
              </View>
              <ScrollableBlock title={`${item.name} arguments`} style={styles.code}>
                <Text style={styles.codeText}>{args}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          <View style={styles.outputHead}>
            <Text style={styles.label}>output{item.truncated ? ' · truncated' : ''}</Text>
            <BlockActions title={`${item.name} output`} value={item.output} />
          </View>
          {split ? (
            <ScrollableBlock title={`${item.name} output`}>
              <DiffView parts={split} />
            </ScrollableBlock>
          ) : null}
          {!hasDiff ? (
            <ScrollableBlock title={`${item.name} output`} style={styles.code}>
              <Text style={styles.codeText}>{item.output.trim() || (interrupted ? '(no result: the run ended)' : '(empty)')}</Text>
            </ScrollableBlock>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

/**
 * How many arguments the preview beside it is not showing.
 *
 * Its own node, and that is the fix: the preview is `flex: 1` with `numberOfLines={1}`, so it is
 * the row's only shrinking child and the pixel clip lands on it. A sibling is measured at its
 * natural width first, which is what keeps `+3` on screen whatever the preview costs. Appended to
 * the preview string instead, it was the first thing the row dropped. `docs/tool-preview.md`.
 */
function ExtraArgs({ count }: { count: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.extraArgs}>{`+${count}`}</Text>;
}

/**
 * The history face of a `question` card: the questions asked, with the answers that came back.
 *
 * The args carry the questions (header, question, options) and the output carries the answers
 * in opencode's format (`"Qt"="a, b"`). A reopened thread therefore reads as the exchange it
 * was: what was asked, what was picked, or that it was canceled. Folds into the same card
 * instead of a second one, because the settled tool entry is the single record of the ask.
 */
function QuestionHistoryBody({ args, output, ok }: { args: Record<string, unknown>; output: string; ok: boolean }) {
  const styles = useThemedStyles(createStyles);
  const questions = Array.isArray(args.questions) ? args.questions : [];
  const answered = ok && !/canceled/i.test(output);

  return (
    <View style={styles.qHistory}>
      {questions.length === 0 ? (
        <Text style={styles.qEmpty}>question asked</Text>
      ) : (
        questions.map((raw, index) => {
          const q = raw as { header?: unknown; question?: unknown; options?: unknown };
          return (
            <View key={index} style={styles.qRow}>
              <Text style={styles.qHeader}>{String(q.header ?? `Question ${index + 1}`)}</Text>
              <Text style={styles.qText}>{String(q.question ?? '')}</Text>
              {Array.isArray(q.options) && q.options.length > 0 ? (
                <Text style={styles.qOptions}>
                  {q.options.map((o) => String((o as { label?: unknown })?.label ?? '')).join(' · ')}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
      <Text style={answered ? styles.qAnswer : styles.qCanceled}>
        {answered ? output : 'User canceled the questions'}
      </Text>
    </View>
  );
}

/**
 * Seconds since the call started, where the duration will sit once it settles. Three minutes into
 * a build the spinner alone said nothing about whether it was three minutes or three seconds. Its
 * own component so the tick redraws this text and not the card.
 */
function RunningFor({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const elapsed = useElapsed(since);
  return <Text style={styles.duration}>{formatSpan(elapsed)}</Text>;
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  qHistory: { gap: space.sm, marginBottom: space.xs },
  qRow: { gap: 2 },
  qHeader: { fontSize: scaleFont(font.small, scale), fontWeight: '600' as const, color: palette.text },
  qText: { fontSize: scaleFont(font.body, scale), color: palette.text },
  qOptions: { fontSize: scaleFont(font.micro, scale), color: palette.textMuted },
  qAnswer: { fontSize: scaleFont(font.small, scale), color: palette.accent },
  qCanceled: { fontSize: scaleFont(font.small, scale), color: palette.danger },
  qEmpty: { fontSize: scaleFont(font.small, scale), color: palette.textMuted },
  card: {
    alignSelf: 'stretch' as const,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    marginBottom: space.sm,
  },
  cardOpen: { backgroundColor: palette.codeBg },
  cardError: { borderColor: palette.danger },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  chevron: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, width: 8 },
  name: { fontSize: scaleFont(font.meta, scale), fontWeight: '600' as const, color: palette.text, fontFamily: 'monospace' },
  preview: { flex: 1, fontSize: scaleFont(font.small, scale), color: palette.textMuted },
  // A path, a command or a pattern: read in the prose face they look like a sentence that lost
  // its spaces.
  previewMono: { fontFamily: 'monospace', fontSize: scaleFont(font.micro, scale) },
  // Wrapped under the head, not beside it: `numberOfLines` counts lines the layout produced at
  // the real width, so this is the one truncation that knows what it is cutting.
  previewBlock: { flex: 0, marginTop: 2, marginLeft: 8 + space.sm },
  spacer: { flex: 1 },
  extraArgs: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  duration: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
  failed: { fontSize: scaleFont(font.micro, scale), color: palette.danger, fontWeight: '600' as const },
  // Not `danger`: the call was cut off, which is not the same statement as a tool that ran and
  // came back with an error.
  interrupted: { fontSize: scaleFont(font.micro, scale), color: palette.warn, fontWeight: '600' as const },
  spinner: { marginLeft: space.xs, transform: [{ scale: 0.8 }] },
  body: { marginTop: space.sm, gap: 3, paddingBottom: 2 },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  outputHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, justifyContent: 'space-between' as const, marginTop: 2 },
  // Right-aligned under the fold's own row: the buttons belong to the block below them, and a
  // row that is empty on web (BlockActions renders nothing there) must not leave a gap.
  argsActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const },
  // The plate is the container's, the face is the text's: the block between them owns the
  // height, and a border drawn on the scrolling node would scroll away with the content.
  code: {
    backgroundColor: palette.bg,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: scaleFont(font.small, scale),
    lineHeight: lineHeightFor(scaleFont(font.small, scale)),
    color: palette.text,
  },
});