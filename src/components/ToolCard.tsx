import { ChevronIcon } from '../components/icons';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import { BlockActions } from './BlockActions';
import { ScrollableBlock } from './ScrollableBlock';
import { formatSpan, summarizeArgs } from '../core/utils';
import { contentNeedsBlock, summarizeTool, toolContent } from '../core/toolSummary';
import { requestToolOutput } from '../core/toolOutput';
import { DiffView, diffCounts, splitDiff } from './DiffView';
import { font, lineHeightFor, radius, scaleFont, space, type Palette, useThemedStyles } from '../theme';
import { useElapsed } from './CommandElapsed';
import { runStateOf, stateWord } from '../core/toolState';
import { toolRows } from '../core/toolRows';

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
 * The head row's type size. 11.5 is the POC's: big enough that a monospace tool name is legible,
 * small enough that twenty folded cards stay a list rather than a wall.
 */
const HEAD_SIZE = 11.5;

export const ToolCard = React.memo(function ToolCardView({
  item,
  threadId,
  expandTools,
  dense = false,
}: {
  item: ToolItem;
  /** The conversation the card belongs to: what a full-output request has to name. */
  threadId?: string;
  /** Server-owned pref: when true the card stays expanded even after its run settles. */
  expandTools?: boolean;
  /**
   * Drawn as a line of a run's spine rather than as a card.
   *
   * No frame, no plate, no chevron on the left: the group owns the rail and the dot, and the row
   * is one line of that column. Opening it hangs its output under the line, on the page.
   */
  dense?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
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
  // Only once unfolded: a thread full of collapsed cards must not parse every output on every
  // streaming delta.
  // The argument whose value is the subject of the call (bash.command, write.content...): its own
  // block, unfolded, because folding it away is what made a written file invisible. See
  // core/toolSummary. Only computed on an open card.
  const content = useMemo(() => (open ? toolContent(item.name, item.args) : null), [open, item.name, item.args]);
  // The row already carries the subject of the call: printing it again under it was the duplicate
  // the owner flagged. A block still appears for an argument the row does not show, for a value
  // with newlines, and for anything too long to fit the line. See core/toolSummary.
  const showingContent = content !== null && contentNeedsBlock(item.name, content);
  const running = item.running === true;
  // The run ended before this call reported: a terminal state of its own, and not a failure. The
  // store froze the duration at the run's end, so the head draws that number like any settled
  // card instead of counting from `ts` against the current clock.
  const interrupted = !running && item.interrupted === true;
  const state = runStateOf({ running, ok: item.ok, interrupted: item.interrupted, truncated: item.truncated });
  const word = stateWord(state);
  // A tool output carrying a unified diff (apply_patch) renders as colour-coded lines instead of
  // a plain monospace block. splitDiff only runs while the card is expanded (a collapsed card has
  // nothing to paint).
  const split = useMemo(
    () => (open ? splitDiff(item.output) : null),
    [open, item.output],
  );
  const hasDiff = split !== null && split.diff.length > 0;
  const counts = hasDiff ? diffCounts(split.diff) : null;
  // `read` answers raw characters, and an `offset` starts the answer mid-file: numbering from 1
  // there would claim the excerpt's first line is the file's first line. No offset, real numbers.
  const numbered = item.name === 'read' && !Number(item.args?.offset ?? 0);
  // A list-shaped answer (ls, search, web_search) drawn as rows: the POC's second column form.
  // Parsed only on an open card, and only for the three tools that answer with one.
  const rows = useMemo(() => (open ? toolRows(item.name, item.output) : null), [open, item.name, item.output]);

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
  // A closed card forgets nothing: there is no second fold left to reset.

  return (
    <View style={[styles.card, open && styles.cardOpen]}>
      <Pressable
        onPress={() => {
          setOpen(value => !value);
          userTookControl.current = true;
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Tool ${item.name}${running ? ', running' : duration ? `, ${duration}` : ''}${word ? `, ${word}` : ''}`}
        accessibilityHint={open ? 'Collapse details' : 'Show arguments and output'}>
        <View style={[styles.head, dense && styles.headDense]}>
          {dense ? null : <ChevronIcon direction={open ? 'down' : 'right'} size={11} tone="faint" />}
          <Text style={[styles.rowText, styles.name]}>{item.name}</Text>
          {/* One line, every tool, folded. A shell command used to wrap under the head at three
              lines: the densest argument is the one worth the room, the argument went the other
              way, and the POC's rule ("closed, the card is 29 px whatever the tool") is what a
              column of twenty calls needs to stay a list. The command is one tap away. */}
          {/* The subject stays on the line when the card opens. The body no longer repeats it
              (core/toolSummary.contentNeedsBlock), so hiding it here would make the command of a
              bash call vanish at the very moment the reader asks what ran. */}
          {preview ? (
            <Text style={[styles.preview, summary.mono && styles.previewMono]} numberOfLines={1}>
              {preview}
            </Text>
          ) : (
            <View style={styles.spacer} />
          )}
          {!open && summary.extraArgs > 0 ? <ExtraArgs count={summary.extraArgs} /> : null}
          {word ? <Text style={[styles.state, state === 'failed' ? styles.stateBad : styles.stateWarn]}>{word}</Text> : null}
          {running ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {running ? <RunningFor since={item.ts} /> : duration ? <Text style={styles.duration}>{duration}</Text> : null}
          {dense && open ? <ChevronIcon direction="up" size={11} tone="faint" /> : null}
        </View>
      </Pressable>

      {open ? (
        <View style={[styles.body, dense && styles.bodyDense]}>
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
          {content && showingContent ? (
            <>
              <View style={styles.outputHead}>
                <Text style={styles.label}>{content.key}</Text>
                <BlockActions title={`${item.name} ${content.key}`} value={content.text} />
              </View>
              <ScrollableBlock title={`${item.name} ${content.key}`} style={dense ? styles.codeDense : styles.code}>
                <Text style={styles.codeText}>{content.text}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          <View style={styles.outputHead}>
            <Text style={styles.label}>
              {rows ? 'results' : hasDiff ? 'diff' : `output${item.truncated ? ' · truncated' : ''}`}
              {counts ? (
                <>
                  <Text style={styles.diffAdd}>{`  +${counts.added}`}</Text>
                  <Text style={styles.diffDel}>{` −${counts.removed}`}</Text>
                </>
              ) : null}
            </Text>
            <BlockActions title={`${item.name} output`} value={item.output} />
          </View>
          {/* A list is a table: `ls`, `search` and `web_search` answer with rows, and a row reads
              faster than a monospace block the eye has to align itself. Every other shape keeps
              the block -- the parser answers null for anything it does not recognise. */}
          {rows ? (
            <ScrollableBlock title={`${item.name} output`} style={styles.code}>
              {rows.map((row, index) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={styles.tableRowLeft} numberOfLines={1}>
                    {row.left}
                  </Text>
                  <View style={styles.tableRowMain}>
                    <Text style={[styles.tableRowText, row.mono && styles.codeText]} numberOfLines={1}>
                      {row.text}
                    </Text>
                    {row.sub ? (
                      <Text style={styles.tableRowSub} numberOfLines={2}>
                        {row.sub}
                      </Text>
                    ) : null}
                  </View>
                  {row.right ? <Text style={styles.tableRowRight}>{row.right}</Text> : null}
                </View>
              ))}
            </ScrollableBlock>
          ) : null}
          {/* The plate is drawn only when there is something in it: a `split` that parsed no hunk
              still exists as an object, and rendering around it put an empty grey block under every
              `output` label of every card. */}
          {!rows && split && split.diff.length > 0 ? (
            <ScrollableBlock title={`${item.name} output`} style={styles.code}>
              <DiffView parts={split} />
            </ScrollableBlock>
          ) : null}
          {!rows && !hasDiff && numbered ? (
            <ScrollableBlock title={`${item.name} output`} style={styles.code}>
              <NumberedText text={item.output} />
            </ScrollableBlock>
          ) : null}
          {!rows && !hasDiff && !numbered ? (
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
 * The file a `read` returned, with a gutter.
 *
 * One row per line rather than one text with the numbers glued on: the gutter then keeps its own
 * ink, and a line that wraps does not push the number below it out of its column.
 */
function NumberedText({ text }: { text: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const lines = text.replace(/\n$/, '').split('\n');
  const width = String(lines.length).length;
  return (
    <View>
      {lines.map((line, index) => (
        <View key={index} style={styles.numberedRow}>
          <Text style={styles.lineNumber}>{String(index + 1).padStart(width, ' ')}</Text>
          <Text style={styles.codeText}>{line || ' '}</Text>
        </View>
      ))}
    </View>
  );
}

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
  /**
   * A line of a run's spine: the group already draws the column and the dot, so the card's own
   * frame, fill and left chevron are exactly the chrome that made a burst read as a stack of
   * boxes inside a fold.
   */
  cardDense: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    marginBottom: 0,
    overflow: 'visible' as const,
  },
  card: {
    alignSelf: 'stretch' as const,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 6,
    overflow: 'hidden' as const,
  },
  // Same plate open or closed: the POC's card does not change dress when you unfold it, only
  // grows a body. A fill that appeared on open made the fold read as a mode change.
  cardOpen: {},
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    // The POC's own number, and the rule behind it: a folded card is 29 pt whatever the tool, so
    // twenty calls read as a list and not a staircase.
    height: Math.round(29 * scale),
    paddingHorizontal: 8,
  },
  // A spine row is 27, and its content starts where the head's 8 pt padding puts it -- the same
  // column as the name of every other row in the group.
  headDense: { height: Math.round(27 * scale) },
  /**
   * The head row is one line of type at one size. Four sizes in a 29 pt row (10 for the chevron,
   * 11 for the summary, 12 for the name, 12 for the duration) each carried their own leading, and
   * the name sat a pixel below the summary it annotates. 11.5 is the POC's own number.
   */
  rowText: { fontSize: scaleFont(HEAD_SIZE, scale), lineHeight: Math.round(HEAD_SIZE * 1.5 * scale) },
  name: { fontWeight: '500' as const, color: palette.text, fontFamily: 'monospace' },
  preview: { flex: 1, fontSize: scaleFont(11, scale), color: palette.textMuted },
  // A path, a command or a pattern: read in the prose face they look like a sentence that lost
  // its spaces.
  previewMono: { fontFamily: 'monospace' },
  spacer: { flex: 1 },
  extraArgs: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  duration: { fontSize: scaleFont(10.5, scale), color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
  state: { fontSize: scaleFont(font.micro, scale), fontWeight: '600' as const },
  // Two colours, three words: a failure is an error, a stop or a clip is not.
  stateBad: { color: palette.danger },
  stateWarn: { color: palette.warn },
  spinner: { transform: [{ scale: 0.8 }] },
  body: { paddingHorizontal: 8, paddingBottom: 8, gap: 6 },
  // The output hangs under the row on the page itself: no plate, no side padding, so it lands on
  // the row's own text column instead of inside a foreign sheet.
  bodyDense: { paddingHorizontal: 0, paddingBottom: 6 },
  codeDense: { backgroundColor: 'transparent', borderRadius: 0, paddingHorizontal: 0 },
  label: { fontSize: scaleFont(9.5, scale), fontWeight: '500' as const, color: palette.textMeta, letterSpacing: 0.57, textTransform: 'uppercase' as const },
  outputHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, justifyContent: 'space-between' as const, height: Math.round(18 * scale) },
  // The plate is the container's, the face is the text's. The POC draws one material for
  // everything machine -- no border, just the `code-bg` step, the same one the closed output of a
  // bash call used to wear with a frame around it.
  code: {
    backgroundColor: palette.codeBg,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  diffAdd: { color: palette.diffAdd },
  diffDel: { color: palette.diffDel },
  numberedRow: { flexDirection: 'row' as const, gap: space.sm },
  // The gutter never competes with the code it numbers.
  lineNumber: {
    fontFamily: 'monospace',
    fontSize: scaleFont(font.small, scale),
    lineHeight: lineHeightFor(scaleFont(font.small, scale)),
    color: palette.textFaint,
    textAlign: 'right' as const,
  },
  tableRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tableRowLeft: { fontFamily: 'monospace', fontSize: scaleFont(font.micro, scale), color: palette.textMeta, minWidth: 46 },
  tableRowMain: { flex: 1, minWidth: 0 },
  tableRowText: { fontSize: scaleFont(11.5, scale), color: palette.text },
  tableRowSub: { fontSize: scaleFont(font.micro, scale), color: palette.textMuted },
  tableRowRight: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
  codeText: {
    fontFamily: 'monospace',
    fontSize: scaleFont(font.small, scale),
    lineHeight: lineHeightFor(scaleFont(font.small, scale)),
    // `codeText`, not `text`: on a theme whose code plate is darker than the page (Flexoki,
    // AMOLED) the page ink has no contrast left to give.
    color: palette.codeText,
  },
});