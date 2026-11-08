import { ChevronIcon, OpenInNewIcon } from '../components/icons';
import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import type { SpawnStatus } from '../core/protocol';
import { BlockActions } from './BlockActions';
import { ScrollableBlock } from './ScrollableBlock';
import { formatSpan } from '../core/utils';
import { useElapsed } from './CommandElapsed';
import { requestToolOutput } from '../core/toolOutput';
import { runStateOf, stateWord } from '../core/toolState';
import { ROW_GAP, ROW_SLOT, ROW_TEXT, spine } from './spine';
import { font, scaleFont, space, type Palette, useThemedStyles } from '../theme';

/**
 * A `spawn` or `send` call: not a tool result to read, a sub-agent to go and see.
 *
 * It used to render as an ordinary ToolCard, and the door to the sub-agent was the last node of
 * the expanded body. Reaching the one thing the card is for meant unfolding it, scrolling past
 * the serialized call and the whole result, and only then tapping. The door is in the head here,
 * reachable while the card is still folded, and the body holds what a sub-agent run actually has
 * to say: the task it was given and the answer it came back with.
 *
 * Memoized, and `onOpen` takes the card id rather than being closed over it: see Bubble.
 */
/** The site of a browser task. By hand, not `new URL`: RN's URL is a partial polyfill (see `httpOrigin`). */
function hostOf(url: unknown): string {
  if (typeof url !== 'string') return '';
  const match = /^https?:\/\/([^/?#:]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * Seconds since the call started, where the frozen duration will sit once it settles.
 *
 * A sub-agent can run for ten minutes; "● running" alone says nothing about whether it has been
 * going for ten seconds or ten minutes, and the card carries no other trace of time until the
 * result lands. Its own component so the tick redraws this text and not the card.
 */
function RunningFor({ since }: { since: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const elapsed = useElapsed(since);
  return <Text style={styles.duration}>{formatSpan(elapsed)}</Text>;
}

export const SubAgentCard = React.memo(function SubAgentCardView({
  item,
  threadId,
  subagent,
  spawn,
  onOpen,
  expandTools,
}: {
  item: ToolItem;
  /** The conversation the card belongs to: what a full-result request has to name. */
  threadId?: string;
  /** Set when this card's sub-agent still exists; without it there is nowhere to go. */
  subagent?: { label: string; status: 'idle' | 'running' };
  spawn?: { subagentId: string; displayName: string; status: SpawnStatus };
  onOpen?: (toolItemId: string) => void;
  expandTools?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const userTookControl = useRef(false);

  const running = item.running === true || spawn?.status === 'running';
  const action = item.name === 'send' ? 'send' : 'spawn';
  // What to call it, in order of trust: the lifecycle frame knows the real display name, the
  // arguments only know what the caller asked for, and a `send` carries an id instead.
  const label =
    spawn?.displayName ??
    subagent?.label ??
    (typeof item.args.name === 'string' ? item.args.name : '') ??
    '';
  const id = typeof item.args.id === 'string' ? item.args.id : '';
  // A delegated browser task names no agent and no mode: the browser is the agent, the site is
  // what tells one card from the next.
  const kind =
    item.name === 'delegate_browser_task'
      ? ['browser', hostOf(item.args.url)].filter(Boolean).join(' · ')
      : [typeof item.args.type === 'string' ? item.args.type : '', typeof item.args.mode === 'string' ? item.args.mode : '']
          .filter(Boolean)
          .join(' · ');
  // A spawn is given a task, a send a message, a browser its instructions. Same slot either way.
  const brief = [item.args.task, item.args.message, item.args.instructions].find(value => typeof value === 'string') as string | undefined;

  /**
   * What the row says after the name.
   *
   * A `spawn` names an agent and is identified by what it was asked. A browser task names none,
   * so it is identified by the site it is on; its instructions are the body's job.
   */
  const what = (item.name === 'delegate_browser_task' ? kind : brief ?? kind).replace(/\s+/g, ' ').trim();

  // Same rule as a tool card: with the pref off nothing ever opens on its own, and a tap survives
  // the settle. The head is self-sufficient, so an unopened card here costs the reader nothing.
  useEffect(() => {
    if (expandTools && running && !open && !userTookControl.current) setOpen(true);
    if (!running) userTookControl.current = false;
  }, [expandTools, running, open]);

  // A sub-agent's answer is exactly the kind of output that gets clipped. Asked for in full only
  // once somebody unfolds the card.
  useEffect(() => {
    if (open && item.truncated && threadId) requestToolOutput(threadId, item.id);
  }, [open, item.truncated, item.id, threadId]);

  // One vocabulary with the tool card (core/toolState): a sub-agent that failed and a tool that
  // failed say the same word, and neither says "aborted" while the other says "interrupted".
  const state = runStateOf({
    running,
    ok: spawn?.status === 'error' ? false : item.ok,
    aborted: spawn?.status === 'aborted' || spawn?.status === 'interrupted',
    truncated: item.truncated,
  });
  const word = stateWord(state);

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Pressable
          style={styles.identity}
          onPress={() => {
            setOpen(value => !value);
            userTookControl.current = true;
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Sub-agent ${label || id || action}${running ? ', running' : ''}`}
          accessibilityHint={open ? 'Collapse details' : 'Show the task and the result'}>
          <View style={styles.slot}>
            <ChevronIcon direction={open ? 'down' : 'right'} size={11} tone="faint" />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {label || id || action}
          </Text>
          {/* What the agent is doing, on the row: a sub-agent used to spend a whole second line on
              its brief, which made the one door of a run the tallest thing in the thread. */}
          {what ? (
            <Text style={styles.kind} numberOfLines={1}>
              {what}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          {running && item.durationMs === undefined ? <RunningFor since={item.ts} /> : null}
          {word ? (
            <Text style={[styles.state, state === 'failed' ? styles.stateBad : styles.stateWarn]}>{word}</Text>
          ) : null}
          {running ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {item.durationMs !== undefined ? <Text style={styles.duration}>{formatSpan(item.durationMs)}</Text> : null}
        </Pressable>

        {/* The door, outside the toggle: a control inside a control is announced as one thing by a
            screen reader and steals the other's touch. An icon on the row now instead of a second
            full-width line under it. */}
        {subagent && onOpen ? (
          <Pressable
            style={styles.door}
            onPress={() => onOpen(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open sub-agent ${subagent.label}, ${subagent.status}`}
            hitSlop={8}>
            <OpenInNewIcon size={13} tone="accent" />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={styles.body}>
          {brief ? (
            <>
              <View style={styles.blockHead}>
                <Text style={styles.label}>{action === 'send' ? 'message' : 'task'}</Text>
                <BlockActions title={`${action} ${action === 'send' ? 'message' : 'task'}`} value={brief} />
              </View>
              <ScrollableBlock title={`${action} ${action === 'send' ? 'message' : 'task'}`} style={styles.codeFlat}>
                <Text style={styles.codeText}>{brief}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          <View style={styles.blockHead}>
            <Text style={styles.label}>result{item.truncated ? ' · truncated' : ''}</Text>
            <BlockActions title={`${label || action} result`} value={item.output} />
          </View>
          <ScrollableBlock title={`${label || action} result`} style={styles.codeFlat}>
            <Text style={styles.codeText}>{item.output.trim() || (running ? '(still running)' : '(empty)')}</Text>
          </ScrollableBlock>
        </View>
      ) : null}
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  /**
   * A door is a line of the run, not a card of its own.
   *
   * It used to be a bordered card with a full-width door underneath, which made the one thing the
   * reader waits on the loudest object in a thread where everything else is a flat line. It takes
   * the spine's gutter and chevron slot instead, so its name lands on the same column as the work
   * around it.
   */
  row: {
    alignSelf: 'stretch' as const,
    paddingLeft: spine(scale).gutter,
    marginBottom: space.xxs,
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: ROW_GAP },
  slot: { width: ROW_SLOT, alignItems: 'center' as const },
  identity: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: ROW_GAP },
  name: { fontSize: scaleFont(font.meta, scale), fontWeight: '600' as const, color: palette.text, fontFamily: 'monospace', flexShrink: 1 },
  kind: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, flexShrink: 1 },
  spacer: { flex: 1 },
  duration: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
  state: { fontSize: scaleFont(font.micro, scale), fontWeight: '600' as const },
  stateBad: { color: palette.danger },
  stateWarn: { color: palette.warn },
  spinner: { transform: [{ scale: 0.8 }] },
  // The door carries the brief as its own label: one row that says both what was asked and that
  // there is somewhere to go, instead of a line of prose above a button repeating the name.
  /** The way in: an icon on the row, next to the chrono, not a line of its own. */
  door: { paddingHorizontal: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
  doorLabel: { flex: 1, fontSize: scaleFont(font.small, scale), color: palette.text },
  brief: { fontSize: scaleFont(font.small, scale), color: palette.textMuted, paddingHorizontal: space.xs },
  body: { gap: 3, paddingBottom: 2, paddingLeft: ROW_TEXT },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  blockHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    justifyContent: 'space-between' as const,
    marginTop: 2,
  },
  codeText: { fontSize: scaleFont(font.small, scale), color: palette.text },
  /**
   * No plate and no frame: the task and the answer are text on the page, hung under the row on the
   * name's column, exactly like a tool's output. A box inside a borderless thread is the chrome
   * that made these cards read as a different species.
   */
  codeFlat: { paddingLeft: ROW_TEXT, paddingVertical: 2 },
});
