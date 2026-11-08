import { CopyIcon, MoreIcon } from './icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RunInfo, TextItem } from '../core/chat';
import type { DeviceInfo } from '../core/device';
import type { FileKind } from '../core/fileKind';
import type { ViewerKind } from '../core/utils';
import { AgentMarkdown } from './AgentMarkdown';
import { AttachmentView } from './AttachmentView';
import { MediaCarousel, isCarouselMedia, mediaItemsOf, type MediaItem } from './MediaCarousel';
import { CollapsibleAside } from './CollapsibleAside';
import { CommandElapsed } from './CommandElapsed';
import { ReasoningLine, showsReasoningRow } from './ReasoningLine';
import { WaitLine, WAIT_REVEAL_MS, useRevealed } from './WaitLine';
import { RunFoot } from './RunFoot';
import { LocationView } from './LocationView';
import { chatSelectable } from '../core/platform';
import { contextMenuProps, onAccentProps } from '../core/webProps';
import { font, lineBoxFor, lineHeightFor, radius, scaleFont, space, useChatFontScale, useThemedStyles, type Palette } from '../theme';
import { spine } from './spine';
import { clockTime } from '../core/clock';



/**
 * A bubble waiting for its first word, with nothing at all to show yet.
 *
 * The only thing missing is the wait's own reveal, which is time. A row of a run's spine asks this
 * before drawing its dot: a streaming phase that has said nothing yet left a lone blue mark hanging
 * over the composer (owner, 2026-11-08).
 */
