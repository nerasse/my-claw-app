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
import { font, lineBoxFor, lineHeightFor, radius, space, useThemedStyles, type Palette } from '../theme';

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
}: {
  item: TextItem;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /** Same author as the previous item: tighten the gap instead of repeating a full margin. */
  grouped: boolean;
  showTime: boolean;
  onMenu: (item: TextItem) => void;
  onOpenAttachment?: (
    kind: 'image' | 'text' | 'video' | 'file',
    target: { url: string; filename: string; sizeBytes?: number },
  ) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const agent = item.role === 'agent';
  // While the model is only thinking there is no text yet. The reasoning line already says so, so
  // the bare caret would be a second, redundant "working" indicator in the same bubble.
  const thinkingShown = Boolean(item.reasoning?.trim()) || (item.reasoningTokens ?? 0) > 0;
  return (
    <View style={[styles.row, agent ? styles.rowAgent : styles.rowUser, grouped ? styles.rowGrouped : null]}>
      <View
        style={[
          styles.bubble,
          agent ? styles.bubbleAgent : styles.bubbleUser,
          // Command output is drawn apart: the agent did not write it, so it must not wear
          // the agent's clothes.
          item.command && styles.bubbleCommand,
          // A notice is the system speaking: the agent did not write it either.
          item.notice && styles.bubbleNotice,
        ]}>
        {/* Above the answer, inside the same bubble: the reasoning belongs to the reply it
            produced, and during the thinking phase this line is the whole bubble. */}
        {agent && !item.command && !item.notice ? (
          <ReasoningLine reasoning={item.reasoning} tokens={item.reasoningTokens} streaming={item.streaming} />
        ) : null}
        {item.location ? <LocationView location={item.location} onAccent={!agent} /> : null}
        {item.attachments.map(att => (
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
        ))}
        {item.text ? (
          agent && !item.command && !item.notice ? (
            <AgentMarkdown text={item.streaming ? `${item.text}▍` : item.text} />
          ) : (
            <Text
              selectable
              style={[
                styles.text,
                item.command ? styles.textCommand : item.notice ? styles.textNotice : styles.textUser,
                lineBoxFor(font.body, item.text),
              ]}>
              {item.text}
              {/* A command the server is still running says how long it has been at it; a
                  caret would only blink on text nobody is writing. */}
              {item.streaming ? item.command ? <CommandElapsed since={item.ts} /> : '▍' : ''}
            </Text>
          )
        ) : item.streaming && !thinkingShown ? (
          <Text style={[styles.text, agent ? null : styles.textUser, { lineHeight: lineHeightFor(font.body) }]}>▍</Text>
        ) : null}

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

        {/* Held by the server: a compaction is rewriting the history this message's run would
            resume, so nothing starts until it ends. Counted, because a still line during a
            two-minute wait reads as a message that never left. */}
        {item.queuedSince ? (
          <Text style={[styles.queued, agent ? null : styles.queuedUser]}>
            waiting for the compaction
            <CommandElapsed since={item.queuedSince} onAccent={!agent} />
          </Text>
        ) : null}

        {item.error ? (
          <Text selectable style={styles.error}>
            {item.error}
          </Text>
        ) : null}

        {showTime ? <Text style={[styles.time, agent ? styles.timeAgent : styles.timeUser]}>{clock(item.ts)}</Text> : null}

        <Pressable
          hitSlop={12}
          style={[styles.menu, agent ? styles.menuAgent : styles.menuUser]}
          onPress={() => onMenu(item)}
          accessibilityRole="button"
          accessibilityLabel="Message actions">
          <Text style={styles.menuGlyph}>⋯</Text>
        </Pressable>
      </View>
    </View>
  );
});

const createStyles = (palette: Palette) => ({
  row: { width: '100%' as const, flexDirection: 'row' as const, marginBottom: space.md },
  rowGrouped: { marginBottom: space.xs },
  rowUser: { justifyContent: 'flex-end' as const },
  rowAgent: { justifyContent: 'flex-start' as const },
  bubble: {
    maxWidth: '88%' as const,
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  bubbleUser: { backgroundColor: palette.accent, borderBottomRightRadius: radius.sm },
  bubbleAgent: { backgroundColor: palette.surfaceAlt, borderBottomLeftRadius: radius.sm },
  bubbleNotice: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.danger,
    maxWidth: '95%' as const,
  },
  bubbleCommand: {
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.border,
    maxWidth: '95%' as const,
  },
  // The line box is stated at the call site: a message carrying an emoji must not pin it.
  text: { fontSize: font.body, color: palette.text },
  textUser: { color: palette.accentText },
  // Command output keeps its line breaks: /status is a table, not prose.
  textCommand: { color: palette.text, fontFamily: 'monospace', fontSize: font.small },
  textNotice: { color: palette.text, fontSize: font.small },
  error: { fontSize: font.small, color: palette.danger, marginTop: 2 },
  queued: { fontSize: font.small, color: palette.textFaint, marginTop: 2 },
  queuedUser: { color: palette.accentText, opacity: 0.7 },
  time: { fontSize: font.micro, alignSelf: 'flex-end' as const, marginTop: 1 },
  timeAgent: { color: palette.textFaint },
  timeUser: { color: palette.accentText, opacity: 0.7 },
  menu: { position: 'absolute' as const, bottom: -2, width: 24, height: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
  menuAgent: { right: -24 },
  menuUser: { left: -24 },
  menuGlyph: { fontSize: 16, lineHeight: 18, color: palette.textFaint },
});
