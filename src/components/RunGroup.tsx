import { ChevronIcon } from './icons';
import React from 'react';
import { ActivityIndicator, LayoutAnimation, Pressable, Text, View } from 'react-native';
import { formatSpan } from '../core/utils';
import { useElapsed } from './CommandElapsed';
import type { ChatItem, RunInfo, RunSummaryItem } from '../core/chat';
import { familyOf } from '../core/toolSummary';
import { spine } from './spine';
import { RunFoot } from './RunFoot';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * A finished run, folded under one header -- docs/run-grouping.md.
 *
 * The header is the whole row when collapsed: the tool rows, thinking phases and interim prose
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
  live = false,
  running = false,
  foot,
  onToggle,
  renderItem,
}: {
  /**
   * The run this segment belongs to. Named, never read: the header's clock is the *segment's* own
   * (its first call to its last), and the run's total is its foot's business -- `RunFoot`.
   */
  run?: RunInfo;
  items: ChatItem[];
  open: boolean;
  /**
   * This segment is the one the run is writing into: a spinner, a clock that climbs, and no fold.
   *
   * A segment a message cut is over, whatever the run is doing -- `markLiveSegments`.
   */
  live?: boolean;
  /**
   * The run this segment belongs to is still going.
   *
   * Then the group is drawn open and cannot be closed: you do not fold the work you are watching,
   * and a fold that appeared at the run's end made the whole block change shape under the
   * reader's eyes (owner, 2026-11-07). Every segment of a live run stays open for that reason;
   * only the one being written wears the clock.
   */
  running?: boolean;
  /** The run's empreinte, when this is the row it signs under -- `markRunFeet`. */
  foot?: RunInfo;
  onToggle: () => void;
  /**
   * Renders one child, with its own grouping and time flags, at its index in `items`.
   *
   * `dense` says the row is a line of the spine rather than a card: no frame, no plate, and the
   * state dot is the group's, on the rail.
   */
  renderItem: (item: ChatItem, index: number, children: ChatItem[], dense: boolean) => React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);

  const names: string[] = [];
  let thoughts = 0;
  for (const item of items) {
    if (item.kind === 'tool') names.push(item.name);
    else thoughts += 1;
  }
  const label = composition(names, thoughts);

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
  if (only !== undefined && only.kind === 'tool' && !running) {
    return (
      <View style={styles.wrap}>
        <View key={only.id}>{renderItem(only, 0, items, false)}</View>
        {foot !== undefined ? <RunFoot run={foot} /> : null}
      </View>
    );
  }

  const shownOpen = live || running || open;

  // The segment's own bounds, never the run's: a run is folded in one group per burst, and each
  // burst has its own clock -- it starts when its first call does and stops when the message that
  // cut it was written (owner, 2026-11-08). The run's total stays where it belongs, on its foot.
  const startedAt = items[0]?.ts;
  const tail = items[items.length - 1];
  const endedAt = tail === undefined ? undefined : tail.ts + (tail.kind === 'tool' ? tail.durationMs ?? 0 : 0);

  const toggle = (): void => {
    if (live || running) return;
    // The body is mounted or not, so the animation is the layout's own: no measured height, no
    // second source of truth about how tall the fold is.
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    onToggle();
  };

  return (
    <View style={styles.wrap}>
      <Bar
        label={label}
        open={shownOpen}
        live={live}
        {...(startedAt !== undefined ? { startedAt } : {})}
        {...(endedAt !== undefined ? { endedAt } : {})}
        onPress={toggle}
        styles={styles}
      />
      {shownOpen ? (
        <View style={styles.body}>
          {/* One line for the whole column, ending on the last dot's centre. A segment per row
              was the alternative; one node beats one per call. */}
          <View style={styles.rail} pointerEvents="none" />
          {items.map((item, index) => (
            <View key={item.id} style={styles.child}>
              <View style={[styles.dot, dotStyle(dotOf(item), styles)]} pointerEvents="none" />
              {renderItem(item, index, items, true)}
            </View>
          ))}
        </View>
      ) : null}

      {!live && open && items.length >= FOOTER_FROM_ITEMS ? (
        <View style={styles.hideRow}>
          <Pressable onPress={toggle} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide the run work">
            <Text style={styles.hideText}>hide</Text>
          </Pressable>
        </View>
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

  const count = summaries.reduce((n, row) => n + row.toolCount, 0);
  const itemCount = summaries.reduce((n, row) => n + row.itemCount, 0);
  const firstTool = summaries.find(row => row.firstTool !== undefined)?.firstTool;
  const label = {
    count:
      count > 0
        ? `${count} tool call${count === 1 ? '' : 's'}`
        : `${Math.max(itemCount, 1)} thought${itemCount === 1 ? '' : 's'}`,
    detail: count > 0 && firstTool ? `· ${firstTool}` : '',
  };
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
        label={label}
        open={open}
        // Only the fold state moves here: the effect above is what asks, so a group opened by a
        // press and a group reopened by a redraw cannot take two different paths.
        onPress={() => onToggle()}
        styles={styles}
      />
      {open ? (
        <View style={styles.body}>
          <View style={styles.rail} pointerEvents="none" />
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
 * The group's one control: a chevron in a 13 pt slot, the count, and what the run touched.
 *
 * The slot is what keeps the chevron's centre on the rail's axis: without it the rail and the
 * glyph were fanned apart by the width of whatever mark sat there, and the spine read as two
 * columns.
 */
function Bar({
  label,
  open,
  live = false,
  startedAt,
  endedAt,
  onPress,
  styles,
}: {
  label: { count: string; detail: string };
  open: boolean;
  live?: boolean;
  /** When this segment's first call started, ms. */
  startedAt?: number;
  /** When its last call settled, ms. Absent on a segment with nothing dated in it. */
  endedAt?: number;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={styles.header}
      accessibilityRole="button"
      accessibilityLabel={live ? 'The run is still going' : open ? 'Hide the run work' : 'Show the run work'}
      accessibilityState={{ expanded: open }}>
      {/* One slot for every mark the header can carry, so the chevron and the spinner of a live
          group put their centre on the rail's axis and not 1 pt beside it. */}
      <View style={styles.slot}>
        {live ? (
          <ActivityIndicator size="small" style={styles.spinner} />
        ) : (
          <ChevronIcon direction={open ? 'down' : 'right'} size={11} tone="faint" />
        )}
      </View>
      <Text style={styles.count} numberOfLines={1}>
        {label.count}
      </Text>
      {label.detail ? (
        <Text style={styles.detail} numberOfLines={1}>
          {label.detail}
        </Text>
      ) : null}
      {live && startedAt !== undefined ? (
        <LiveClock since={startedAt} styles={styles} />
      ) : endedAt !== undefined && startedAt !== undefined && endedAt > startedAt ? (
        // A finished segment keeps its own span, quietly: the run's total is its foot's business.
        <Text style={styles.segment}>{formatSpan(endedAt - startedAt)}</Text>
      ) : null}
    </Pressable>
  );
}

/** How long the run has been going, climbing once a second, drawn only on a live group. */
function LiveClock({
  since,
  styles,
}: {
  since: number;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return <Text style={styles.live}>{`running · ${formatSpan(useElapsed(since))}`}</Text>;
}

/** Past this many children, an open group also offers a way out at its bottom. */
const FOOTER_FROM_ITEMS = 5;

/**
 * What the header says: the count, then the composition -- never the first tool's name.
 *
 * "13 tool calls · bash" was the old line, and `bash` is the first call of nearly every run: it
 * said nothing about the twelve others. What the run touched can be read without opening
 * anything, which is the only thing a fold header is for.
 */
export function composition(
  names: readonly string[],
  thoughts: number,
): { count: string; detail: string } {
  const count =
    names.length > 0
      ? `${names.length} tool call${names.length === 1 ? '' : 's'}`
      : `${thoughts} thought${thoughts === 1 ? '' : 's'}`;
  if (names.length === 0) return { count, detail: '' };
  const tally = new Map<string, number>();
  for (const name of names) {
    const label = labelFor(name);
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  const parts = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => `${n} ${label}`);
  if (thoughts > 0) parts.push(`${thoughts} thought${thoughts === 1 ? '' : 's'}`);
  return { count, detail: `· ${parts.join(' · ')}` };
}

/**
 * The word a family is read as. A family is coarser than a tool (`write` and `apply_patch` are
 * both an edit), and a tool nobody classified keeps its own name, so an MCP server still reads
 * sensibly.
 */
function labelFor(name: string): string {
  if (name === 'write' || name === 'apply_patch') return 'edits';
  if (name === 'ls') return 'files';
  switch (familyOf(name)) {
    case 'shell':
      return 'shell';
    case 'file':
      return 'read';
    case 'net':
      return 'web';
    case 'memory':
      return 'memory';
    case 'agent':
      return 'agents';
    case 'browser':
      return 'browser';
    case 'time':
      return 'cron';
    case 'voice':
      return 'audio';
    default:
      return name;
  }
}

type Dot = 'ok' | 'fail' | 'running' | 'thought' | 'waiting';

/**
 * The colour of a child's dot on the rail.
 *
 * Five states, because a run is read at a glance: a call that worked, one that did not, the one
 * in flight, and the two things that are not calls -- a phase the model only thought in (hollow:
 * it interrupts the line instead of filling it) and one that has not answered yet.
 */
function dotOf(item: ChatItem): Dot {
  if (item.kind === 'tool') {
    if (item.running === true) return 'running';
    return item.ok === false ? 'fail' : 'ok';
  }
  if (item.kind === 'text' && item.waitingSince !== undefined && !item.text) return 'waiting';
  return 'thought';
}

function dotStyle(dot: Dot, styles: ReturnType<typeof createStyles>) {
  switch (dot) {
    case 'ok':
      return styles.dotOk;
    case 'fail':
      return styles.dotFail;
    case 'running':
    case 'waiting':
      return styles.dotRunning;
    default:
      return styles.dotThought;
  }
}

/** The header's own left inset, before the chevron slot. See `spine.ts`. */
const HEADER_PAD = 2;

const createStyles = (palette: Palette, _dark: boolean, scale: number) => {
  const g = spine(scale);
  return {
    wrap: { width: '100%' as const, marginBottom: space.xs },
    /**
     * The bar's own gap: the card's chevron and its name are 6 pt apart, and a bar whose arrow
     * touched its text read as a different control at the same place.
     *
     * 26 pt: a run bar is a step under a card's 29, because it stands for work rather than being
     * one piece of it, and the two heights must not compete in one column.
     */
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 7,
      height: Math.round(26 * scale),
      paddingHorizontal: HEADER_PAD,
    },
    // The chevron's slot: 13 pt wide, and its centre is where the rail runs. Everything else in
    // the group is placed from that number.
    slot: {
      width: g.slot,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    /** What the fold holds, in the ink of the message it belongs to. */
    count: { fontSize: scaleFont(11.5, scale), color: palette.text, fontWeight: '600' as const },
    detail: { flex: 1, fontSize: scaleFont(11, scale), color: palette.textMeta },
    live: { fontSize: scaleFont(10, scale), color: palette.accent },
    /** A finished segment's span: the same muted figure the thread uses for every other span. */
    segment: { fontSize: scaleFont(10, scale), color: palette.textMeta, fontVariant: ['tabular-nums' as const] },
    // The header's spinner is a hint, not the subject: the same 0.8 scale the card uses.
    spinner: { transform: [{ scale: 0.7 }] },
    body: { position: 'relative' as const, paddingTop: 2 },
    rail: {
      position: 'absolute' as const,
      left: g.railLeft,
      top: 0,
      bottom: Math.round(13 * scale),
      width: 1,
      backgroundColor: palette.border,
    },
    child: { position: 'relative' as const, paddingLeft: g.gutter },
    dot: {
      position: 'absolute' as const,
      left: g.dotLeft,
      top: g.dotTop,
      width: g.dot,
      height: g.dot,
      borderRadius: g.dot / 2,
    },
    dotOk: { backgroundColor: palette.ok },
    dotFail: { backgroundColor: palette.danger },
    dotRunning: { backgroundColor: palette.accent },
    /**
     * A thought reads as a fainter call, not as a ring: a hollow circle on a stopped line was read
     * as a loading state that never ends (owner, 2026-11-08). Faint and filled says "lighter",
     * and colour already tells it apart from a call that worked.
     */
    dotThought: { backgroundColor: palette.textFaint },
    hideRow: { alignItems: 'flex-end' as const, paddingRight: 8, marginTop: 2 },
    hideText: { fontSize: scaleFont(10.5, scale), color: palette.textMeta },
    skeleton: {
      height: 14,
      marginBottom: 6,
      marginLeft: g.gutter,
      borderRadius: 6,
      backgroundColor: palette.surfaceAlt,
    },
    unavailable: {
      fontSize: scaleFont(font.small, scale),
      color: palette.textFaint,
      fontStyle: 'italic' as const,
      paddingHorizontal: 8,
    },
  };
};
