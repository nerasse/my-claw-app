import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import { BlockActions } from './BlockActions';
import { ScrollableBlock } from './ScrollableBlock';
import { formatDuration } from '../core/utils';
import { requestToolOutput } from '../core/toolOutput';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

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
  spawn?: { subagentId: string; displayName: string; status: 'running' | 'complete' | 'error' | 'aborted' };
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

  const state = running
    ? { text: '● running', style: styles.stateRunning }
    : spawn?.status === 'complete'
      ? { text: '✓ done', style: styles.stateOk }
      : spawn?.status === 'error' || item.ok === false
        ? { text: 'error', style: styles.stateBad }
        : spawn?.status === 'aborted'
          ? { text: 'aborted', style: styles.stateFaint }
          : null;

  return (
    <View style={[styles.card, running && styles.cardRunning, spawn?.status === 'error' && styles.cardError]}>
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
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {label || id || action}
          </Text>
          {kind ? (
            <Text style={styles.kind} numberOfLines={1}>
              {kind}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          {state ? <Text style={state.style}>{state.text}</Text> : null}
          {running ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {formatDuration(item.durationMs) ? <Text style={styles.duration}>{formatDuration(item.durationMs)}</Text> : null}
        </Pressable>
      </View>

      {/* The door, outside the fold and outside the toggle: a control inside a control is
          announced as one thing by a screen reader and steals the other's touch. */}
      {subagent && onOpen ? (
        <Pressable
          style={styles.door}
          onPress={() => onOpen(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open sub-agent ${subagent.label}, ${subagent.status}`}>
          <Text style={styles.doorLabel} numberOfLines={1}>
            {brief ? brief.replace(/\s+/g, ' ').trim() : `open ${subagent.label}`}
          </Text>
          <Text style={styles.doorChevron}>›</Text>
        </Pressable>
      ) : brief && !open ? (
        <Text style={styles.brief} numberOfLines={1}>
          {brief.replace(/\s+/g, ' ').trim()}
        </Text>
      ) : null}

      {open ? (
        <View style={styles.body}>
          {brief ? (
            <>
              <View style={styles.blockHead}>
                <Text style={styles.label}>{action === 'send' ? 'message' : 'task'}</Text>
                <BlockActions title={`${action} ${action === 'send' ? 'message' : 'task'}`} value={brief} />
              </View>
              <ScrollableBlock title={`${action} ${action === 'send' ? 'message' : 'task'}`} style={styles.code}>
                <Text style={styles.codeText}>{brief}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          <View style={styles.blockHead}>
            <Text style={styles.label}>result{item.truncated ? ' · truncated' : ''}</Text>
            <BlockActions title={`${label || action} result`} value={item.output} />
          </View>
          <ScrollableBlock title={`${label || action} result`} style={styles.code}>
            <Text style={styles.codeText}>{item.output.trim() || (running ? '(still running)' : '(empty)')}</Text>
          </ScrollableBlock>
        </View>
      ) : null}
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  card: {
    alignSelf: 'stretch' as const,
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    marginBottom: space.sm,
    gap: space.xs,
  },
  // A running sub-agent is the only card in a thread that is still being written elsewhere.
  cardRunning: { borderColor: palette.accent },
  cardError: { borderColor: palette.danger },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const },
  identity: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  chevron: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, width: 8 },
  name: { fontSize: scaleFont(font.meta, scale), fontWeight: '600' as const, color: palette.text, fontFamily: 'monospace', flexShrink: 1 },
  kind: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, flexShrink: 1 },
  spacer: { flex: 1 },
  duration: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, fontVariant: ['tabular-nums' as const] },
  stateRunning: { fontSize: scaleFont(font.micro, scale), color: palette.accent, fontWeight: '600' as const },
  stateOk: { fontSize: scaleFont(font.micro, scale), color: palette.accent, fontWeight: '600' as const },
  stateBad: { fontSize: scaleFont(font.micro, scale), color: palette.danger, fontWeight: '600' as const },
  stateFaint: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, fontWeight: '600' as const },
  spinner: { transform: [{ scale: 0.8 }] },
  // The door carries the brief as its own label: one row that says both what was asked and that
  // there is somewhere to go, instead of a line of prose above a button repeating the name.
  door: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  doorLabel: { flex: 1, fontSize: scaleFont(font.small, scale), color: palette.text },
  doorChevron: { fontSize: scaleFont(font.meta, scale), color: palette.accent },
  brief: { fontSize: scaleFont(font.small, scale), color: palette.textMuted, paddingHorizontal: space.xs },
  body: { gap: 3, paddingBottom: 2 },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  blockHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    justifyContent: 'space-between' as const,
    marginTop: 2,
  },
  codeText: { fontSize: scaleFont(font.small, scale), color: palette.text },
  code: {
    backgroundColor: palette.bg,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
});
