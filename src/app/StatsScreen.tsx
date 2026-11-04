import { ChartIcon, CheckIcon, ChevronIcon, FilesIcon, FolderIcon, GaugeIcon, GearIcon, InfoIcon, SlidersIcon } from '../components/icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { connection } from '../core/connection';
import { statsStore, useStats, DEFAULT_STATS_PERIOD } from '../core/stats';
import { cacheShareLabel } from '../core/cache';
import { encodeStatsGet } from '../core/protocol';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import {
  FILTER_CHIPS,
  chipValue,
  choicesOf,
  callerLabel,
  filterCount,
  filterSummary,
  isChoice,
  noFilter,
  toggleFlag,
  withChoice,
  type FilterChoiceKey,
} from '../core/statsFilter';
import type {
  StatsCache,
  StatsCallerRow,
  StatsDayRow,
  StatsFilter,
  StatsModelRow,
  StatsPayload,
  StatsPeriod,
  StatsProviderKeyRow,
  StatsProviderRow,
  StatsReconciliation,
  StatsReliabilityRow,
  StatsSessionRow,
  StatsToolRow,
  StatsTools,
  StatsTotals,
} from '../core/protocol';

/**
 * What this install has spent, across every conversation it ever ran -- the deleted ones included,
 * because their calls outlived them and a ranking that dropped them would add up to less than the
 * total above it.
 *
 * It is not `/status`. That page is one conversation's, and the provider reconciliation that used
 * to sit at the foot of it was account-wide from the first day: a chat running entirely on
 * api.anthropic.com was shown an OpenRouter line. The figure was never wrong, it was on the wrong
 * page.
 *
 * Seven tabs, on one window and one filter. The page is a lot of figures and the folds were the wrong
 * shape for it -- a screen that unrolled nine sections in a column buried the eight below the third.
 * A tab answers one question at a time, and the filter row above them holds the same dimensions
 * wherever it is used: the narrowing happens in SQL, on the server, so every figure on the tab
 * describes the same smaller population and none of them is a re-scaled total.
 *
 * The last tab is a drawer, on purpose. Endpoints, sources and the provider ledger are what the
 * owner opens one day in a hundred (2026-09-22: "cacher les analytiques useless 99% du temps"),
 * and each of them is a table nobody reads on an ordinary visit. Advanced holds them all, out of
 * the rotation, with the vocabulary settled: an endpoint is an endpoint, and who drove a call is
 * its "source" (main agent, sub-agents, compaction, browser) rather than its "caller".
 *
 * One request per period, per filter, per opening: nothing pushes an install-wide total, so the page
 * asks, and says so when the answer is refused.
 */

const PERIODS: readonly StatsPeriod[] = ['7d', '30d', '90d', 'all'];

type StatsTab = 'overview' | 'models' | 'conversations' | 'cache' | 'reliability' | 'tools' | 'advanced';

const TABS: ReadonlyArray<{ key: StatsTab; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Overview', icon: <InfoIcon size={15} tone="muted" /> },
  { key: 'models', label: 'Models', icon: <ChartIcon size={15} tone="muted" /> },
  { key: 'conversations', label: 'Conversations', icon: <FilesIcon size={15} tone="muted" /> },
  { key: 'cache', label: 'Cache', icon: <GaugeIcon size={15} tone="muted" /> },
  { key: 'reliability', label: 'Reliability', icon: <CheckIcon size={15} tone="muted" /> },
  { key: 'tools', label: 'Tools', icon: <GearIcon size={15} tone="muted" /> },
  { key: 'advanced', label: 'Advanced', icon: <SlidersIcon size={15} tone="muted" /> },
];

/** How many conversations the ranking draws before it folds the rest into one line. */
const SESSION_ROWS = 12;

/** How many models the overview draws before the exact ranking takes over. */
const OVERVIEW_ROWS = 4;

/** The only sheets long enough to need a search row: forty models, a hundred and fifty threads. */
const SEARCHED: readonly FilterChoiceKey[] = ['model', 'sessionId'];

/** Height of the daily bars, in points: the track is fixed so a bar can be a share of it. */
const CHART_HEIGHT = 44;

/** An id is truncated to this before it is drawn, tail kept: the distinctive half is the last one. */
const ID_MAX = 30;

/**
 * Tokens, in the units a human counts in. A thousand million is a billion: `1000.0M` is the same
 * number written in a unit nobody counts in, so the tier turns over at 1e9 -- and at 999.95M,
 * which is what would round to it.
 *
 * Exported for its own test.
 */