export function drawsNothingYet(item: TextItem): boolean {
  if (!item.streaming || item.waitingSince === undefined || item.text !== '') return false;
  if (item.attachments.length > 0 || item.location || item.error) return false;
  if (item.reasoningStartedAt !== undefined) return false;
  return !showsReasoningRow({
    reasoning: item.reasoning,
    reasoningChars: item.reasoningChars,
    tokens: item.reasoningTokens,
    waitMs: item.waitMs,
  });
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
  dense = false,
  showTime,
  foot,
  onMenu,
  onCopy,
  menuHasExtras,
  onOpenAttachment,
  onOpenMedia,
  onResend,
  expandReasoning,
  threadId,
}: {
  item: TextItem;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /** Same author as the previous item: tighten the gap instead of repeating a full margin. */
  grouped: boolean;
  /**
   * A child of a run's spine: the row is exactly as tall as a tool's, so the dot the group pins on
   * that height is centred on this thought's line too.
   */
  dense?: boolean;
  showTime: boolean;
  /**
   * The empreinte of the run this bubble closed: its span and its status, signed here because
   * this is where the run ended. Sits on the `⋯` row -- docs/run-grouping.md.
   */
  foot?: RunInfo;
  onMenu: (item: TextItem) => void;
  /**
   * Copy this message's words straight to the clipboard, no sheet in between. A browser has a
   * real selection of its own, so the menu's "Select text" was the only reason to open it and the
   * copy is what the reader wanted anyway (owner, 2026-11-07).
   */
  onCopy?: (item: TextItem) => void;
  /** The sheet holds something the copy button cannot do (handing a sub-agent's answer back). */
  menuHasExtras?: boolean;
  /** The owner's message never got its receipt: send it again, same id. */
  onResend?: (item: TextItem) => void;
  onOpenAttachment?: (
    kind: ViewerKind,
    target: { url: string; filename: string; sizeBytes?: number; kind?: FileKind },
  ) => void;
  /** A run of pictures opens as one gallery, at the index that was tapped. */
  onOpenMedia?: (items: MediaItem[], index: number) => void;
  /** Server-owned pref: reasoning blocks start expanded instead of folded. */
  expandReasoning?: boolean;
  /** The conversation it is in, for what the bubble asks the server on its own (its reasoning). */
  threadId?: string;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const scale = useChatFontScale();
  const agent = item.role === 'agent';
  const bodySize = scaleFont(font.body, scale);
  // While the model has nothing to write yet, the reasoning row already says so -- the bare caret
  // would be a second, redundant "working" indicator in the same bubble. The row's own predicate
  // decides, so a row drawn for a long wait alone takes the caret down with it.
  const thinkingShown = showsReasoningRow({
    reasoning: item.reasoning,
    reasoningChars: item.reasoningChars,
    tokens: item.reasoningTokens,
    waitMs: item.waitMs,
  });
  // A call opened this bubble and has produced nothing yet: the wait takes the caret's place --
  // a bare bar would say the same thing worse -- but only once it has lasted long enough to be
  // worth a line (a model that streams its thinking answers in about a second).
  const waiting = item.streaming && item.waitingSince !== undefined && !item.text && !thinkingShown;
  const revealed = useRevealed(waiting ? item.waitingSince : undefined, WAIT_REVEAL_MS);
  // Where the attachments sit: the owner's message reads as legend under its own capture (what the
  // photo is, said after it), the agent's answer reads as a reply, then the file it produced. The
  // live `addAgentMessage` merges the media bubble the router sends after the streamed text into
  // the stream bubble, so this order is what a finished turn shows on screen.
  const single = (att: (typeof item.attachments)[number]): React.JSX.Element => (
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
  );
  // Consecutive pictures become one carousel; everything else keeps its own row, in the order the
  // message carried it. A run is only grouped when every attachment of it can actually be drawn --
  // a picture with no bytes left is a chip, and a carousel with a hole in it would hide that.
  const attachmentsEl: React.JSX.Element[] = [];
  let run: typeof item.attachments = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const items = mediaItemsOf(run, mediaBase, deviceInfo);
    if (items.length > 1 && items.length === run.length) {
      attachmentsEl.push(
        <MediaCarousel
          key={`carousel-${run[0].id}`}
          items={items}
          onOpen={index => onOpenMedia?.(items, index)}
        />,
      );
    } else {
      for (const att of run) attachmentsEl.push(single(att));
    }
    run = [];
  };
  for (const att of item.attachments) {
    if (isCarouselMedia(att)) run.push(att);
    else {
      flush();
      attachmentsEl.push(single(att));
    }
  }
  flush();
  const textEl = item.text ? (
    item.command || item.notice ? (
      <Text
        style={[
          styles.text,
          item.command ? styles.textCommand : styles.textNotice,
          lineBoxFor(bodySize, item.text),
        ]}>
        {item.text}
        {/* A command the server is still running says how long it has been at it; a
            caret would only blink on text nobody is writing. */}
        {item.streaming ? item.command ? <CommandElapsed since={item.ts} /> : '▍' : ''}
      </Text>
    ) : (
      // Both sides of a conversation are markdown: the owner writes ``` and `code` as readily as
      // the answer does, and a turn replayed flat read as a different message than the one he
      // sent. The tone carries the bubble's own ink and plates; the caret is the agent's alone,
      // because the owner's turn is never written token by token.
      <AgentMarkdown text={agent && item.streaming ? `${item.text}▍` : item.text} tone={agent ? 'body' : 'user'} />
    )
  ) : waiting ? (
    revealed ? <WaitLine since={item.waitingSince!} /> : null
  ) : item.streaming && !thinkingShown ? (
    <Text style={[styles.text, agent ? null : styles.textUser, { lineHeight: lineHeightFor(bodySize) }]}>▍</Text>
  ) : null;
  // Under the threshold a waiting bubble has nothing to say, so it is not drawn at all: an empty
  // frame with its clock and its ⋯ is the "bubble that starts too early" the owner saw after the
  // caret was taken out of it (2026-10-04). It appears with its line, or with the first token.
  if (drawsNothingYet(item) && !revealed) return null;
  // A bubble that is nothing but a thought: the model said nothing under it, it only thought.
  // There is no message to sign, so its clock and its `⋯` ride the reasoning line's head row and
  // the action bar under the bubble goes away. Two rows for one thought left an empty strip that
  // read as a message which never arrived (owner, 2026-11-08).
  const thoughtOnly =
    agent &&
    !item.command &&
    !item.notice &&
    item.text.trim() === '' &&
    item.attachments.length === 0 &&
    !item.location &&
    !item.error &&
    !item.details &&
    foot === undefined &&
    thinkingShown;

  // Button and clock travel as one block. Split, they would land at opposite ends of a row the
  // signature also shares, and the stamp has to stay beside the control it follows.
  const stamp = (
    <View style={styles.stamp}>
      {onCopy ? (
        <Pressable
          hitSlop={12}
          style={styles.menu}
          onPress={() => onCopy(item)}
          accessibilityRole="button"
          accessibilityLabel="Copy message">
          <CopyIcon size={15} tone="faint" />
        </Pressable>
      ) : null}
      {/* The sheet keeps its button only where it still holds something else to offer: one
          control per intention, and copying has its own now. */}
      {!onCopy || menuHasExtras ? (
        <Pressable
          hitSlop={12}
          style={styles.menu}
          onPress={() => onMenu(item)}
          accessibilityRole="button"
          accessibilityLabel="Message actions">
          <MoreIcon size={16} tone="faint" />
        </Pressable>
      ) : null}
      {/* The stamp closes the line, right of the `...`: bottom-right is where a message signs
          itself, and opening a bubble with the clock made it read as a title (2026-11-04). */}
      {showTime && !item.command && !item.notice ? <Text style={styles.menuTime}>{clockTime(item.ts)}</Text> : null}
    </View>
  );

  // A browser paints the selection highlight in the accent. Unmarked, a drag over one's own
  // message would select text that looks untouched. webTheme.web.ts flips the pair on the marked
  // subtree, and the mark stays on the bubble: the primary button inside it is still accent-filled.
  // Nothing on Android.
  const onAccent = agent ? {} : onAccentProps();
  return (
    <View style={[styles.row, agent ? styles.rowAgent : styles.rowUser, grouped ? styles.rowGrouped : null, dense ? styles.rowDense : null]}>
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
        {/* The time is drawn in the action row under the bubble now, with the `...` it sits beside:
            opening an answer with a stamp made the clock read as a title, and the owner reads it as
            the message's signature instead (2026-11-04). */}
        {/* Above the answer, inside the same bubble: the reasoning belongs to the reply it
            produced, and during the thinking phase this line is the whole bubble.
            The hour is the bubble's own when it is a message -- it is drawn under it -- so the
            reasoning inside carries none: the same minute stamped twice read as a duplicate
            (owner, 2026-11-08). A bubble that is only a thought has no action row, so its hour
            rides the block it opens instead (`thoughtOnly`). */}
        {agent && !item.command && !item.notice ? (
          <ReasoningLine
            id={item.id}
            threadId={threadId}
            reasoning={item.reasoning}
            reasoningChars={item.reasoningChars}
            tokens={item.reasoningTokens}
            startedAt={item.reasoningStartedAt}
            durationMs={item.reasoningMs}
            waitMs={item.waitMs}
            streaming={item.streaming}
            expandReasoning={expandReasoning}
            {...(dense ? { headHeight: spine(scale).head } : {})}
            {...(thoughtOnly ? { at: item.ts } : {})}
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
            clockAt={item.ts}
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

      </Pressable>

      {/* The action row sits under the bubble, its marks on the right on both sides: the button and
          the clock close the message rather than open it, and a row starting at the far left left
          the `...` a screen away from the bubble it acts on. It no longer steals width from the
          message, so the bubble fills the column like a tool card. The run's empreinte rides the
          same line, at the end the marks do not take: it is a signature, and it must never read as
          a caption of the bubble above it. */}
      {thoughtOnly ? null : (
        <View style={[styles.menuRow, styles.menuRowEnd]}>
          {agent && foot !== undefined ? <RunFoot run={foot} /> : null}
          {stamp}
          {!agent && foot !== undefined ? <RunFoot run={foot} /> : null}
        </View>
      )}
      </View>
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { width: '100%' as const, flexDirection: 'row' as const, marginBottom: space.xs },
  rowGrouped: { marginBottom: 1 },
  /**
   * A line of a run's spine: as tall as a tool row, so the group's dot, pinned on that height, is
   * centred on the thought's own line instead of sitting four points under it.
   *
   * `minHeight`, never `height`: the same box holds the reasoning once it is unfolded, and a fixed
   * height made the opened text overflow its own row and draw straight over the calls below it.
   */
  rowDense: { marginBottom: 0 },
  rowUser: { justifyContent: 'flex-end' as const },
  rowAgent: { justifyContent: 'flex-start' as const },
  // The bubble and its ⋯ row share one column: the bubble fills the width, the button sits
  // below it on its author's side instead of eating the message's margin.
  stack: { width: '100%' as const },
  stackAgent: { alignItems: 'flex-start' as const },
  stackUser: { alignItems: 'flex-end' as const },
  bubble: {
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bubbleUser: {
    // The POC's two bounds, not one: the bubble shrinks to its text, and it stops at a
    // comfortable measure. Drawn full width, a message of three words left half a screen of
    // empty bubble to its right, which reads as padding rather than as a short message.
    alignSelf: 'flex-end' as const,
    maxWidth: '88%' as const,
    backgroundColor: palette.bubbleUserBg,
    borderBottomRightRadius: radius.sm,
    // A neutral bubble on a neutral thread has no edge without this hairline. The POC used a
    // color-mix, which React Native has no equivalent for; one hairline is not worth a fifth token.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  // No fill and no padding: the answer starts where every other row of the thread starts, and
  // a run of them reads as one column of prose. `bubbleNotice` and `bubbleCommand` keep a plate
  // of their own -- they are not the agent speaking.
  bubbleAgent: { width: '100%' as const, backgroundColor: 'transparent' as const, paddingHorizontal: 0, paddingVertical: 0 },
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
  textUser: { color: palette.bubbleUserText },
  // Command output keeps its line breaks: /status is a table, not prose.
  textCommand: { color: palette.text, fontFamily: 'monospace', fontSize: scaleFont(font.small, scale) },
  textNotice: { color: palette.text, fontSize: scaleFont(font.small, scale) },
  error: { fontSize: scaleFont(font.small, scale), color: palette.danger, marginTop: 2 },
  queued: { fontSize: scaleFont(font.small, scale), color: palette.textMeta, marginTop: 2 },
  queuedUser: { color: palette.bubbleUserText, opacity: 0.62 },
  // One alignment for every case. It used to follow the author, then space itself around the run's
  // empreinte under the owner's messages -- and an alignment that changes with the row's guest is
  // an alignment that will put a button somewhere unexpected the next time a guest joins.
  menuRow: { width: '100%' as const, flexDirection: 'row' as const, marginTop: 1 },
  menuRowEnd: { justifyContent: 'flex-end' as const },
  stamp: { flexDirection: 'row' as const, alignItems: 'center' as const },
  menu: { width: 24, height: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  // Left margin, not padding: the button keeps its 24px target and the stamp keeps its breath.
  menuTime: {
    fontSize: scaleFont(font.micro, scale),
    color: palette.textMeta,
    marginLeft: 6,
    fontVariant: ['tabular-nums' as const],
  },
});
