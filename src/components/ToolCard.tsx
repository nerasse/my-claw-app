import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ToolItem } from '../core/chat';
import { BlockActions } from './BlockActions';
import { formatDuration, summarizeArgs } from '../core/utils';
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
  onOpenSubAgent,
}: {
  item: ToolItem;
  /** Set when this card spawned a named sub-agent that still exists; the door to it. */
  subagent?: { label: string; status: 'idle' | 'running' };
  onOpenSubAgent?: (toolItemId: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const duration = formatDuration(item.durationMs);
  const preview = summarizeArgs(item.args);
  // Only once unfolded: a thread full of collapsed cards must not stringify every argument list
  // on every streaming delta.
  const args = open ? JSON.stringify(item.args, null, 2) : '';

  return (
    <View style={[styles.card, !item.ok && styles.cardError, open && styles.cardOpen]}>
      <Pressable
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Tool ${item.name}${duration ? `, ${duration}` : ''}${item.ok ? '' : ', failed'}`}
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
          {!item.ok ? <Text style={styles.failed}>failed</Text> : null}
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
          <Text style={styles.code}>{item.output.trim() || '(empty)'}</Text>
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
