import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextItem } from '../core/chat';
import { returnPreview, returnWord } from '../core/subagentReturn';
import { AgentIcon, BrowserIcon } from './icons';
import { CardDoor } from './CardDoor';
import { AgentMarkdown } from './AgentMarkdown';
import { AttachmentList } from './AttachmentList';
import { BlockActions } from './BlockActions';
import { ROW_GAP, spine } from './spine';
import { dayAndTime } from '../core/clock';
import type { DeviceInfo } from '../core/device';
import type { FileKind } from '../core/fileKind';
import type { ViewerKind } from '../core/utils';
import type { MediaItem } from './MediaCarousel';
import { font, scaleFont, space, type Palette, useThemedStyles } from '../theme';

/**
 * A background sub-agent reporting back: the other half of a launch.
 *
 * The turn behind this is stored as `role: 'user'` -- the prompt needs a turn in that role to
 * answer a report -- and it used to be drawn as one: a full-width bubble on the thread's neutral
 * fill, in the same place and the same shape as something the owner typed, holding a wall of an
 * agent's prose. The owner read his own name onto words he never wrote (2026-11-13).
 *
 * It is a row, not a message, and it is deliberately the same row as a launch (`SubAgentCard`):
 * who reported, and the word for what became of it. Everything else -- the report itself, the
 * pictures a browser task brought back -- is one tap away, because a return is context about the
 * conversation (`docs/subagents.md`), not the conversation.
 *
 * A return with attachments starts unfolded: a screenshot nobody can see is not an attachment.
 */
export function SubAgentReturn({
  item,
  mediaBase,
  deviceInfo,
  onOpenAgent,
  mark = 'agent',
  onOpenAttachment,
  onOpenMedia,
}: {
  item: TextItem;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /**
   * The way back into the child's own chat, when it still has one.
   *
   * Absent when the roster no longer lists it: a door that opens nothing is worse than no door.
   * The same gesture, in the same blue, as the launch card that started it -- a report and its
   * launch are one thing read at two moments (owner, 2026-11-19: a stopped card offered no way in).
   */
  onOpenAgent?: () => void;
  /** Which agent reported: the browser wears the web's ring, everything else the suitcase. */
  mark?: 'agent' | 'browser';
  onOpenAttachment?: (
    kind: ViewerKind,
    target: { url: string; filename: string; sizeBytes?: number; kind?: FileKind },
  ) => void;
  onOpenMedia?: (items: MediaItem[], index: number) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const hasFiles = item.attachments.length > 0;
  const [open, setOpen] = useState(hasFiles);

  const label = item.from?.label ?? '';
  const word = returnWord(item.from?.status);
  const failed = item.from?.status === 'error';
  const preview = returnPreview(item.text);
  // The words are what folds. With files on the card, the text starts folded under them: the
  // screenshots are the report, and a paragraph above them pushes them off the fold.
  const showText = !hasFiles || open;

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.head}
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label || 'a sub-agent'}, ${word}`}
        accessibilityHint={open ? 'Collapse the report' : 'Show the report'}>
        {mark === 'browser' ? <BrowserIcon size={13} tone="muted" /> : <AgentIcon size={13} tone="muted" />}
        <Text style={styles.name} numberOfLines={1}>
          {label || 'sub-agent'}
        </Text>
        {/* The door, right after the name it opens, in the launch card's own blue. Outside the
            toggle's press target, so a screen reader announces it as the one control it is. */}
        {onOpenAgent ? <CardDoor label={`Open sub-agent ${label || 'sub-agent'}`} onPress={onOpenAgent} /> : null}
        <View style={styles.spacer} />
        <Text style={[styles.state, failed ? styles.stateBad : null]} numberOfLines={1}>
          {word}
        </Text>
      </Pressable>

      {/* One line of what came back, while the card is folded: enough to know whether this is
          worth opening, and nothing that reads as a message. */}
      {!open && preview ? (
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      ) : null}

      {hasFiles ? (
        <View style={styles.files}>
          <AttachmentList
            attachments={item.attachments}
            mediaBase={mediaBase}
            deviceInfo={deviceInfo}
            {...(onOpenAttachment ? { onOpen: onOpenAttachment } : {})}
            {...(onOpenMedia ? { onOpenMedia } : {})}
          />
        </View>
      ) : null}

      {open && showText ? (
        <View style={styles.body}>
          {item.text.trim() ? (
            <AgentMarkdown text={item.text} />
          ) : (
            <Text style={styles.empty}>nothing written</Text>
          )}
          {/* Under the report, in the same corner as every other block that opens: its two ways
              out, then the hour. */}
          <View style={styles.foot}>
            {item.text.trim() ? <BlockActions title={`${label || 'sub-agent'} report`} value={item.text} /> : null}
            <View style={styles.grow} />
            <Text style={styles.clock}>{dayAndTime(item.ts)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  /**
   * The launch card's own metrics, because the two are one thing read at two moments: a name on
   * the spine's gutter, a word at the right, nothing between them but air.
   */
  row: {
    alignSelf: 'stretch' as const,
    marginLeft: -spine(scale).inset,
    paddingLeft: spine(scale).gutter,
    // The thread's right gutter, the one a tool's duration and a run's empreinte stop short of:
    // without it these two words ended 8 pt right of every figure in the column.
    paddingRight: 8,
    marginTop: space.xxs,
    marginBottom: space.sm,
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: ROW_GAP },
  /** Who reported, in the launch card's own face: an agent has a name, a command has a typeface. */
  name: { fontSize: scaleFont(font.meta, scale), fontWeight: '700' as const, color: palette.text, flexShrink: 1 },
  spacer: { flex: 1 },
  state: { flexShrink: 0, fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  stateBad: { color: palette.danger },
  /** What it said, cut to one line: the card says whether to open it, not what it says. */
  preview: {
    marginTop: space.xxs,
    fontSize: scaleFont(font.small, scale),
    color: palette.textMuted,
    lineHeight: Math.round(15 * scale),
  },
  files: { marginTop: space.xs, gap: space.xs },
  /** No frame and no plate: a report is page content, like the work around it. */
  body: { marginTop: space.xxs },
  empty: { fontSize: scaleFont(font.small, scale), color: palette.textFaint, fontStyle: 'italic' as const },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, marginTop: 4 },
  grow: { flex: 1 },
  clock: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
});
