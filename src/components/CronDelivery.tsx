import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextItem } from '../core/chat';
import { returnPreview } from '../core/subagentReturn';
import { AgentMarkdown } from './AgentMarkdown';
import { CalendarIcon } from './icons';
import { CardDoor } from './CardDoor';
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
 * A scheduled job reporting into the conversation: a delivery, not a message.
 *
 * The turn behind it is stored as `role: 'user'` -- the prompt needs a turn in that role for the
 * conversation's agent to have read the report -- and it used to be drawn as one: a full-width
 * bubble on the right, in the same place and the same shape as something the owner typed. A cron
 * report read as the owner speaking to himself (owner, 2026-11-15).
 *
 * So it is the sub-agent return's card, to the pixel: the job's name on the spine's gutter, its
 * cadence and what became of the run at the right, one line of preview while folded, and the
 * report itself one tap away. Same family, same metrics -- a reader should not have to learn a
 * third shape to recognise "something reported back" (`SubAgentReturn`).
 *
 * Folded by default: a delivery is context (`docs/cron.md`), and a morning job would otherwise
 * push a screenful of report between two turns of the conversation.
 */
export function CronDelivery({
  item,
  mediaBase,
  deviceInfo,
  onOpenAttachment,
  onOpenMedia,
  onOpenRun,
}: {
  item: TextItem;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /**
   * Opens the run that reported: its own thread, exactly like a launch card's door opens the agent
   * it started. Absent on a delivery written before the run was recorded on the card.
   */
  onOpenRun?: (threadId: string) => void;
  onOpenAttachment?: (
    kind: ViewerKind,
    target: { url: string; filename: string; sizeBytes?: number; kind?: FileKind },
  ) => void;
  onOpenMedia?: (items: MediaItem[], index: number) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const hasFiles = item.attachments.length > 0;
  const [open, setOpen] = useState(false);

  const label = item.from?.label ?? 'scheduled job';
  const cadence = item.from?.cadence ?? '';
  const runId = item.from?.runId;
  const failed = item.from?.status === 'error';
  const preview = returnPreview(item.text);
  const showText = !hasFiles || open;

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.head}
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}${cadence ? `, ${cadence}` : ''}, cron delivery`}
        accessibilityHint={open ? 'Collapse the report' : 'Show the report'}>
        {/* A scheduled job's own mark, before its name: a delivery reads as a job at a glance, in
            every state -- delivered or failed, the line still starts the same way
            (owner, 2026-11-19). */}
        <CalendarIcon size={13} tone="muted" />
        <Text style={styles.name} numberOfLines={1}>
          {label}
        </Text>
        {/* The door, right after the name it opens, in the launch card's own blue: the same
            gesture a sub-agent's card offers on the agent it started. Outside the toggle's press
            target, so a screen reader announces it as the one control it is. */}
        {runId && onOpenRun ? (
          <CardDoor label={`Open the run of ${label}`} onPress={() => onOpenRun(runId)} />
        ) : null}
        {cadence ? (
          <Text style={styles.cadence} numberOfLines={1}>
            {cadence}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        <Text style={[styles.state, failed ? styles.stateBad : null]} numberOfLines={1}>
          {failed ? 'failed' : 'delivered'}
        </Text>
      </Pressable>

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
          <View style={styles.foot}>
            {item.text.trim() ? <BlockActions title={`${label} report`} value={item.text} /> : null}
            <View style={styles.grow} />
            <Text style={styles.clock}>{dayAndTime(item.ts)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: {
    alignSelf: 'stretch' as const,
    marginLeft: -spine(scale).inset,
    paddingLeft: spine(scale).gutter,
    paddingRight: 8,
    marginTop: space.xxs,
    marginBottom: space.sm,
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: ROW_GAP },
  /** The job's name, in the card's own face: a name, not a message. */
  name: { fontSize: scaleFont(font.meta, scale), fontWeight: '700' as const, color: palette.text, flexShrink: 1 },
  /** How often it runs: the second fact, one step quieter than the name. */
  cadence: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta, flexShrink: 0 },
  spacer: { flex: 1 },
  state: { flexShrink: 0, fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
  stateBad: { color: palette.danger },
  preview: {
    marginTop: space.xxs,
    fontSize: scaleFont(font.small, scale),
    color: palette.textMuted,
  },
  files: { marginTop: space.xs },
  body: { marginTop: space.xs },
  empty: { fontSize: scaleFont(font.small, scale), color: palette.textMuted },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, marginTop: space.xs },
  grow: { flex: 1 },
  clock: { fontSize: scaleFont(font.micro, scale), color: palette.textMeta },
});