export function shortTokens(n: number): string {
  const millions = n / 1e6;
  if (n >= 1e9 || millions >= 999.95) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${millions.toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  return n.toLocaleString('en-US');
}

/**
 * What the window consumed. Cache reads and writes are subsets of the prompt, already counted
 * here: adding them would count the same tokens twice.
 *
 * Exported for its own test.
 */
export function tokenTotal(t: StatsTotals): number {
  return t.promptTokens + t.completionTokens;
}

function money(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function duration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h${String(mins % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * A gap, signed, because its direction is the whole information: `+` is money the provider took
 * that we did not account for, `-` is money we recorded that it never billed (a BYOK route, where
 * the upstream provider charged instead).
 */
function gap(usd: number): string {
  if (Math.abs(usd) < 0.01) return '<$0.01';
  return `${usd < 0 ? '-' : '+'}${money(Math.abs(usd))}`;
}

/** The window a period names, spelled, so the header never leaves `90d` to be interpreted. */
export function periodLabel(period: StatsPeriod): string {
  if (period === 'all') return 'everything recorded';
  return `last ${period.replace('d', '')} days`;
}

/**
 * The sentence the two bounded sections owe the reader, or null when there is nothing to say.
 *
 * `totals`, `models`, `providers`, `reliability`, `cache` and `callers` reach back to
 * `totalsSince`: the purge folds every row it deletes into a permanent monthly rollup first.
 * `sessions` and `daily` cannot -- the rollup key has no session on it and no day in it -- so they
 * stop at `detailSince`. "Everything since always", drawn over a per-session ranking that silently
 * starts three months ago, is the lie this page was created to stop telling.
 *
 * Null when the two horizons are the same: a bounded period reads live rows alone, and an install
 * the purge has never run on has no rollup to reach past them.
 *
 * Exported for its own test: the frontier is the whole honesty of the page, and reaching it
 * through a render means drawing nine sections to read one string.
 */
export function horizonNote(stats: StatsPayload): string | null {
  if (!stats.rollupIncluded) return null;
  const detail = stats.detailSince?.slice(0, 10);
  if (!detail) return null;
  const totals = stats.totalsSince;
  if (!totals || totals >= detail.slice(0, 7)) return null;
  return `counts from ${detail} only · the totals above reach back to ${totals}`;
}

/**
 * What the window's traffic is worth at the rates it ran at: the one sum this page accepts.
 *
 * The two figures it adds are a partition -- every priced call is in exactly one of them, so the
 * addition double counts nothing -- and they are not the same kind of thing. `billedUsd` is what
 * somebody was asked to pay on a metered endpoint; `referenceUsd` is what the flat-plan half would
 * have cost had it been metered, which is a price and never a charge.
 *
 * Added as an invoice, that is nonsense. Added as a valuation, it is the figure an owner means by
 * "what does this cost me in API terms", and it is the only one that answers on an install whose
 * traffic is almost all subscription. Its two parts are named under the hero, so the sum hides
 * nothing: no reader is left thinking four thousand dollars left a card.
 */
export function listPrice(t: StatsTotals): number {
  return t.billedUsd + t.referenceUsd;
}

/**
 * What the compactions of the window cost, blocking and background passes folded together, or
 * nothing when the window did not compact. Read off the per-source rows the server already sends:
 * a compaction is maintenance on a conversation, and it hid inside Advanced > Source while two
 * passes could cost as much as a day of work (2026-10-04, $6 for two summaries that were cut).
 *
 * Exported for its own test.
 */
export function compactionTotals(rows: readonly StatsCallerRow[]): StatsTotals | undefined {
  const passes = rows.filter(row => row.caller === 'compaction' || row.caller.startsWith('compaction-'));
  if (passes.length === 0) return undefined;
  const sum = (key: keyof StatsTotals): number => passes.reduce((total, row) => total + row[key], 0);
  return {
    calls: sum('calls'),
    errors: sum('errors'),
    promptTokens: sum('promptTokens'),
    completionTokens: sum('completionTokens'),
    cacheReadTokens: sum('cacheReadTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
    billedUsd: sum('billedUsd'),
    referenceUsd: sum('referenceUsd'),
    unpriced: sum('unpriced'),
    durationMs: sum('durationMs'),
  };
}

/**
 * Its weight in the window, in the page's two figures: money and tokens. Empty when the window has
 * neither, rather than a division by zero drawn as `NaN%`.
 *
 * Exported for its own test.
 */
export function compactionShareLine(part: StatsTotals, window: StatsTotals): string {
  const pct = (a: number, b: number): string | null => (b > 0 ? `${Math.round((a / b) * 100)}%` : null);
  return [
    pct(listPrice(part), listPrice(window)) ? `${pct(listPrice(part), listPrice(window))} of the cost` : null,
    pct(tokenTotal(part), tokenTotal(window)) ? `${pct(tokenTotal(part), tokenTotal(window))} of the tokens` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The hero's parts, one line each, and they add up to it -- which is the page's one promise.
 *
 * `unpriced` rides with them because calls counted with no money behind them are information: the
 * totals above include their tokens, the amounts below do not.
 *
 * Exported for its own test.
 */
export function totalsMoneyLines(t: StatsTotals): string[] {
  const lines: string[] = [];
  if (t.billedUsd > 0) lines.push(`${money(t.billedUsd)} charged · metered endpoints`);
  if (t.referenceUsd > 0) {
    lines.push(`${money(t.referenceUsd)} on a flat plan · subscription or plan, never billed per token`);
  }
  if (t.unpriced > 0) {
    lines.push(`${t.unpriced} call${t.unpriced === 1 ? '' : 's'} nothing could price · counted above, absent from the money`);
  }
  return lines;
}

/**
 * One row's money in the width a ranking has: the same valuation the hero makes, with the charged
 * part named beside it when there is one.
 *
 * `charged` appears only where something was actually taken, which is a minority of rows on an
 * install that runs on subscriptions -- so the ranking stays readable and the money that left a
 * card is never quietly lost inside a sum.
 *
 * Exported for its own test.
 */
export function rowMoney(t: StatsTotals): string {
  const total = listPrice(t);
  if (total === 0) return t.unpriced > 0 ? 'unpriced' : money(0);
  if (t.billedUsd <= 0) return money(t.referenceUsd);
  if (t.referenceUsd <= 0) return `${money(t.billedUsd)} charged`;
  return `${money(total)} · ${money(t.billedUsd)} charged`;
}

/** The legend the money of a ranking owes: what the figure is, and what the word beside it means. */
function MoneyLegend(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.codeNote}>everything at list price · “charged” names what was actually taken</Text>;
}

/**
 * How a conversation's label is drawn. `labelSource` is the server saying what it handed over: a
 * title, the opening message of a session the archive still holds, or -- when both are gone -- the
 * bare session id. An id drawn as a title reads as a conversation somebody named `sub-9f3a…`, so
 * it is drawn as what it is: monospaced, and cut to a width a phone can hold.
 *
 * Exported for its own test.
 */
export function sessionLabel(row: StatsSessionRow): { text: string; mono: boolean } {
  if (row.labelSource !== 'id') return { text: row.label, mono: false };
  const id = row.label;
  return { text: id.length > ID_MAX ? `…${id.slice(-(ID_MAX - 1))}` : id, mono: true };
}

/**
 * What a screen reader is told about a conversation of the ranking, and the one place the page
 * states out loud that a row outlived its session. A deleted conversation drawn like a living one
 * invites a tap that leads nowhere and hides the fact that most of this history no longer exists.
 *
 * Exported for its own test.
 */
export function sessionRowLabel(row: StatsSessionRow): string {
  return `${row.deleted ? 'deleted conversation' : 'conversation'} ${sessionLabel(row).text}`;
}

/**
 * What a provider's own ledger says, beside what we recorded for it, over two lines.
 *
 * Both halves are the key's, never one conversation's, which is why this is on this page and not
 * on `/status` any more. The provider's figure is drawn only when there is one: the server reads
 * it from a cache it refuses to wait on, so an API that is down and a cache nothing has warmed yet
 * both leave the line standing on our own sum, and neither may turn it into `$NaN`.
 *
 * The gap is not an error being reported. Their counter runs from the day the key was made and
 * ours runs over the window on screen, and a BYOK call is billed by somebody they never charged
 * for: the second line says so rather than leaving a non-zero number looking like a bug.
 *
 * Exported for its own test.
 */
export function statsReconciliationLines(r: StatsReconciliation): string[] {
  const covered = `${r.calls} call${r.calls === 1 ? '' : 's'} recorded here`;
  // One entry per key: the account's name says which one, the host alone could not.
  const who = r.providerLabel ?? r.provider;
  if (r.providerUnread || r.providerUsd === undefined || r.deltaUsd === undefined) {
    return [`${who} · we recorded ${money(r.recordedUsd)}`, `${covered} · provider not reached`];
  }
  return [
    `${who} · they charged ${money(r.providerUsd)} · we recorded ${money(r.recordedUsd)} · gap ${gap(r.deltaUsd)}`,
    [covered, 'their figure runs from the key, not the window', r.balanceUsd === undefined ? null : `balance ${money(r.balanceUsd)}`]
      .filter(Boolean)
      .join(' · '),
  ];
}

/** Calls, tokens and wall time: the line every ranking row carries under its name. */
function volumeLine(t: StatsTotals): string {
  return [
    `${t.calls}x`,
    `${shortTokens(t.promptTokens)} in`,
    t.cacheReadTokens > 0 ? `${shortTokens(t.cacheReadTokens)} cached (${cacheShareLabel(t.cacheReadTokens, t.promptTokens)})` : null,
    `${shortTokens(t.completionTokens)} out`,
    t.errors > 0 ? `${t.errors} err` : null,
    t.durationMs > 0 ? duration(t.durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Where the calls went, without the route: `StreamLake · fp8`, `api.anthropic.com`. */
function routeOf(row: { provider: string; providerName?: string; variant?: string }): string {
  return [row.providerName ?? row.provider, row.variant].filter(Boolean).join(' · ');
}

/**
 * Which of the owner's providers paid, then where the call went: `OpenRouter boulot · StreamLake`.
 * Two accounts on one route are two rows, and only the first half tells them apart.
 */
function servedBy(row: StatsModelRow): string {
  return [row.providerLabel, routeOf(row)].filter(Boolean).join(' · ');
}

export function StatsScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const stats = useStats();
  useDismissKeyboard();

  const [tab, setTab] = useState<StatsTab>('overview');
  const [sheet, setSheet] = useState<FilterChoiceKey | null>(null);
  const [query, setQuery] = useState('');

  const ask = useCallback((period: StatsPeriod, filter: StatsFilter) => {
    statsStore.open(period, filter);
    connection.send(encodeStatsGet(period, filter)).catch(() => {});
  }, []);

  // Asked on every opening: these are install-wide figures and nothing pushes them, so a payload
  // kept from a previous visit would be however old that visit is.
  useEffect(() => {
    ask(DEFAULT_STATS_PERIOD, noFilter());
  }, [ask]);

  // The filter lives in the store rather than here: it is half of what was asked, and an answer
  // has to agree with both halves before the page may draw it (see `core/stats.ts`).
  const filter = stats.filter;
  const payload = stats.payload;
  const facets = payload?.facets;
  const narrowing = filterCount(filter) > 0;

  const undo = useCallback(() => {
    ask(stats.period, noFilter());
  }, [ask, stats.period]);

  /** The rows of the sheet on screen: the way back to "everything", then the values the server
   *  sent for this window. Built from the facets and not from the answer, or the list would shrink
   *  to the one choice already made and leave no way to any other. */
  const sheetOptions = useMemo(() => {
    if (sheet === null) return [];
    const options: SheetEntry[] = [
      {
        label: 'Everything',
        icon: <FolderIcon size={15} tone="muted" />,
        hint: 'drop this dimension',
        selected: filter[sheet] === undefined,
        onPress: () => {
          setSheet(null);
          ask(stats.period, withChoice(filter, sheet, undefined));
        },
      },
    ];
    const needle = query.trim().toLowerCase();
    for (const choice of choicesOf(facets, sheet)) {
      if (needle !== '' && !choice.label.toLowerCase().includes(needle)) continue;
      options.push({
        key: choice.value,
        label: choice.label,
        selected: filter[sheet] === choice.value,
        onPress: () => {
          setSheet(null);
          ask(stats.period, withChoice(filter, sheet, choice.value));
        },
      });
    }
    return options;
  }, [ask, facets, filter, query, sheet, stats.period]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close statistics">
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Statistics</Text>
          <Text style={styles.headerSub}>
            {`every conversation of this install · ${periodLabel(stats.period)}${narrowing ? ' · filtered' : ''}`}
          </Text>
        </View>
      </View>

      <View style={styles.periods}>
        {PERIODS.map(period => (
          <Pressable
            key={period}
            onPress={() => ask(period, filter)}
            style={[styles.period, period === stats.period && styles.periodOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: period === stats.period }}
            accessibilityLabel={`Period ${period}`}>
            <Text style={[styles.periodText, period === stats.period && styles.periodTextOn]}>{period}</Text>
          </Pressable>
        ))}
      </View>

      {/* One row of dimensions, above the tabs because it narrows all of them. A chip carries its
          value once set -- `Model · glm-5.2` -- so the row is also the state of the report. */}
      {/*
        `strip` on both rows, and it is the whole bug fix: a horizontal ScrollView carries
        `flexGrow: 1, flexShrink: 1` from React Native's own base style, so the tall vertical list
        below it claimed the free space and then squeezed these two below their own content. The
        rows came out a few pixels short and the bottom of every label was cut, which read as a
        styling accident rather than the flexbox arithmetic it was. `flexGrow: 0` stops them
        floating in space when the tab is short, `flexShrink: 0` stops them collapsing when it is
        long. Reported by the owner on 2026-09-15, next to the same cut on the composer.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled">
        {narrowing ? (
          <Pressable
            onPress={undo}
            style={[styles.chip, styles.chipClear]}
            accessibilityRole="button"
            accessibilityLabel="Clear every filter">
            <Text style={styles.chipClearText}>{'× clear'}</Text>
          </Pressable>
        ) : null}
        {FILTER_CHIPS.map(chip => {
          const value = chipValue(filter, chip.key, facets);
          const on = value !== '';
          return (
            <Pressable
              key={chip.key}
              onPress={() => {
                // A choice opens its list; a predicate is its own list, so a tap is the answer.
                if (isChoice(chip.key)) {
                  setQuery('');
                  setSheet(chip.key);
                  return;
                }
                ask(stats.period, toggleFlag(filter, chip.key));
              }}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={on ? `${chip.label} filter, ${value}, tap to change` : `${chip.label} filter, off`}>
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {on ? `${chip.label} · ${value}` : chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.tabs}
        keyboardShouldPersistTaps="handled">
        {TABS.map(entry => (
          <Pressable
            key={entry.key}
            onPress={() => setTab(entry.key)}
            style={[styles.tab, entry.key === tab && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: entry.key === tab }}
            accessibilityLabel={entry.label}>
            {entry.icon}
            <Text style={[styles.tabText, entry.key === tab && styles.tabTextOn]}>{entry.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {stats.fetch === 'loading' ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : stats.fetch === 'error' ? (
        <View style={styles.failure}>
          <Text style={styles.empty}>{stats.error}</Text>
          <Pressable
            onPress={() => ask(stats.period, filter)}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Ask again">
            <Text style={styles.retryText}>ask again</Text>
          </Pressable>
        </View>
      ) : payload ? (
        payload.totals.calls === 0 ? (
          <View style={styles.none}>
            <Text style={styles.empty}>
              {narrowing
                ? `nothing matches ${filterSummary(filter, facets)}.`
                : `nothing was called in this window (${periodLabel(payload.period)}).`}
            </Text>
            {narrowing ? (
              <Pressable onPress={undo} style={styles.retry} accessibilityRole="button" accessibilityLabel="Clear every filter">
                <Text style={styles.retryText}>clear the filter</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {tab === 'overview' ? <Overview stats={payload} /> : null}
            {tab === 'models' ? (
              <>
                <ProviderKeys rows={payload.providerKeys ?? []} />
                <Models rows={payload.models} />
              </>
            ) : null}
            {tab === 'conversations' ? <Sessions stats={payload} /> : null}
            {tab === 'cache' ? <CacheFold cache={payload.cache} /> : null}
            {tab === 'reliability' ? <Reliability rows={payload.reliability} /> : null}
            {tab === 'tools' ? <Tools tools={payload.tools} /> : null}
            {tab === 'advanced' ? (
              <>
                <Providers rows={payload.providers} />
                <Callers rows={payload.callers} />
                <Reconciliation entries={payload.reconciliation} />
              </>
            ) : null}
          </ScrollView>
        )
      ) : null}

      {sheet !== null ? (
        <ActionSheet
          preview={FILTER_CHIPS.find(chip => chip.key === sheet)?.sheet ?? 'Filter'}
          options={sheetOptions}
          search={
            SEARCHED.includes(sheet)
              ? { value: query, onChange: setQuery, placeholder: sheet === 'model' ? 'Search models' : 'Search conversations' }
              : null
          }
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.card}>{children}</View>;
}

function CardHead({ title, trailing, fold }: { title: string; trailing?: string; fold?: 'up' | 'down' | 'left' | 'right' }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.cardHead}>
      {fold ? <ChevronIcon direction={fold} size={13} tone="faint" /> : null}
      <Text style={styles.cardTitle}>{title}</Text>
      {trailing ? <Text style={styles.cardTrailing}>{trailing}</Text> : null}
    </View>
  );
}

/** One ranking line: a name, what it is worth, and the volume behind it. */
function RankRow({
  name,
  detail,
  totals,
  mono,
  muted,
  badge,
  accessibilityLabel,
}: {
  name: string;
  detail?: string;
  totals: StatsTotals;
  mono?: boolean;
  muted?: boolean;
  badge?: string;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rankRow} accessibilityLabel={accessibilityLabel}>
      <View style={styles.rankTop}>
        <Text style={[styles.rankName, mono && styles.mono, muted && styles.rankNameMuted]} numberOfLines={1}>
          {name}
        </Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Text style={styles.rankCost}>{rowMoney(totals)}</Text>
      </View>
      <Text style={styles.rankNums} numberOfLines={1}>
        {detail ? `${detail} · ${volumeLine(totals)}` : volumeLine(totals)}
      </Text>
    </View>
  );
}

/**
 * The Overview tab: what the window is worth, the shape of the traffic, who drove it, and the head
 * of the model ranking. One screen, and every figure on it is a fold of the same rows.
 */
function Overview({ stats }: { stats: StatsPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const t = stats.totals;
  const reach = stats.rollupIncluded && stats.totalsSince ? `from ${stats.totalsSince}, rollup included` : null;
  return (
    <>
      <Card>
        <CardHead title={`total · ${periodLabel(stats.period)}`} trailing={`${t.calls} calls`} />
        <View style={styles.heroFigures}>
          <View>
            <Text style={styles.hero}>{money(listPrice(t))}</Text>
            <Text style={styles.heroUnit}>at list price</Text>
          </View>
          {/* The consumption beside the price, in the same type: the page is about what the window
              cost and what it burned, and neither is a footnote to the other (owner, 2026-10-02). */}
          <View style={styles.heroSide}>
            <Text style={styles.hero}>{shortTokens(tokenTotal(t))}</Text>
            <Text style={styles.heroUnit}>tokens</Text>
          </View>
        </View>
        {totalsMoneyLines(t).map(line => (
          <Text key={line} style={styles.cardNote}>
            {line}
          </Text>
        ))}
        <Text style={[styles.cardNote, styles.spacer]}>
          {`${shortTokens(t.promptTokens)} in · ${shortTokens(t.completionTokens)} out · ${shortTokens(t.cacheReadTokens)} cached (${cacheShareLabel(
            t.cacheReadTokens,
            t.promptTokens,
          )}) · ${shortTokens(t.cacheWriteTokens)} written (${cacheShareLabel(t.cacheWriteTokens, t.promptTokens)})`}
        </Text>
        <Text style={styles.cardNote}>
          {`${duration(t.durationMs)} inside the API${t.errors > 0 ? ` · ${t.errors} errors` : ' · no errors'}`}
        </Text>
        {reach ? <Text style={styles.codeNote}>{reach}</Text> : null}
      </Card>
      <CompactionCard stats={stats} />
      <Timeline stats={stats} />
      <TopModels rows={stats.models.slice(0, OVERVIEW_ROWS)} rest={Math.max(0, stats.models.length - OVERVIEW_ROWS)} />
    </>
  );
}

/**
 * The compactions of the window, right under the total they are part of: a pass reads the whole
 * conversation and writes its summary, which makes it among the heaviest calls there are.
 */
function CompactionCard({ stats }: { stats: StatsPayload }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const c = compactionTotals(stats.callers);
  if (!c) return null;
  const share = compactionShareLine(c, stats.totals);
  return (
    <Card>
      <CardHead title="compaction" trailing={`${c.calls} ${c.calls === 1 ? 'pass' : 'passes'}`} />
      <View style={styles.heroFigures}>
        <Text style={styles.rankCost}>{rowMoney(c)}</Text>
        <Text style={styles.rankCost}>{`${shortTokens(tokenTotal(c))} tokens`}</Text>
      </View>
      {share ? <Text style={styles.cardNote}>{share}</Text> : null}
      <Text style={styles.cardNote}>
        {`${shortTokens(c.promptTokens)} read · ${shortTokens(c.completionTokens)} written · ${duration(c.durationMs)}${c.errors > 0 ? ` · ${c.errors} errors` : ''}`}
      </Text>
    </Card>
  );
}

/** The head of the ranking, with the door to the whole one: an overview is a shape, not a list. */
function TopModels({ rows, rest }: { rows: StatsModelRow[]; rest: number }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHead title="top models" trailing={rest > 0 ? `+ ${rest} more` : undefined} />
      <View style={styles.rank}>
        {rows.map(row => (
          <RankRow key={`${row.model}\u0000${row.provider}\u0000${row.variant ?? ''}\u0000${row.providerKey ?? ''}`} name={row.model} detail={servedBy(row)} totals={row} />
        ))}
      </View>
      <MoneyLegend />
    </Card>
  );
}

/**
 * The shape of the spend, one bar per day, and the frontier that bounds it. Calls and not money:
 * a day's bar drawn from billed plus reference would be the one sum this page refuses to make.
 */
function Timeline({ stats }: { stats: StatsPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const note = horizonNote(stats);
  const days = stats.daily;
  if (days.length === 0) {
    return (
      <Card>
        <CardHead title="daily" />
        <Text style={styles.cardNote}>no per-call row left on disk for this window.</Text>
        {note ? <Text style={styles.frontier}>{note}</Text> : null}
      </Card>
    );
  }
  const peak = days.reduce((best: StatsDayRow, day) => (day.calls > best.calls ? day : best), days[0]);
  const max = Math.max(peak.calls, 1);
  return (
    <Card>
      <CardHead title="daily" trailing={`${days.length} day${days.length === 1 ? '' : 's'}`} />
      <View style={styles.chart}>
        {days.map(day => (
          <View
            key={day.date}
            style={styles.barSlot}
            accessibilityLabel={`${day.date}: ${day.calls} calls`}>
            <View style={[styles.bar, { height: Math.max(2, (day.calls / max) * CHART_HEIGHT) }]} />
          </View>
        ))}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.codeNote}>{days[0].date}</Text>
        <Text style={styles.codeNote}>{days[days.length - 1].date}</Text>
      </View>
      <Text style={styles.cardNote}>{`busiest ${peak.date} · ${peak.calls} calls · ${rowMoney(peak)}`}</Text>
      {note ? <Text style={styles.frontier}>{note}</Text> : null}
    </Card>
  );
}

/**
 * Which conversations spent it, the ones that no longer exist included. Their calls are still on
 * disk and dropping them would make this ranking add up to less than the total above it, so they
 * are listed and marked, never quietly folded into the living ones.
 *
 * In two sections. A run of a sub-agent or the browser is a worker, not a chat -- measured on this
 * install, 364 of the 533 sessions of one window were workers (2026-09-22) -- so the conversations
 * answer "which chat cost this" and the delegated runs sit under them, folded by default. Their
 * money is kept, never merged into the payer's row: the owner asked for the runs as their own
 * section, and a spend the rows cannot account for is what this page never shows.
 */
function Sessions({ stats }: { stats: StatsPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const note = horizonNote(stats);
  const [delegatedOpen, setDelegatedOpen] = useState(false);
  const own = stats.sessions.filter(row => !row.delegated);
  const delegated = stats.sessions.filter(row => row.delegated);
  return (
    <>
      <Card>
        <CardHead title="conversations" trailing={`${own.length}`} />
        {own.some(row => row.deleted) ? (
          <Text style={styles.cardNote}>{`${own.filter(row => row.deleted).length} of them no longer exist on disk; their calls do.`}</Text>
        ) : null}
        {note ? <Text style={styles.frontier}>{note}</Text> : null}
        <View style={styles.rank}>
          {own.slice(0, SESSION_ROWS).map(row => {
            const label = sessionLabel(row);
            return (
              <RankRow
                key={row.sessionId}
                name={label.text}
                mono={label.mono}
                muted={row.deleted}
                badge={row.deleted ? 'deleted' : undefined}
                detail={`${row.firstAt.slice(0, 10)} → ${row.lastAt.slice(0, 10)}`}
                totals={row}
                accessibilityLabel={sessionRowLabel(row)}
              />
            );
          })}
        </View>
        {own.length === 0 ? <Text style={styles.cardNote}>no conversation recorded in this window.</Text> : null}
        {own.length > SESSION_ROWS ? (
          <Text style={styles.codeNote}>{`+ ${own.length - SESSION_ROWS} more, ${own.slice(SESSION_ROWS).filter(row => row.deleted).length} of them deleted`}</Text>
        ) : null}
      </Card>
      {delegated.length > 0 ? (
        <Card>
          <Pressable
            onPress={() => setDelegatedOpen(open => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: delegatedOpen }}
            accessibilityLabel={delegatedOpen ? 'Fold delegated runs' : 'Unfold delegated runs'}>
            <CardHead
              title="delegated runs"
              fold={delegatedOpen ? 'down' : 'right'}
              trailing={`${delegated.length} · sub-agents and browser`}
            />
          </Pressable>
          <Text style={styles.cardNote}>worker runs a conversation drove; their calls are billed to it.</Text>
          {delegatedOpen ? (
            <View style={styles.rank}>
              {delegated.slice(0, SESSION_ROWS).map(row => {
                const label = sessionLabel(row);
                return (
                  <RankRow
                    key={row.sessionId}
                    name={label.text}
                    mono={label.mono}
                    muted={row.deleted}
                    badge={row.deleted ? 'deleted' : undefined}
                    detail={`${row.firstAt.slice(0, 10)} → ${row.lastAt.slice(0, 10)}`}
                    totals={row}
                    accessibilityLabel={sessionRowLabel(row)}
                  />
                );
              })}
              {delegated.length > SESSION_ROWS ? (
                <Text style={styles.codeNote}>{`+ ${delegated.length - SESSION_ROWS} more`}</Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function Models({ rows }: { rows: StatsModelRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHead title="models" trailing={`${rows.length} · by what they are worth`} />
      <View style={styles.rank}>
        {rows.map(row => (
          <RankRow key={`${row.model}\u0000${row.provider}\u0000${row.variant ?? ''}\u0000${row.providerKey ?? ''}`} name={row.model} detail={servedBy(row)} totals={row} />
        ))}
      </View>
      <MoneyLegend />
    </Card>
  );
}

/** The owner's providers, each account its own row: what was spent through which one. */
function ProviderKeys({ rows }: { rows: StatsProviderKeyRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHead title="providers" trailing={`${rows.length} · by what they are worth`} />
      <View style={styles.rank}>
        {rows.map(row => (
          <RankRow key={row.providerKey} name={row.providerLabel} totals={row} />
        ))}
      </View>
      <MoneyLegend />
    </Card>
  );
}

function Providers({ rows }: { rows: StatsProviderRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHead title="endpoints" trailing={`${rows.length} · by what they are worth`} />
      <Text style={styles.cardNote}>An endpoint pin where the model carries one (`streamlake/fp8`), the host otherwise.</Text>
      <View style={styles.rank}>
        {rows.map(row => (
          <RankRow key={row.provider} name={routeOf(row)} totals={row} />
        ))}
      </View>
      <MoneyLegend />
    </Card>
  );
}

/** Who drove the calls: the main agent, the sub-agents it spawned, the browser, the compactions. */
function Callers({ rows }: { rows: StatsCallerRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.calls, 0) || 1;
  return (
    <Card>
      <CardHead title="source" trailing={`${rows.length}`} />
      <View style={styles.rank}>
        {rows.map(row => (
          <View key={row.caller}>
            <RankRow name={callerLabel(row.caller)} totals={row} detail={`${Math.round((row.calls / total) * 100)}% of calls`} />
            <Meter pct={(row.calls / total) * 100} />
          </View>
        ))}
      </View>
    </Card>
  );
}

function CacheFold({ cache }: { cache: StatsCache }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Card>
      <CardHead title="cache" trailing={`${cache.readSharePct.toFixed(1)}% read · ${cache.writeSharePct.toFixed(1)}% written`} />
      <View style={styles.cacheBody}>
        <Text style={styles.cardNote}>{`${shortTokens(cache.promptTokens)} prompt tokens in total`}</Text>
        <Text style={styles.cardNote}>{`${shortTokens(cache.cacheReadTokens)} served from cache · ${cache.readSharePct.toFixed(1)}%`}</Text>
        <Meter pct={cache.readSharePct} />
        <Text style={styles.cardNote}>{`${shortTokens(cache.cacheWriteTokens)} written to cache · ${cache.writeSharePct.toFixed(1)}%`}</Text>
        <Meter pct={cache.writeSharePct} />
        <Text style={styles.codeNote}>both are subsets of the prompt tokens above, billed at their own rate.</Text>
      </View>
    </Card>
  );
}

/** How often a model or a host failed, and how long it made us wait. Worst first, as sent. */
function Reliability({ rows }: { rows: StatsReliabilityRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  const worst = rows.reduce((best, row) => (row.errorRatePct > best.errorRatePct ? row : best), rows[0]);
  return (
    <Card>
      <CardHead
        title="reliability"
        trailing={worst.errors > 0 ? `worst ${worst.key} ${worst.errorRatePct.toFixed(1)}%` : 'no error recorded'}
      />
      <View style={styles.rank}>
        {rows.map(row => (
          <View key={`${row.kind}\u0000${row.key}`} style={styles.rankRow}>
            <View style={styles.rankTop}>
              <Text style={styles.rankName} numberOfLines={1}>
                {row.key}
              </Text>
              <Text style={styles.badge}>{row.kind}</Text>
              <Text style={[styles.rankCost, row.errors > 0 && styles.rankCostWarn]}>{`${row.errorRatePct.toFixed(1)}%`}</Text>
            </View>
            <Text style={styles.rankNums}>
              {`${row.calls} calls · ${row.errors} err · ${duration(row.avgDurationMs)} avg`}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.codeNote}>mean latency only: the rollup keeps sums, not distributions.</Text>
    </Card>
  );
}

/** What an outcome is called on the page: the success a tool read out of an exit that looked bad. */
const OUTCOME_LABELS: Record<string, string> = {
  'no-match': 'no match',
  differ: 'differs',
  'noop-skipped': 'unchanged edits skipped',
};

/** A tool call is milliseconds more often than minutes: `duration` would print most of them as 0s. */
function toolDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return duration(ms);
}

/** A share, one decimal, with the 0 kept: "0.0%" says "measured, none", a blank says nothing. */
export function toolFailurePct(row: Pick<StatsToolRow, 'calls' | 'failures'>): string {
  return `${row.calls > 0 ? ((100 * row.failures) / row.calls).toFixed(1) : '0.0'}%`;
}

/**
 * The lines under a tool's name: the volume and what the model did after a failure, then the
 * successes that would have been failures before the fix. Exported for its own test.
 */
export function toolRowLines(row: StatsToolRow): string[] {
  const volume = [`${row.calls} calls`, `${row.failures} failed`];
  if (row.failures > 0) volume.push(`${row.retried} retried`, `${row.switched} switched tool`);
  volume.push(`${toolDuration(row.avgDurationMs)} avg`);
  const lines = [volume.join(' · ')];
  const outcomes = Object.entries(row.outcomes)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${OUTCOME_LABELS[key] ?? key}`);
  if (outcomes.length > 0) lines.push(`answered, not failed: ${outcomes.join(' · ')}`);
  return lines;
}

/**
 * How each tool fared for the model. The failure rate is what the model was told, so a false
 * failure (a search that found nothing reported as "exit code 1") shows here as a rate; "switched
 * tool" is the model routing around this one after it failed, which is the cost the rate hides.
 */
function Tools({ tools }: { tools?: StatsTools }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (!tools) {
    return (
      <Card>
        <CardHead title="tools" />
        <Text style={styles.cardNote}>this server does not record tool calls yet: update it.</Text>
      </Card>
    );
  }
  const calls = tools.rows.reduce((n, row) => n + row.calls, 0);
  const failures = tools.rows.reduce((n, row) => n + row.failures, 0);
  return (
    <Card>
      <CardHead title="tools" trailing={calls > 0 ? `${calls} calls · ${toolFailurePct({ calls, failures })} failed` : undefined} />
      {!tools.backfilled ? <Text style={styles.codeNote}>reading the past conversations in: the history is still filling.</Text> : null}
      {!tools.filterApplied ? (
        <Text style={styles.codeNote}>the filter reaches tools by conversation and source only: this is the whole window.</Text>
      ) : null}
      {tools.rows.length === 0 ? <Text style={styles.cardNote}>no tool was called in this window.</Text> : null}
      <View style={styles.rank}>
        {tools.rows.map(row => (
          <View key={row.tool} style={styles.rankRow}>
            <View style={styles.rankTop}>
              <Text style={[styles.rankName, styles.mono]} numberOfLines={1}>
                {row.tool}
              </Text>
              <Text style={[styles.rankCost, row.failures > 0 && styles.rankCostWarn]}>{toolFailurePct(row)}</Text>
            </View>
            {toolRowLines(row).map(line => (
              <Text key={line} style={styles.rankNums}>
                {line}
              </Text>
            ))}
            {row.topErrors.map(error => (
              <Text key={error.kind} style={styles.codeNote} numberOfLines={2}>
                {`${error.count}× ${error.kind}`}
              </Text>
            ))}
          </View>
        ))}
      </View>
      {tools.since ? <Text style={styles.codeNote}>{`recorded since ${tools.since.slice(0, 10)}.`}</Text> : null}
    </Card>
  );
}

/**
 * The account's own ledger beside ours, one entry per provider that publishes one. Ruled off at
 * the foot of the page because it is about the key rather than about anything above it -- which is
 * exactly why it does not belong on a conversation's status page.
 */
function Reconciliation({ entries }: { entries: StatsReconciliation[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHead title="reconciliation" />
      {entries.map(entry => {
        const [figures, note] = statsReconciliationLines(entry);
        return (
          <View key={entry.provider} style={styles.reconcileRow}>
            <Text style={styles.cardNote}>{figures}</Text>
            <Text style={styles.codeNote}>{note}</Text>
          </View>
        );
      })}
    </Card>
  );
}

function Meter({ pct }: { pct: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerMain: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  headerSub: { fontSize: font.small, color: palette.textFaint },
  periods: { flexDirection: 'row' as const, gap: space.xs, paddingTop: space.md },
  period: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
  },
  periodOn: { backgroundColor: palette.accent },
  periodText: { fontSize: font.small, color: palette.textMuted },
  periodTextOn: { color: palette.accentText, fontWeight: '600' as const },
  // The filter row sits above the tabs because it narrows all of them: one row of dimensions, six
  // tabs answering through it.
  chips: { flexDirection: 'row' as const, gap: space.xs, paddingTop: space.sm, alignItems: 'center' as const },
  /** A row of chips or tabs takes exactly the height of its content: see the comment at the
   *  ScrollView. Without it the row is a flex item that grows and shrinks with the page. */
  strip: { flexGrow: 0, flexShrink: 0 },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: font.micro, color: palette.textMuted, maxWidth: 170 },
  chipTextOn: { color: palette.accentText, fontWeight: '600' as const },
  chipClear: { borderColor: palette.warn },
  chipClearText: { fontSize: font.micro, color: palette.warn },
  tabs: { flexDirection: 'row' as const, gap: space.md, paddingTop: space.md, alignItems: 'center' as const },
  tab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingBottom: space.xs, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: palette.accent },
  tabText: { fontSize: font.meta, color: palette.textMuted },
  tabTextOn: { color: palette.text, fontWeight: '600' as const },
  empty: { paddingHorizontal: space.xl, paddingVertical: space.md, fontSize: font.body, color: palette.textFaint },
  none: { alignItems: 'flex-start' as const, paddingTop: space.md },
  spacer: { paddingTop: space.xs },
  failure: { alignItems: 'flex-start' as const, gap: space.sm },
  retry: {
    marginLeft: space.xl,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  retryText: { fontSize: font.small, color: palette.text },
  body: { paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.xs,
  },
  cardHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  cardTitle: {
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  cardTrailing: { fontSize: font.meta, color: palette.textMuted },
  cardNote: { fontSize: font.small, color: palette.textMuted },
  codeNote: { fontSize: font.micro, color: palette.textFaint },
  // The frontier between the two horizons: said in the sections it actually bounds, and ruled
  // off so it does not read as one more figure.
  frontier: {
    fontSize: font.micro,
    color: palette.warn,
    borderLeftWidth: 2,
    borderLeftColor: palette.warn,
    paddingLeft: space.sm,
  },
  heroFigures: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: space.md },
  heroSide: { alignItems: 'flex-end' as const },
  hero: { fontSize: 28, lineHeight: 32, fontWeight: '700' as const, color: palette.text },
  heroUnit: { fontSize: font.body, color: palette.textFaint },
  chart: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    height: CHART_HEIGHT,
    gap: 1,
    marginTop: space.xs,
  },
  barSlot: { flex: 1, justifyContent: 'flex-end' as const, minWidth: 2 },
  bar: { backgroundColor: palette.accent, borderRadius: 1 },
  chartAxis: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  rank: { marginTop: space.xs, borderTopWidth: 1, borderTopColor: palette.border },
  rankRow: { paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: palette.border, gap: 1 },
  rankTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  rankName: { flex: 1, fontSize: font.meta, color: palette.text },
  rankNameMuted: { color: palette.textFaint },
  mono: { fontFamily: 'monospace', fontSize: font.small },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
  },
  rankCost: { fontSize: font.small, fontWeight: '600' as const, color: palette.text },
  rankCostWarn: { color: palette.warn },
  rankNums: { fontSize: font.micro, color: palette.textFaint },
  cacheBody: { gap: space.xs, paddingHorizontal: space.sm, paddingBottom: space.sm },
  meterTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden' as const,
  },
  meterFill: { height: 6, borderRadius: radius.pill, backgroundColor: palette.accent },
  reconcileRow: { paddingTop: space.xs, gap: space.xxs },
});
