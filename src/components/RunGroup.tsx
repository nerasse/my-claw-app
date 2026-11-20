import { ChevronIcon } from './icons';
import React from 'react';
import { ActivityIndicator, LayoutAnimation, Pressable, Text, View } from 'react-native';
import { formatSpan, msOf } from '../core/utils';
import { useElapsed } from './CommandElapsed';
import type { ChatItem, RunInfo, RunSummaryItem } from '../core/chat';
import { familyOf } from '../core/toolSummary';
import { spine, ROW_GAP, ROW_SLOT } from './spine';
import { RunFoot } from './RunFoot';
import { drawsNothingYet } from './Bubble';
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
   * One tool call is a fold like any other.
   *
   * It used to be special-cased: a single call between two messages was drawn bare, on the
   * argument that a fold of one card hides nothing. Read in a thread that argument loses: the lone
   * row starts at a different column and wears a different shape than the same call inside a burst,
   * so the eye reads a jump instead of one surface, and there is no header to say what happened
   * (owner, 2026-11-13: "même quand il n'y a qu'un seul tool call, tu le regroupes et tu le
   * déplies comme les autres"). The header of a one-row fold is cheap, and it makes the shape of a
   * run constant whatever the burst size.
   */

  /**
   * The segment being written is open, and so is anything the reader opened. A segment a message
   * cut is *over*: it folds back to its line the moment the next one starts, which is what every
   * agent surface does -- the present is open, the past is compact -- and it is what keeps a long
   * run readable (owner, 2026-11-08). The run's own total still signs its end (`RunFoot`).
   */
  const shownOpen = live || open;

  // The segment's own bounds, never the run's: a run is folded in one group per burst, and each
  // burst has its own clock -- it starts when its first call does and stops when the message that
  // cut it was written (owner, 2026-11-08). The run's total stays where it belongs, on its foot.
  //
  // Read through `msOf`: an item's stamp is a number on what the store built and an ISO string on
  // a card a server frame settled, and the arithmetic below is what turned a live header into
  // `running · NaN h` (2026-11-14).
  const startedAt = msOf(items[0]?.ts);
  const tail = items[items.length - 1];
  const tailTs = msOf(tail?.ts);
  const endedAt = tail === undefined || tailTs === undefined
    ? undefined
    : tailTs + (tail.kind === 'tool' ? tail.durationMs ?? 0 : 0);

  // The last row that owns a dot: the column stops there, whatever comes after it.
  const lastDot = items.reduce((last, item, index) => (item.kind === 'text' && drawsNothingYet(item) ? last : index), -1);

  const toggle = (): void => {
    if (live) return;
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
          {/* The column runs between dots and nowhere else: a segment per row that has one, and the
              last of those stops on its own dot's centre. Rows with nothing to show yet draw no dot
              and no line at all, so the column can never end in an empty bar (owner, 2026-11-08:
              "qu'une barre verticale entre dots, jamais sans rien apres"). */}
          {items.map((item, index) => {
            const dotted = !(item.kind === 'text' && drawsNothingYet(item));
            // A column needs two dots to run between: on the fold's only row there is nothing to
            // connect, and the short segment to its own dot drew a stub under the header holding
            // nothing (owner, 2026-11-08, and the one-row fold made it common).
            const segment =
              items.length === 1
                ? null
                : index === lastDot
                  ? styles.railEnd
                  : dotted && index < lastDot
                    ? styles.railBody
                    : null;
            return (
              <View key={item.id} style={styles.child}>
                {segment === null ? null : (
                  <View
                    style={[styles.rail, index === 0 ? styles.railFirst : null, segment]}
                    pointerEvents="none"
                  />
                )}
                {dotted ? <View style={[styles.dot, dotStyle(dotOf(item), styles)]} pointerEvents="none" /> : null}
                {renderItem(item, index, items, true)}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* No clock under a group: the hour belongs to a message, or to a block the reader opened
          (owner, 2026-11-08: "même pour les groupes, tu enlèves l'heure en bas"). */}
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
  thoughts = [],
  open,
  foot,
  onToggle,
  onOpen,
  renderItem,
}: {
  run: RunInfo;
  summaries: RunSummaryItem[];
  /** The answer's own reasoning, which the server left outside the range it folded. */
  thoughts?: ChatItem[];
  open: boolean;
  /** The run's empreinte, when this is the row it signs under -- `markRunFeet`. */
  foot?: RunInfo;
  onToggle: () => void;
  /** Fires when the group is opened: the rows are replaced by their items when the answer lands. */
  onOpen: (summaries: RunSummaryItem[]) => void;
  renderItem: React.ComponentProps<typeof RunGroup>['renderItem'];
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);

  const toolCount = summaries.reduce((n, row) => n + row.toolCount, 0);
  const itemCount = summaries.reduce((n, row) => n + row.itemCount, 0);
  // What is behind the header that is not a call: the thinking phases, which the server counts in
  // `itemCount` only. `itemCount` is the total, so the difference is the thoughts -- and it is
  // never negative on a row the server wrote, but a page boundary can make the two disagree, so
  // the clamp keeps a bad count from inventing steps.
  const thoughtCount = Math.max(0, itemCount - toolCount) + thoughts.length;
  // The same label as a fold of real items, from the counts instead of the cards: a run cut by a
  // page boundary is several rows, and their tallies add up. The server sends the per-tool counts
  // with the row, so a reload says what the open group said -- `4 steps · 3 shell · 1 thought` --
  // instead of the bare count it was left with (owner, 2026-11-14).
  const label = compositionOf(
    summaries.reduce<Record<string, number>>((all, row) => {
      for (const [name, n] of Object.entries(row.toolKinds ?? {})) all[name] = (all[name] ?? 0) + n;
      return all;
    }, {}),
    thoughtCount,
    toolCount,
  );
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
          {thoughts.map((item, index) => (
            <View key={item.id} style={styles.child}>
              <View style={[styles.dot, styles.dotThought]} pointerEvents="none" />
              {renderItem(item, index, thoughts, true)}
            </View>
          ))}
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
          <ChevronIcon direction={open ? 'down' : 'right'} size={ROW_SLOT} tone="faint" />
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
  const elapsed = useElapsed(since);
  return <Text style={styles.live}>{elapsed === undefined ? 'running' : `running · ${formatSpan(elapsed)}`}</Text>;
}

/** Past this many children, an open group also offers a way out at its bottom. */
const FOOTER_FROM_ITEMS = 5;

/**
 * What the header says: how many steps the fold holds, then what they were.
 *
 * "13 tool calls · bash" was the old line: `bash` is the first call of nearly every run, so it
 * said nothing about the twelve others. The composition answers "what did this run touch" without
 * opening anything, which is the only thing a fold header is for.
 *
 * The umbrella word is "steps" and not "tool calls" because a fold now also holds the thinking
 * that produced the answer -- a step of the run, not a call -- and because it reads plainly to
 * someone who does not know what a tool is (owner, 2026-11-13). The breakdown keeps the truth
 * about each part: `1 shell`, `1 thought`.
 */
export function composition(
  names: readonly string[],
  thoughts: number,
): { count: string; detail: string } {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return compositionOf(counts, thoughts);
}

/**
 * The same line, from counts instead of cards: what a table of tool names and their tallies
 * carries, which is all a folded row has of the work it stands for.
 *
 * `calls` is the run's own tool count, and it is passed rather than summed from the tally: a row
 * from a server that predates `toolKinds` has no breakdown, and the line still has to say how many
 * steps there were.
 */
export function compositionOf(
  counts: Readonly<Record<string, number>>,
  thoughts: number,
  calls?: number,
): { count: string; detail: string } {
  const tally = new Map<string, number>();
  let counted = 0;
  for (const [name, n] of Object.entries(counts)) {
    counted += n;
    const label = labelFor(name);
    tally.set(label, (tally.get(label) ?? 0) + n);
  }
  const steps = (calls ?? counted) + thoughts;
  const count = `${steps} step${steps === 1 ? '' : 's'}`;
  if (counted === 0) {
    // Nothing but thinking, or no tally at all: the breakdown would repeat the count word for word.
    return { count, detail: '' };
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

/** The air between the bar and the first row of the column. */
const BODY_PAD = 2;

/** The thread's right gutter: what a row's trailing figure stops short of. */
const RIGHT_GUTTER = 8;

const createStyles = (palette: Palette, _dark: boolean, scale: number) => {
  const g = spine(scale);
  return {
    /**
     * The group reaches back by the dot's own inset, so its leftmost mark lands on the column a
     * message's first letter takes instead of 3 pt to its right (`spine.ts`).
     *
     * Stretched rather than given a width: a `width: '100%'` with a negative left margin would
     * pull the right edge in by the same amount, and every trailing figure (a call's duration, a
     * run's empreinte) would sit 3 pt left of the bubble's own right padding. Stretch computes the
     * width from the parent and the margins, so the right edge stays exactly where it was.
     */
    wrap: { alignSelf: 'stretch' as const, marginLeft: -g.inset, marginBottom: space.xs },
    /**
     * The bar's own metrics: the chevron's slot flush with the group's left edge, so the mark starts
     * on the same x as the message it stands for and as a reasoning line's chevron. The gap is the
     * aside's own, which is what puts the count on the label column instead of 4 pt right of it
     * (owner, 2026-11-12: "des décalages chelous ... et les chevrons n'ont pas le même style").
     *
     * 26 pt: a run bar is a step under a card's 29, because it stands for work rather than being
     * one piece of it, and the two heights must not compete in one column.
     */
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: ROW_GAP,
      height: Math.round(26 * scale),
      // The same 8 pt the rows under it and the run's empreinte use: without it the header's own
      // trailing figure (a segment's span, a live run's chrono) ended hard against the edge while
      // every duration below it stopped 8 pt short, so one column had two right edges
      // (owner, 2026-11-13: "au niveau du padding ensuite a droite au niveau des items").
      paddingRight: RIGHT_GUTTER,
    },
    // The chevron's slot: as wide as the mark every foldable row draws, and its centre is where
    // the rail runs. Everything else in the group is placed from that number.
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
    body: { position: 'relative' as const, paddingTop: BODY_PAD },
    /** One segment per row: they join up, and only the last one knows where to stop. */
    rail: {
      position: 'absolute' as const,
      left: g.railLeft,
      top: 0,
      width: 1,
      backgroundColor: palette.border,
    },
    /** Covers the body's own padding, so the column starts under the header, not 2 pt below it. */
    railFirst: { top: -BODY_PAD },
    railBody: { bottom: 0 },
    /** Down to the last dot's centre, and no further: half the head row is where a dot sits. */
    railEnd: { height: Math.round(g.head / 2) },
    /**
     * One line of the column: as tall as a head, with its content centred on it.
     *
     * Two things ride on this. A row shorter than a head (a lone wait, a phase that said nothing
     * yet) used to sit at the top of its line with the air under it -- "le wait est un peu plus
     * haut, et laisse de l'espace vide en bas" -- and a row that had nothing to show yet had no
     * height at all, so the thread jumped when it appeared and jumped again with the first words
     * (owner, 2026-11-08). Both are the same measurement now.
     */
    child: {
      position: 'relative' as const,
      paddingLeft: g.gutter,
      minHeight: g.head,
      justifyContent: 'center' as const,
    },
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
    hideRow: { alignItems: 'flex-end' as const, paddingRight: RIGHT_GUTTER, marginTop: 2 },
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
      paddingHorizontal: RIGHT_GUTTER,
    },
  };
};
