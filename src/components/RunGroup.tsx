import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ChatItem, RunInfo, RunSummaryItem } from '../core/chat';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** What the header says, from counts alone: it must read the same whether the work is here or not. */
function headline(toolCount: number, firstTool: string | undefined, duration: string): string {
  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} tool call${toolCount === 1 ? '' : 's'}`);
    if (firstTool) parts.push(firstTool);
  }
  if (duration) parts.push(duration);
  return parts.length > 0 ? parts.join(' · ') : 'run';
}

function durationOf(run: RunInfo): string {
  return run.endTs !== undefined && run.startTs !== undefined ? clock(run.endTs - run.startTs) : '';
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
  const summary = headline(toolCount, firstTool, durationOf(run));

  return (
    <View style={styles.wrap}>
      <Header
        run={run}
        summary={summary}
        open={open}
        onPress={() => setOpen(current => !current)}
        styles={styles}
      />
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

/**
 * The same group, whose work never travelled -- docs/run-hydration.md.
 *
 * The server sent a header standing for the items instead of the items themselves, so this row
 * draws from counts and fetches on the first open. Everything else is deliberately identical: the
 * reader cannot tell a group that was held from one that was fetched, which is the whole point --
 * the saving has to be invisible.
 *
 * `summaries` is usually one. It is several when a page boundary cut the run and the rows were
 * merged back into one group, and then opening asks for every range at once.
 */
export const FoldedRunGroup = React.memo(function FoldedRunGroupView({
  run,
  summaries,
  onOpen,
}: {
  run: RunInfo;
  summaries: RunSummaryItem[];
  /** Fires on the first open only: the rows are replaced by their items when the answer lands. */
  onOpen: (summaries: RunSummaryItem[]) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  const toolCount = summaries.reduce((n, row) => n + row.toolCount, 0);
  const itemCount = summaries.reduce((n, row) => n + row.itemCount, 0);
  const firstTool = summaries.find(row => row.firstTool !== undefined)?.firstTool;
  const summary = headline(toolCount, firstTool, durationOf(run));
  const failed = summaries.some(row => row.hydration === 'failed');

  return (
    <View style={styles.wrap}>
      <Header
        run={run}
        summary={summary}
        open={open}
        onPress={() => {
          setOpen(current => !current);
          if (!open) onOpen(summaries);
        }}
        styles={styles}
      />
      {open ? (
        <View style={styles.body}>
          {failed ? (
            // The range is gone (a compaction dropped the turn, a rewind changed branch). Said
            // rather than left blank: an empty open group reads as a run that did nothing.
            <Text style={styles.unavailable}>work no longer available</Text>
          ) : (
            // A skeleton the size of what is coming, so the list does not jump when it lands.
            <View accessibilityLabel="Loading the run work">
              {Array.from({ length: Math.min(itemCount, 12) }, (_, index) => (
                <View key={index} style={styles.skeleton} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
});

function Header({
  run,
  summary,
  open,
  onPress,
  styles,
}: {
  run: RunInfo;
  summary: string;
  open: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
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
  );
}

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
  skeleton: {
    height: 14,
    marginBottom: 6,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  unavailable: {
    fontSize: scaleFont(font.small, scale),
    color: palette.textFaint,
    fontStyle: 'italic' as const,
    paddingHorizontal: 8,
  },
});
