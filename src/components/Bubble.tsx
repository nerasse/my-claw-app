import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextItem } from '../core/chat';
import type { DeviceInfo } from '../core/device';
import { AgentMarkdown } from './AgentMarkdown';
import { AttachmentView } from './AttachmentView';
import { CollapsibleAside } from './CollapsibleAside';
import { CommandElapsed } from './CommandElapsed';
import { ReasoningLine } from './ReasoningLine';
import { LocationView } from './LocationView';
import { chatSelectable } from '../core/platform';
import { contextMenuProps, onAccentProps } from '../core/webProps';
import { font, lineBoxFor, lineHeightFor, radius, scaleFont, space, useChatFontScale, useThemedStyles, type Palette } from '../theme';

function clock(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * One message. Memoized, and its callbacks take the item rather than closing over it: a long
 * thread re-renders on every streaming delta, and a per-row closure rebuilt each time would make
 * the memo a no-op — every mounted bubble would re-parse its markdown for one changed character.
 */
export const Bubble = React.memo(function BubbleView({
  item,
  mediaBase,
  deviceInfo,
  grouped,
  showTime,
  onMenu,
  onOpenAttachment,
  onResend,
  expandReasoning,
}: {
  item: TextItem;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /** Same author as the previous item: tighten the gap instead of repeating a full margin. */
  grouped: boolean;
  showTime: boolean;
  onMenu: (item: TextItem) => void;
  /** The owner's message never got its receipt: send it again, same id. */
  onResend?: (item: TextItem) => void;
  onOpenAttachment?: (
    kind: 'image' | 'text' | 'video' | 'file',
    target: { url: string; filename: string; sizeBytes?: number },
  ) => void;
  /** Server-owned pref: reasoning blocks start expanded instead of folded. */
  expandReasoning?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const scale = useChatFontScale();
  const agent = item.role === 'agent';
  const bodySize = scaleFont(font.body, scale);
  // While the model is only thinking there is no text yet. The reasoning line already says so, so
  // the bare caret would be a second, redundant "working" indicator in the same bubble.
  const thinkingShown = Boolean(item.reasoning?.trim()) || (item.reasoningTokens ?? 0) > 0;
  // Where the attachments sit: the owner's message reads as legend under its own capture (what the
  // photo is, said after it), the agent's answer reads as a reply, then the file it produced. The
  // live `addAgentMessage` merges the media bubble the router sends after the streamed text into
  // the stream bubble, so this order is what a finished turn shows on screen.
  const attachmentsEl = item.attachments.map(att => (
    <AttachmentView
      key={att.id}
      att={att}
      mediaBase={mediaBase}
      deviceInfo={deviceInfo}
      onOpen={onOpenAttachment}
      // Each recording carries its own words; one blob under all of them would say the
      // wrong thing twice.
      transcript={item.transcripts?.[att.id]}
      onAccent={!agent}
    />
  ));
  const textEl = item.text ? (
    agent && !item.command && !item.notice ? (
      <AgentMarkdown text={item.streaming ? `${item.text}▍` : item.text} />
    ) : (
      <Text
        style={[
          styles.text,
          item.command ? styles.textCommand : item.notice ? styles.textNotice : styles.textUser,
          lineBoxFor(bodySize, item.text),
        ]}>
        {item.text}
        {/* A command the server is still running says how long it has been at it; a
            caret would only blink on text nobody is writing. */}
        {item.streaming ? item.command ? <CommandElapsed since={item.ts} /> : '▍' : ''}
      </Text>
    )
  ) : item.streaming && !thinkingShown ? (
    <Text style={[styles.text, agent ? null : styles.textUser, { lineHeight: lineHeightFor(bodySize) }]}>▍</Text>
  ) : null;
  // A user bubble is filled with the accent, which is also what a browser paints the selection
  // highlight in: unmarked, a drag over one's own message selects text that looks untouched.
  // webTheme.web.ts flips the pair on the marked subtree. Nothing on Android.
  const onAccent = agent ? {} : onAccentProps();
  return (
    <View style={[styles.row, agent ? styles.rowAgent : styles.rowUser, grouped ? styles.rowGrouped : null]}>
      <View style={[styles.stack, agent ? styles.stackAgent : styles.stackUser]}>
      {/* Long press opens the message menu, which is where copying and selecting live: the gesture
          would otherwise start a selection the platform cannot finish, and would throw the thread
          to the other end doing it. See docs/text-selection.md. Not where the platform selects
          text by itself, though -- in a browser the hold fires in the middle of the drag the
          reader is making to select, and steals it. A Pressable with no onPress lets every control
          inside it (links, attachments, the tool cards) keep its own touches. */}
      <Pressable
        onLongPress={chatSelectable ? undefined : () => onMenu(item)}
        {...contextMenuProps(() => onMenu(item))}
        {...onAccent}
        style={[
          styles.bubble,
          agent ? styles.bubbleAgent : styles.bubbleUser,
          // Command output is drawn apart: the agent did not write it, so it must not wear
          // the agent's clothes.
          item.command && styles.bubbleCommand,
          // A notice is the system speaking: the agent did not write it either.
          item.notice && styles.bubbleNotice,
        ]}
        // A Pressable is accessible by default, which would collapse the bubble into one node
        // and hide the reasoning line, the attachments and the tool cards from a screen reader.
        // The ⋯ button is the accessible way to the same menu.
        accessible={false}>
        {/* Above the answer, inside the same bubble: the reasoning belongs to the reply it
            produced, and during the thinking phase this line is the whole bubble. */}
        {agent && !item.command && !item.notice ? (
          <ReasoningLine
            id={item.id}
            reasoning={item.reasoning}
            tokens={item.reasoningTokens}
            startedAt={item.reasoningStartedAt}
            durationMs={item.reasoningMs}
            streaming={item.streaming}
            expandReasoning={expandReasoning}
          />
        ) : null}
        {item.location ? <LocationView location={item.location} onAccent={!agent} /> : null}
        {!agent ? attachmentsEl : null}
        {textEl}
        {agent ? attachmentsEl : null}

        {/* Below the outcome line, folded: what a command produced too much of to state inline
            (a compaction summary). Reading it is a choice, not a wall of text in the thread. */}
        {item.details ? (
          <CollapsibleAside
            label="Summary"
            body={item.details}
            showHint="Show what the compaction kept"
            hideHint="Hide the summary"
          />
        ) : null}

        {/* Held by the server: either a compaction is rewriting the history this message's run
            would resume (so nothing starts until it ends), or a run is already active and the
            message waits in its mailbox for the next turn boundary. Counted either way, because a
            still line during the wait reads as a message that never left. */}
        {/* The app is holding this one and retrying it on its own: the press is an offer to go now,
            not the only way out -- a message the owner had to rescue by hand read as one he had lost.
            While an attempt is in flight the bubble says so instead, below. */}
        {item.queuedSince && item.queuedReason === 'undelivered' && !item.pending && onResend ? (
          <Pressable
            onPress={() => onResend(item)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Send ${item.id} now`}>
            <Text style={[styles.queued, agent ? null : styles.queuedUser]}>
              {'not sent, trying again'}
              <CommandElapsed since={item.queuedSince} onAccent={!agent} />
              {' · tap to send'}
            </Text>
          </Pressable>
        ) : null}
        {item.queuedSince && item.queuedReason !== 'undelivered' ? (
          <Text style={[styles.queued, agent ? null : styles.queuedUser]}>
            {item.queuedReason === 'injection' ? 'queued for the next turn' : 'waiting for the compaction'}
            <CommandElapsed since={item.queuedSince} onAccent={!agent} />
          </Text>
        ) : null}

        {item.error && !agent && onResend ? (
          <Pressable
            onPress={() => onResend(item)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Send again">
            <Text style={styles.error}>{`${item.error} · tap to send again`}</Text>
          </Pressable>
        ) : item.error ? (
          <Text style={styles.error}>
            {item.error}
          </Text>
        ) : null}

        {/* Sent on a socket that called itself open; the receipt is what proves it arrived. */}
        {!agent && item.pending ? <Text style={styles.queuedUser}>sending…</Text> : null}

        {showTime ? <Text style={[styles.time, agent ? styles.timeAgent : styles.timeUser]}>{clock(item.ts)}</Text> : null}
      </Pressable>

      {/* The ⋯ row sits under the bubble on the side the author reads from: right for the agent,
          left for the owner. It no longer steals width from the message, so the bubble fills the
          column like a tool card. */}
      <View style={[styles.menuRow, agent ? styles.menuRowAgent : styles.menuRowUser]}>
        <Pressable
          hitSlop={12}
          style={styles.menu}
          onPress={() => onMenu(item)}
          accessibilityRole="button"
          accessibilityLabel="Message actions">
          <Text style={styles.menuGlyph}>⋯</Text>
        </Pressable>
      </View>
      </View>
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { width: '100%' as const, flexDirection: 'row' as const, marginBottom: space.xs },
  rowGrouped: { marginBottom: 1 },
  rowUser: { justifyContent: 'flex-end' as const },
  rowAgent: { justifyContent: 'flex-start' as const },
  // The bubble and its ⋯ row share one column: the bubble fills the width, the button sits
  // below it on its author's side instead of eating the message's margin.
  stack: { width: '100%' as const },
  stackAgent: { alignItems: 'flex-start' as const },
  stackUser: { alignItems: 'flex-end' as const },
  bubble: {
    width: '100%' as const,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bubbleUser: { backgroundColor: palette.accent, borderBottomRightRadius: radius.sm },
  bubbleAgent: { backgroundColor: palette.surfaceAlt, borderBottomLeftRadius: radius.sm },
  bubbleNotice: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  bubbleCommand: {
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  // The line box is stated at the call site: a message carrying an emoji must not pin it.
  text: { fontSize: scaleFont(font.body, scale), color: palette.text },
  textUser: { color: palette.accentText },
  // Command output keeps its line breaks: /status is a table, not prose.
  textCommand: { color: palette.text, fontFamily: 'monospace', fontSize: scaleFont(font.small, scale) },
  textNotice: { color: palette.text, fontSize: scaleFont(font.small, scale) },
  error: { fontSize: scaleFont(font.small, scale), color: palette.danger, marginTop: 2 },
  queued: { fontSize: scaleFont(font.small, scale), color: palette.textFaint, marginTop: 2 },
  queuedUser: { color: palette.accentText, opacity: 0.7 },
  time: { fontSize: scaleFont(font.micro, scale), alignSelf: 'flex-end' as const, marginTop: 1 },
  timeAgent: { color: palette.textFaint },
  timeUser: { color: palette.accentText, opacity: 0.7 },
  menuRow: { width: '100%' as const, flexDirection: 'row' as const, marginTop: 1 },
  menuRowAgent: { justifyContent: 'flex-end' as const },
  menuRowUser: { justifyContent: 'flex-start' as const },
  menu: { width: 24, height: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  menuGlyph: { fontSize: scaleFont(font.body, scale), lineHeight: scaleFont(font.body, scale) + 2, color: palette.textFaint },
});
