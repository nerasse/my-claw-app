import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import { BlockActions } from './BlockActions';
import { formatDuration, summarizeArgs } from '../core/utils';
import { DiffView, splitDiff } from './DiffView';
import { font, lineHeightFor, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * One executed tool, collapsed to a single dense line and expanded on tap to show the
 * arguments and the output the agent received.
 *
 * The card is a View whose head is the pressable, not one big Pressable: the expanded body of a
 * `spawn` card carries a button of its own, and a control inside a control is announced as one
 * thing by a screen reader and steals the toggle's touch.
 *
 * Memoized, and `onOpenSubAgent` takes the card id rather than being closed over it: see Bubble.
 */
export const ToolCard = React.memo(function ToolCardView({
  item,
  subagent,
  spawn,
  onOpenSubAgent,
  expandTools,
}: {
  item: ToolItem;
  /** Set when this card spawned a named sub-agent that still exists; the door to it. */
  subagent?: { label: string; status: 'idle' | 'running' };
  /** Live sub-agent lifecycle state pushed by `chat.spawn.start/end`, when the server sent one. */
  spawn?: { subagentId: string; displayName: string; status: 'running' | 'complete' | 'error' | 'aborted' };
  onOpenSubAgent?: (toolItemId: string) => void;
  /** Server-owned pref: when true the card stays expanded even after its run settles. */
  expandTools?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  // Whether the current expansion came from the auto-open below rather than a tap: the settle
  // only folds back what it itself unfolded.
  const autoOpened = useRef(false);
  // A tap during the run gives the owner the hand: no more auto-open and no auto-fold until the
  // run settles, then the flag clears for the next run of the card.
  const userTookControl = useRef(false);
  const duration = formatDuration(item.durationMs);
  const preview = summarizeArgs(item.args);
  // Only once unfolded: a thread full of collapsed cards must not stringify every argument list
  // on every streaming delta.
  const args = open ? JSON.stringify(item.args, null, 2) : '';
  const running = item.running === true;
  const spawnRunning = spawn?.status === 'running';
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
    const streaming = running || spawnRunning;
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
  }, [expandTools, running, spawnRunning, open]);
  // Clear the pending fold if the card unmounts (thread switch) so no setState lands on a dead
  // component.
  useEffect(() => {
    return () => {
      if (foldTimer.current !== null) clearTimeout(foldTimer.current);
    };
  }, []);

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
            <Text style={styles.preview} numberOfLines={1}>
              {preview}
            </Text>
          ) : (
            <View style={styles.spacer} />
          )}
          {!item.ok && !running ? <Text style={styles.failed}>failed</Text> : null}
          {spawnRunning ? (
            <Text style={styles.runState}>● running sub-agent</Text>
          ) : null}
          {spawn?.status === 'complete' ? <Text style={styles.okState}>✓ done</Text> : null}
          {spawn?.status === 'error' ? <Text style={styles.failed}>error</Text> : null}
          {spawn?.status === 'aborted' ? <Text style={styles.aborted}>aborted</Text> : null}
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
              instead. See docs/text-selection.md. */}
          <View style={styles.outputHead}>
            <Text style={styles.label}>arguments</Text>
            <BlockActions title={`${item.name} arguments`} value={args} />
          </View>
          <Text style={styles.code}>{args}</Text>
          <View style={styles.outputHead}>
            <Text style={styles.label}>output{item.truncated ? ' · truncated' : ''}</Text>
            <BlockActions title={`${item.name} output`} value={item.output} />
          </View>
          {split ? <DiffView parts={split} /> : null}
          {!hasDiff ? (
            <Text style={styles.code}>{item.output.trim() || '(empty)'}</Text>
          ) : null}
          {subagent && onOpenSubAgent ? (
            <Pressable
              style={styles.door}
              onPress={() => onOpenSubAgent(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open sub-agent ${subagent.label}, ${subagent.status}`}>
              <Text style={styles.doorGlyph}>◈</Text>
              <Text style={styles.doorLabel} numberOfLines={1}>
                {`open ${subagent.label}`}
              </Text>
              <Text style={styles.doorState}>{subagent.status === 'running' ? '● running' : 'idle'}</Text>
              <Text style={styles.doorChevron}>›</Text>
            </Pressable>
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
  spacer: { flex: 1 },
  duration: { fontSize: font.micro, color: palette.textFaint, fontVariant: ['tabular-nums' as const] },
  failed: { fontSize: font.micro, color: palette.danger, fontWeight: '600' as const },
  okState: { fontSize: font.micro, color: palette.accent, fontWeight: '600' as const },
  aborted: { fontSize: font.micro, color: palette.textFaint, fontWeight: '600' as const },
  runState: { fontSize: font.micro, color: palette.accent, fontWeight: '600' as const },
  spinner: { marginLeft: space.xs, transform: [{ scale: 0.8 }] },
  body: { marginTop: space.sm, gap: 3, paddingBottom: 2 },
  label: { fontSize: font.micro, color: palette.textFaint, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  outputHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: 2 },
  door: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
  },
  doorGlyph: { fontSize: font.meta, color: palette.accent },
  doorLabel: { flex: 1, fontSize: font.small, color: palette.text, fontFamily: 'monospace' },
  doorState: { fontSize: font.micro, color: palette.textFaint },
  doorChevron: { fontSize: font.meta, color: palette.textFaint },
  code: {
    fontFamily: 'monospace',
    fontSize: font.small,
    lineHeight: lineHeightFor(font.small),
    color: palette.text,
    backgroundColor: palette.bg,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
});
