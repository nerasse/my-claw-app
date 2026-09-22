import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ChatItem, RunInfo, RunSummaryItem } from '../core/chat';
import { RunFoot } from './RunFoot';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * What the header says, from counts alone: it must read the same whether the work is here or not.
 *
 * A burst between two messages is usually a run of tool calls, and sometimes only a thought the
 * model had before writing the next one -- "run" said nothing about those, and "N thoughts" names
 * exactly what opening it shows (the reasoning lines of the phases it hides).
 */
function headline(toolCount: number, firstTool: string | undefined, thoughts: number): string {
  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} tool call${toolCount === 1 ? '' : 's'}`);
    if (firstTool) parts.push(firstTool);
  } else if (thoughts > 0) {
    parts.push(`${thoughts} thought${thoughts === 1 ? '' : 's'}`);
  }
  // No duration, ever: the header describes the fold, and a run's span in it read as the fold's
  // own time ("on a l'impression que c'est le temps du dernier regroupement", 2026-09-22). The
  // run signs itself, at its end -- `RunFoot`.
  return parts.length > 0 ? parts.join(' · ') : 'run';
}

/**
 * Past this many children, an open group also gets a bar at its bottom.
 *
 * A run is easily three hundred cards: with the only control at the top, closing one means
 * scrolling all the way back up through the work you just finished reading, which is the one
 * thing the fold exists to avoid. Below the threshold the body is about a screen, the header is
 * still in reach, and a second bar would just be chrome.
 */
const FOOTER_FROM_ITEMS = 5;

/**
 * A finished run, folded under one header -- docs/run-grouping.md.
 *
 * The header is the whole row when collapsed: the tool cards, thinking phases and interim prose
 * between the question and the answer only render once the reader opens it. Closed by default,
 * every time (a reopened thread starts with every group folded).
 *
 * The open state is **not** held here. It belongs to the screen, keyed by run id, because this
 * row is remounted under the reader's fingers: a folded group whose work arrives is replaced by
 * a group of real items (docs/run-hydration.md), and a `useState` here meant the group they just
 * opened snapped shut the moment its items landed.
 */
export const RunGroup = React.memo(function RunGroupView({
  items,
  open,
  foot,
  onToggle,
  renderItem,
}: {
  run: RunInfo;
  items: ChatItem[];
  open: boolean;
  /** The run's empreinte, when this is the row it signs under -- `markRunFeet`. */
  foot?: RunInfo;
  onToggle: () => void;
  /** Renders one child, with its own grouping and time flags, at its index in `items`. */
  renderItem: (item: ChatItem, index: number, children: ChatItem[]) => React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);

  const toolCount = items.reduce((n, item) => (item.kind === 'tool' ? n + 1 : n), 0);
  const firstTool = items.find(item => item.kind === 'tool')?.name;
  const summary = headline(toolCount, firstTool, items.length - toolCount);
  const toggle = (): void => onToggle();

  /**
   * A fold of one card hides nothing.
   *
   * The header exists to stand for work the reader has not asked to see, and a single tool call
   * between two messages is one card behind one bar: everything the bar says, the card says
   * itself. The owner asked for the card, twice (2026-09-21: "quand il n'y a qu'un seul tool
   * call, ne regroupe pas"). The row is still the group -- the run's span and the word it stopped
   * on have no other home -- so what it carried is drawn as a line under the card.
   */
  const only = items.length === 1 ? items[0] : undefined;
  if (only !== undefined && only.kind === 'tool') {
    return (
      <View style={styles.wrap}>
        <View key={only.id}>{renderItem(only, 0, items)}</View>
        {foot !== undefined ? <RunFoot run={foot} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Bar summary={summary} open={open} onPress={toggle} styles={styles} />
      {open ? (
        <View style={styles.body}>
          {items.map((item, index) => (
            <View key={item.id}>{renderItem(item, index, items)}</View>
          ))}
        </View>
      ) : null}
      {open && items.length >= FOOTER_FROM_ITEMS ? (
        <Bar summary={summary} open onPress={toggle} styles={styles} footer />
      ) : null}
      {/* Last: the run ends here, whatever this fold holds -- its signature comes after it. */}
      {foot !== undefined ? <RunFoot run={foot} /> : null}
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
  summaries,
  open,
  foot,
  onToggle,
  onOpen,
}: {
  run: RunInfo;
  summaries: RunSummaryItem[];
  open: boolean;
  /** The run's empreinte, when this is the row it signs under -- `markRunFeet`. */
  foot?: RunInfo;
  onToggle: () => void;
  /** Fires when the group is opened: the rows are replaced by their items when the answer lands. */
  onOpen: (summaries: RunSummaryItem[]) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);

  const toolCount = summaries.reduce((n, row) => n + row.toolCount, 0);
  const itemCount = summaries.reduce((n, row) => n + row.itemCount, 0);
  const firstTool = summaries.find(row => row.firstTool !== undefined)?.firstTool;
  const summary = headline(toolCount, firstTool, itemCount - toolCount);
  const failed = summaries.some(row => row.hydration === 'failed');

  /**
   * Being open is what fetches, not the press that opened it.
   *
   * The press was the only trigger, and a group can become open-without-work twice over: a
   * reconnect replaces the thread with a fresh page (`resume` asks for it, and a reset re-seeds
   * every row at `idle`), and the trim folds a hydrated group back to its row to give memory
   * back. Both keep the group open -- the reader never closed it -- and both leave rows nobody
   * will ever press again, so the body sat on a skeleton for good: ten empty bars in the middle
   * of a conversation, which is what an owner reads as a broken load.
   *
   * `requestRunItems` is idempotent on the row's own `hydration`, so re-running this on every
   * store change costs a comparison and asks exactly once per range.
   */
  React.useEffect(() => {
    if (open) onOpen(summaries);
  }, [open, summaries, onOpen]);

  return (
    <View style={styles.wrap}>
      <Bar
        summary={summary}
        open={open}
        // Only the fold state moves here: the effect above is what asks, so a group opened by a
        // press and a group reopened by a redraw cannot take two different paths.
        onPress={() => onToggle()}
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
      {foot !== undefined ? <RunFoot run={foot} /> : null}
    </View>
  );
});

/**
 * The group's control, drawn identically at its top and at its bottom.
 *
 * Same bar both ends on purpose: whichever one the reader reaches, it says what the group is and
 * closes it. Only the chevron differs, and it points the way the content is.
 */
function Bar({
  summary,
  open,
  onPress,
  styles,
  footer = false,
}: {
  summary: string;
  open: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  footer?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.header, footer && styles.footer]}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide the run work' : 'Show the run work'}
      accessibilityState={{ expanded: open }}>
      <Text style={styles.chevron}>{open ? (footer ? '▴' : '▾') : '▸'}</Text>
      <Text style={styles.summary} numberOfLines={1}>
        {summary}
      </Text>
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
  footer: { marginTop: space.xs },
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
    marginLeft: space.xs,
  },
  statusAborted: {
    fontSize: scaleFont(font.small, scale),
    color: palette.textFaint,
    fontWeight: '600' as const,
    marginLeft: space.xs,
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
