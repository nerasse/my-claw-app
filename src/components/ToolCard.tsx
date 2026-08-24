import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import { BlockActions } from './BlockActions';
import { ScrollableBlock } from './ScrollableBlock';
import { formatDuration, summarizeArgs } from '../core/utils';
import { summarizeTool } from '../core/toolSummary';
import { requestToolOutput } from '../core/toolOutput';
import { DiffView, splitDiff } from './DiffView';
import { font, lineHeightFor, radius, space, useThemedStyles, type Palette } from '../theme';

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
  const duration = formatDuration(item.durationMs);
  // The identifying argument rather than whichever one the model serialized first: see
  // core/toolSummary. Recomputed only when the call itself changes, not on every delta of the
  // turn around it.
  const summary = useMemo(() => summarizeTool(item.name, item.args, summarizeArgs(item.args)), [item.name, item.args]);
  const preview = summary.detail;
  // Only once unfolded: a thread full of collapsed cards must not stringify every argument list
  // on every streaming delta.
  const args = open && argsOpen ? JSON.stringify(item.args, null, 2) : '';
  const running = item.running === true;
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
    <View style={[styles.card, !item.ok && !running && styles.cardError, open && styles.cardOpen]}>
      <Pressable
        onPress={() => {
          setOpen(value => !value);
          userTookControl.current = true;
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Tool ${item.name}${running ? ', running' : duration ? `, ${duration}` : ''}${!item.ok && !running ? ', failed' : ''}`}
        accessibilityHint={open ? 'Collapse details' : 'Show arguments and output'}>
        <View style={styles.head}>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <Text style={styles.name}>{item.name}</Text>
          {!open && preview ? (
            <Text style={[styles.preview, summary.mono && styles.previewMono]} numberOfLines={1}>
              {preview}
            </Text>
          ) : (
            <View style={styles.spacer} />
          )}
          {!item.ok && !running ? <Text style={styles.failed}>failed</Text> : null}
          {running ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {duration ? <Text style={styles.duration}>{duration}</Text> : null}
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {/* Neither block is selectable in place: a selection inside the chat list focuses its
              text view and Android scrolls the inverted thread to it. Both carry the buttons
              instead -- on the platforms that need them. See docs/text-selection.md. */}
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
            </View>
          </Pressable>
          {argsOpen ? (
            <>
              <View style={styles.argsActions}>
                <BlockActions title={`${item.name} arguments`} value={args} />
              </View>
              <ScrollableBlock title={`${item.name} arguments`} value={args} style={styles.code}>
                <Text style={styles.codeText}>{args}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          <View style={styles.outputHead}>
            <Text style={styles.label}>output{item.truncated ? ' · truncated' : ''}</Text>
            <BlockActions title={`${item.name} output`} value={item.output} />
          </View>
          {split ? (
            <ScrollableBlock title={`${item.name} output`} value={item.output}>
              <DiffView parts={split} />
            </ScrollableBlock>
          ) : null}
          {!hasDiff ? (
            <ScrollableBlock title={`${item.name} output`} value={item.output} style={styles.code}>
              <Text style={styles.codeText}>{item.output.trim() || '(empty)'}</Text>
            </ScrollableBlock>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const createStyles = (palette: Palette) => ({
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
  chevron: { fontSize: font.micro, color: palette.textFaint, width: 8 },
  name: { fontSize: font.meta, fontWeight: '600' as const, color: palette.text, fontFamily: 'monospace' },
  preview: { flex: 1, fontSize: font.small, color: palette.textMuted },
  // A path, a command or a pattern: read in the prose face they look like a sentence that lost
  // its spaces.
  previewMono: { fontFamily: 'monospace', fontSize: font.micro },
  spacer: { flex: 1 },
  duration: { fontSize: font.micro, color: palette.textFaint, fontVariant: ['tabular-nums' as const] },
  failed: { fontSize: font.micro, color: palette.danger, fontWeight: '600' as const },
  spinner: { marginLeft: space.xs, transform: [{ scale: 0.8 }] },
  body: { marginTop: space.sm, gap: 3, paddingBottom: 2 },
  label: { fontSize: font.micro, color: palette.textFaint, letterSpacing: 0.4, textTransform: 'uppercase' as const },
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
    fontSize: font.small,
    lineHeight: lineHeightFor(font.small),
    color: palette.text,
  },
});
