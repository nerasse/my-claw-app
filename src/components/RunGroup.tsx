import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ChatItem, RunInfo } from '../core/chat';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * A finished run, folded under one header -- docs/run-grouping.md.
 *
 * The header is the whole row when collapsed: the tool cards, thinking phases and interim prose
 * between the question and the answer only render once the reader opens it. Closed by default,
 * every time (a reopened thread starts with every group folded); the owner's tap is the only
 * thing that opens one, and the open state lives here so a re-render never loses it.
 */
export const RunGroup = React.memo(function RunGroupView({
  run,
  items,
  renderItem,
}: {
  run: RunInfo;
  items: ChatItem[];
  /** Renders one child, with its own grouping and time flags, at its index in `items`. */
  renderItem: (item: ChatItem, index: number, children: ChatItem[]) => React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  const toolCount = items.reduce((n, item) => (item.kind === 'tool' ? n + 1 : n), 0);
  const firstTool = items.find(item => item.kind === 'tool')?.name;
  const duration =
    run.endTs !== undefined && run.startTs !== undefined ? clock(run.endTs - run.startTs) : '';

  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} tool call${toolCount === 1 ? '' : 's'}`);
    if (firstTool) parts.push(firstTool);
  }
  if (duration) parts.push(duration);
  const summary = parts.length > 0 ? parts.join(' · ') : 'run';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen(current => !current)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide the run work' : 'Show the run work'}
        accessibilityState={{ expanded: open }}>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        {run.status === 'error' ? <Text style={styles.statusError}>error</Text> : null}
        {run.status === 'aborted' ? <Text style={styles.statusAborted}>aborted</Text> : null}
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {items.map((item, index) => (
            <View key={item.id}>{renderItem(item, index, items)}</View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  wrap: { width: '100%' as const, marginBottom: space.xs },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chevron: { fontSize: scaleFont(font.small, scale), color: palette.textFaint, marginRight: 6 },
  summary: {
    flex: 1,
    fontSize: scaleFont(font.small, scale),
    color: palette.textFaint,
  },
  statusError: {
    fontSize: scaleFont(font.small, scale),
    color: palette.danger,
    fontWeight: '600' as const,
  },
  statusAborted: {
    fontSize: scaleFont(font.small, scale),
    color: palette.textFaint,
    fontWeight: '600' as const,
  },
  body: { marginTop: space.xs },
});