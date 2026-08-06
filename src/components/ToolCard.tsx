import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { ToolItem } from '../core/chat';
import { formatDuration, summarizeArgs } from '../core/utils';
import { font, lineHeightFor, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * One executed tool, collapsed to a single dense line and expanded on tap to show the
 * arguments and the output the agent received.
 */
export function ToolCard({ item }: { item: ToolItem }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const duration = formatDuration(item.durationMs);
  const preview = summarizeArgs(item.args);

  return (
    <Pressable
      style={[styles.card, !item.ok && styles.cardError, open && styles.cardOpen]}
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

      {open ? (
        <View style={styles.body}>
          <Text style={styles.label}>arguments</Text>
          <Text selectable style={styles.code}>
            {JSON.stringify(item.args, null, 2)}
          </Text>
          <View style={styles.outputHead}>
            <Text style={styles.label}>output{item.truncated ? ' · truncated' : ''}</Text>
            <Text style={styles.copy} onPress={() => Clipboard.setString(item.output)} accessibilityRole="button">
              copy
            </Text>
          </View>
          <Text selectable style={styles.code}>
            {item.output.trim() || '(empty)'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

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
  copy: { fontSize: font.micro, color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
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
