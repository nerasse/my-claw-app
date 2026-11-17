import { OpenInNewIcon } from '../components/icons';
import React, { useState, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import type { SpawnStatus } from '../core/protocol';
import { BlockActions } from './BlockActions';
import { ScrollableBlock } from './ScrollableBlock';
import { requestToolOutput } from '../core/toolOutput';
import { ROW_GAP, spine } from './spine';
import { withoutEndpoint } from '../core/model';
import { font, scaleFont, space, type Palette, useThemedStyles } from '../theme';

/**
 * A `spawn`, `send` or `delegate_browser_task` call: not a tool result to read, a sub-agent to go
 * and see -- and, since the launch stopped blocking, a line that says one thing: it started.
 *
 * It used to draw the child's life: a spinner while it worked, a clock climbing beside it, then
 * "failed" or "stopped" when the child settled, because the call itself stayed open for the whole
 * run and its `ok` was the child's fate. Now the call answers at once and the child works on its
 * own, so all of that became a lie about a call that had already finished -- and a loading state in
 * a thread where nothing is loading. The card says `started` (or `sent`), fixed forever, and the
 * child's outcome is its return's business (`SubAgentReturn`), which is a different card at a
 * different moment.
 *
 * The head is still the door to the sub-agent, reachable while the card is folded, and the body
 * still holds what a launch has to say: the task it was given and what the call answered with.
 */
/** The site of a browser task. By hand, not `new URL`: RN's URL is a partial polyfill (see `httpOrigin`). */
function hostOf(url: unknown): string {
  if (typeof url !== 'string') return '';
  const match = /^https?:\/\/([^/?#:]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * What the row says for good, once the call is over.
 *
 * Three words and no state machine: a launch either started (or sent, for a `send`) or it was
 * refused. The child's own fate is deliberately absent -- it belongs to the return card, and
 * reading it here as well drew the same failure twice at two moments.
 */
function launchWord(
  item: ToolItem,
  action: 'spawn' | 'send' | 'browser',
  settled: boolean,
): { word: string; bad: boolean } {
  // The call is still open, and that is the one case with no word: a launch answers in
  // milliseconds, and a `wait: true` stays open by design until its child is done. Neither gets a
  // spinner -- a launch is not a loading state.
  //
  // `settled` closes it when the call's own frame never comes. A run can die under a launch:
  // `interruptInFlightTools` leaves sub-agent cards to their own state machine, so the card stayed
  // `running` with the placeholder `ok: false` that `startToolCall` writes, and read as a refusal.
  // The child's lifecycle is the second sign the launch was accepted, and it is enough: the
  // launch did start, and the run ending under it is the run's own story (`RunFoot`).
  if (item.running === true) return settled ? { word: action === 'send' ? 'sent' : 'started', bad: false } : { word: '', bad: false };
  if (item.ok === false) return { word: 'refused', bad: true };
  if (item.interrupted === true) return { word: 'stopped', bad: false };
  return { word: action === 'send' ? 'sent' : 'started', bad: false };
}

export const SubAgentCard = React.memo(function SubAgentCardView({
  item,
  threadId,
  subagent,
  spawn,
  onOpen,
}: {
  item: ToolItem;
  /** The conversation the card belongs to: what a full-result request has to name. */
  threadId?: string;
  /**
   * Set when this card's sub-agent still exists; without it there is nowhere to go. `model` is what
   * the agent runs -- the live one when `modelLive`, its pin otherwise.
   */
  subagent?: { label: string; status: 'idle' | 'running'; model?: string; modelLive?: boolean };
  /** The child's lifecycle, read only for its name: its status no longer dresses this card. */
  spawn?: { subagentId: string; displayName: string; status: SpawnStatus };
  onOpen?: (toolItemId: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  const action = item.name === 'send' ? 'send' : item.name === 'delegate_browser_task' ? 'browser' : 'spawn';
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
  const brief = [item.args.task, item.args.message, item.args.instructions].find(value => typeof value === 'string') as
    | string
    | undefined;

  /**
   * What the row says after the name: the agent's own shape (or, for a browser task, the browser and
   * the site). The brief is *not* part of it -- it has its own line under the name, because a long
   * task standing in for the head left the card reading as an anonymous command.
   */
  const what = kind.replace(/\s+/g, ' ').trim();
  /**
   * What the agent is calling, when the roster says: the card is where the owner watches an agent
   * work, and a run that walked its route on a wall is on another account than the one it started
   * on. Marked in accent when it is not the pin -- the row then names the model answering now.
   */
  const model = subagent?.model ? withoutEndpoint(subagent.model) : undefined;
  // The child's lifecycle is how the card knows the launch landed even when its own result frame
  // never arrives: any terminal state means the call was accepted.
  const settled = spawn !== undefined && spawn.status !== 'running';
  const { word, bad } = launchWord(item, action, settled || item.durationMs !== undefined);

  // A launch's answer is exactly the kind of output that gets clipped (the child's id line, or the
  // refusal). Asked for in full only once somebody unfolds the card.
  useEffect(() => {
    if (open && item.truncated && threadId) requestToolOutput(threadId, item.id);
  }, [open, item.truncated, item.id, threadId]);

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Pressable
          style={styles.identity}
          onPress={() => setOpen(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Sub-agent ${label || id || action}, ${word}`}
          accessibilityHint={open ? 'Collapse details' : 'Show the task and the result'}>
          {/* Who, first and always: an agent with no name still reads as an agent (`spawn`), and
              the brief never takes the line, so a named call can never look like an anonymous
              one (owner, 2026-11-08: "on dirait pas un sous agent"). No fold mark: a row of the
              run's column is marked by its dot and the group's bar owns the fold, so the name is
              the toggle, exactly like a tool's row. */}
          <Text style={styles.name} numberOfLines={1}>
            {label || id || action}
          </Text>
          {/* The door, right after the name it opens: it belongs to the agent, not to the row's
              trailing figures, and put there it never moves the word that ends the line. Outside
              the toggle's own press target, so a screen reader announces it as the one control it
              is and it cannot steal the toggle's touch. */}
          {subagent && onOpen ? (
            <Pressable
              style={styles.door}
              onPress={() => onOpen(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open sub-agent ${subagent.label}, ${subagent.status}`}
              hitSlop={8}>
              <OpenInNewIcon size={13} tone="link" />
            </Pressable>
          ) : null}
          {what ? (
            <Text style={styles.kind} numberOfLines={1}>
              {what}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          {model ? (
            <Text style={[styles.model, subagent?.modelLive ? styles.modelLive : null]} numberOfLines={1}>
              {model}
            </Text>
          ) : null}
          {/* The launch, in one word, for good. No spinner and no clock: the call is over the
              moment it lands, and a child working somewhere is not this row's state. */}
          {word ? (
            <Text style={[styles.state, bad ? styles.stateBad : null]} numberOfLines={1}>
              {word}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {/* What it was asked, under the name it was given: the one line that says this is a job
          handed to an agent, not a command the run ran. Cut here, read in full once unfolded. */}
      {brief && !open ? (
        <Text style={styles.briefLine} numberOfLines={1}>
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
              <ScrollableBlock title={`${action} ${action === 'send' ? 'message' : 'task'}`} style={styles.codeFlat}>
                <Text style={styles.codeText}>{brief}</Text>
              </ScrollableBlock>
            </>
          ) : null}
          <View style={styles.blockHead}>
            <Text style={styles.label}>answer{item.truncated ? ' · truncated' : ''}</Text>
            <BlockActions title={`${label || action} launch`} value={item.output} />
          </View>
          <ScrollableBlock title={`${label || action} launch`} style={styles.codeFlat}>
            <Text style={styles.codeText}>{item.output.trim() || '(empty)'}</Text>
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
   *
   * The pull-back is the group's own (`spine().inset`): a mark centred on the rail begins a few
   * points inside the prose column, so a row that only indents by the gutter starts those same
   * points to the right of the bar and the cards above it. Measured on the screen, not guessed.
   */
  row: {
    alignSelf: 'stretch' as const,
    marginLeft: -spine(scale).inset,
    paddingLeft: spine(scale).gutter,
    // The thread's right gutter, the one a tool's duration and a run's empreinte stop short of:
    // without it these two words ended 8 pt right of every figure in the column.
    paddingRight: 8,
    // A block, not a line: the thread's own rhythm above and below it -- the same 6 a tool card
    // takes, because this is a card's worth of content (a name, a type, a job), not a line of the
    // column. At 2 under it the next row sat on the brief (owner, 2026-11-08).
    marginTop: space.xxs,
    marginBottom: space.sm,
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: ROW_GAP },
  identity: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: ROW_GAP },
  /** A name, in the body's own face: monospace is what a command wears, and a sub-agent is not one. */
  name: { fontSize: scaleFont(font.meta, scale), fontWeight: '700' as const, color: palette.text, flexShrink: 0 },
  /** Its line, under the name, on the name's own column: one line folded, whole once unfolded. */
  briefLine: {
    paddingLeft: 0,
    marginTop: space.xxs,
    fontSize: scaleFont(font.small, scale),
    color: palette.textMuted,
    lineHeight: Math.round(15 * scale),
  },
  /** The brief: it takes the rest of the line and is cut there, never the figures after it. */
  kind: { flex: 1, fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  spacer: { flex: 1 },
  /** The model a running agent calls: a reading, so it never wraps and never takes the name's room. */
  model: { flexShrink: 1, minWidth: 0, fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  modelLive: { color: palette.accent },
  /** A word, not a verdict: grey says the launch happened, danger says it did not. */
  state: { flexShrink: 0, fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  stateBad: { color: palette.danger },
  /**
   * The way in: an icon beside the name it opens, inside the head row, not a line of its own and
   * not a slot at the end -- there it moved the word that closes the line off the column every
   * duration above it stops on.
   */
  door: { paddingHorizontal: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { gap: 3, paddingBottom: space.xxs, paddingLeft: 0 },
  label: {
    fontSize: scaleFont(font.micro, scale),
    color: palette.textMeta,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
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
  codeFlat: { paddingLeft: 0, paddingVertical: 2 },
});
