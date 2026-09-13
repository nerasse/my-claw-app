import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { connection } from '../core/connection';
import { statsStore, useStats, DEFAULT_STATS_PERIOD } from '../core/stats';
import { encodeStatsGet } from '../core/protocol';
import type {
  StatsCache,
  StatsCallerRow,
  StatsDayRow,
  StatsModelRow,
  StatsPayload,
  StatsPeriod,
  StatsProviderRow,
  StatsReconciliation,
  StatsReliabilityRow,
  StatsSessionRow,
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
 * page. It lives here, at the bottom, with the rest of what is true of the key rather than of a
 * thread.
 *
 * One request, one answer: nothing pushes an install-wide total, so the page asks on open and on
 * every period press, and says so when the answer is refused.
 */

const PERIODS: readonly StatsPeriod[] = ['7d', '30d', '90d', 'all'];

/** How many conversations the ranking draws before it folds the rest into one line. */
const SESSION_ROWS = 12;

/** Height of the daily bars, in points: the track is fixed so a bar can be a share of it. */
const CHART_HEIGHT = 44;

/** An id is truncated to this before it is drawn, tail kept: the distinctive half is the last one. */
const ID_MAX = 30;

function short(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  return n.toLocaleString('en-US');
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
 * The money of a set of rows, on separate lines, and that is the point: `billedUsd` is what
 * something charged and `referenceUsd` is what the same traffic would have cost at list price.
 * One is an invoice and the other is a catalogue. Added together they would make a figure nobody
 * owes and nobody has, so they never share a line, let alone a sum.
 *
 * `unpriced` rides with them because calls counted with no money behind them are information: the
 * totals above include their tokens, the amounts below do not.
 *
 * Exported for its own test.
 */
export function totalsMoneyLines(t: StatsTotals): string[] {
  const lines = [`billed ${money(t.billedUsd)} · what was actually charged`];
  if (t.referenceUsd > 0) {
    lines.push(`reference ${money(t.referenceUsd)} · list price, not a charge`);
  }
  if (t.unpriced > 0) {
    lines.push(`${t.unpriced} call${t.unpriced === 1 ? '' : 's'} nothing could price · counted above, absent from the money`);
  }
  return lines;
}

/**
 * One row's money in the width a ranking has: the billed sum, then the reference sum marked `*`.
 * Two figures side by side, never one -- the separator is a `·` and not a `+` for that reason.
 *
 * Exported for its own test.
 */
export function rowMoney(t: StatsTotals): string {
  const parts: string[] = [];
  if (t.billedUsd > 0) parts.push(money(t.billedUsd));
  if (t.referenceUsd > 0) parts.push(`*${money(t.referenceUsd)}`);
  if (parts.length > 0) return parts.join(' · ');
  return t.unpriced > 0 ? 'unpriced' : money(0);
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
  if (r.providerUnread || r.providerUsd === undefined || r.deltaUsd === undefined) {
    return [`${r.provider} · we recorded ${money(r.recordedUsd)}`, `${covered} · provider not reached`];
  }
  return [
    `${r.provider} · they charged ${money(r.providerUsd)} · we recorded ${money(r.recordedUsd)} · gap ${gap(r.deltaUsd)}`,
    [covered, 'their figure runs from the key, not the window', r.balanceUsd === undefined ? null : `balance ${money(r.balanceUsd)}`]
      .filter(Boolean)
      .join(' · '),
  ];
}

/** Calls, tokens and wall time: the line every ranking row carries under its name. */
function volumeLine(t: StatsTotals): string {
  return [
    `${t.calls}x`,
    `${short(t.promptTokens)} in`,
    t.cacheReadTokens > 0 ? `${short(t.cacheReadTokens)} cached` : null,
    `${short(t.completionTokens)} out`,
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

export function StatsScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const stats = useStats();
  useDismissKeyboard();

  const ask = useCallback((period: StatsPeriod) => {
    statsStore.open(period);
    connection.send(encodeStatsGet(period)).catch(() => {});
  }, []);

  // Asked on every opening: these are install-wide figures and nothing pushes them, so a payload
  // kept from a previous visit would be however old that visit is.
  useEffect(() => {
    ask(DEFAULT_STATS_PERIOD);
  }, [ask]);

  const payload = stats.payload;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close statistics">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Statistics</Text>
          <Text style={styles.headerSub}>{`every conversation of this install · ${periodLabel(stats.period)}`}</Text>
        </View>
      </View>

      <View style={styles.periods}>
        {PERIODS.map(period => (
          <Pressable
            key={period}
            onPress={() => ask(period)}
            style={[styles.period, period === stats.period && styles.periodOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: period === stats.period }}
            accessibilityLabel={`Period ${period}`}>
            <Text style={[styles.periodText, period === stats.period && styles.periodTextOn]}>{period}</Text>
          </Pressable>
        ))}
      </View>

      {stats.fetch === 'loading' ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : stats.fetch === 'error' ? (
        <View style={styles.failure}>
          <Text style={styles.empty}>{stats.error}</Text>
          <Pressable
            onPress={() => ask(stats.period)}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Ask again">
            <Text style={styles.retryText}>ask again</Text>
          </Pressable>
        </View>
      ) : payload ? (
        payload.totals.calls === 0 ? (
          <Text style={styles.empty}>{`nothing was called in this window (${periodLabel(payload.period)}).`}</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <TotalsCard stats={payload} />
            <Timeline stats={payload} />
            <Sessions stats={payload} />
            <Models rows={payload.models} />
            <Providers rows={payload.providers} />
            <Callers rows={payload.callers} />
            <CacheFold cache={payload.cache} />
            <Reliability rows={payload.reliability} />
            <Reconciliation entries={payload.reconciliation} />
          </ScrollView>
        )
      ) : null}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.card}>{children}</View>;
}

function CardHead({ title, trailing }: { title: string; trailing?: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {trailing ? <Text style={styles.cardTrailing}>{trailing}</Text> : null}
    </View>
  );
}

function Fold({
  label,
  hint,
  initiallyOpen,
  children,
}: {
  label: string;
  hint?: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(initiallyOpen === true);
  return (
    <View style={styles.fold}>
      <Pressable
        onPress={() => setOpen(value => !value)}
        style={styles.foldHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}>
        <Text style={styles.foldGlyph}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.foldLabel}>{label}</Text>
        {hint ? (
          <Text style={styles.foldHint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </Pressable>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

/** One ranking line: a name, what it cost, and the volume behind it. */
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
 * What the install spent, and the two figures that must never become one. The hero is the billed
 * sum because that is the only one anybody was actually asked to pay; the reference sits under it,
 * named for what it is.
 */
function TotalsCard({ stats }: { stats: StatsPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const t = stats.totals;
  const reach = stats.rollupIncluded && stats.totalsSince ? `from ${stats.totalsSince}, rollup included` : null;
  return (
    <Card>
      <CardHead title={`total · ${periodLabel(stats.period)}`} trailing={`${t.calls} calls`} />
      <View style={styles.heroRow}>
        <Text style={styles.hero}>{money(t.billedUsd)}</Text>
        <Text style={styles.heroUnit}>billed</Text>
      </View>
      {totalsMoneyLines(t)
        .slice(1)
        .map(line => (
          <Text key={line} style={styles.cardNote}>
            {line}
          </Text>
        ))}
      <Text style={styles.cardNote}>
        {`${short(t.promptTokens)} in · ${short(t.completionTokens)} out · ${short(t.cacheReadTokens)} cache read · ${short(
          t.cacheWriteTokens,
        )} cache written`}
      </Text>
      <Text style={styles.cardNote}>
        {`${duration(t.durationMs)} inside the API${t.errors > 0 ? ` · ${t.errors} errors` : ' · no errors'}`}
      </Text>
      {reach ? <Text style={styles.codeNote}>{reach}</Text> : null}
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
 */
function Sessions({ stats }: { stats: StatsPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const note = horizonNote(stats);
  const rows = stats.sessions;
  const shown = rows.slice(0, SESSION_ROWS);
  const rest = rows.slice(SESSION_ROWS);
  const deleted = rows.filter(row => row.deleted).length;
  return (
    <Card>
      <CardHead title="conversations" trailing={`${rows.length}`} />
      {deleted > 0 ? (
        <Text style={styles.cardNote}>{`${deleted} of them no longer exist on disk; their calls do.`}</Text>
      ) : null}
      {note ? <Text style={styles.frontier}>{note}</Text> : null}
      <View style={styles.rank}>
        {shown.map(row => {
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
      {rows.length === 0 ? <Text style={styles.cardNote}>no conversation recorded in this window.</Text> : null}
      {rest.length > 0 ? (
        <Text style={styles.codeNote}>{`+ ${rest.length} more, ${rest.filter(row => row.deleted).length} of them deleted`}</Text>
      ) : null}
    </Card>
  );
}

function Models({ rows }: { rows: StatsModelRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <Fold label="models" hint={`${rows.length} · top ${rows[0].model}`} initiallyOpen>
      <View style={styles.rank}>
        {rows.map(row => (
          <RankRow key={`${row.model}\u0000${row.provider}\u0000${row.variant ?? ''}`} name={row.model} detail={routeOf(row)} totals={row} />
        ))}
      </View>
      <Text style={styles.codeNote}>* list price, not a charge</Text>
    </Fold>
  );
}

function Providers({ rows }: { rows: StatsProviderRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <Fold label="providers" hint={`${rows.length} · top ${routeOf(rows[0])}`}>
      <View style={styles.rank}>
        {rows.map(row => (
          <RankRow key={row.provider} name={routeOf(row)} totals={row} />
        ))}
      </View>
    </Fold>
  );
}

/** Who drove the calls: the orchestrator, the sub-agents it spawned, the browser, the compactions. */
function Callers({ rows }: { rows: StatsCallerRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.calls, 0) || 1;
  return (
    <Fold label="callers" hint={rows.map(row => `${row.caller} ${Math.round((row.calls / total) * 100)}%`).join(' · ')}>
      <View style={styles.rank}>
        {rows.map(row => (
          <View key={row.caller}>
            <RankRow name={row.caller} totals={row} detail={`${Math.round((row.calls / total) * 100)}% of calls`} />
            <Meter pct={(row.calls / total) * 100} />
          </View>
        ))}
      </View>
    </Fold>
  );
}

function CacheFold({ cache }: { cache: StatsCache }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Fold label="cache" hint={`${cache.readSharePct.toFixed(1)}% read · ${cache.writeSharePct.toFixed(1)}% written`}>
      <View style={styles.cacheBody}>
        <Text style={styles.cardNote}>{`${short(cache.promptTokens)} prompt tokens in total`}</Text>
        <Text style={styles.cardNote}>{`${short(cache.cacheReadTokens)} served from cache · ${cache.readSharePct.toFixed(1)}%`}</Text>
        <Meter pct={cache.readSharePct} />
        <Text style={styles.cardNote}>{`${short(cache.cacheWriteTokens)} written to cache · ${cache.writeSharePct.toFixed(1)}%`}</Text>
        <Meter pct={cache.writeSharePct} />
        <Text style={styles.codeNote}>both are subsets of the prompt tokens above, billed at their own rate.</Text>
      </View>
    </Fold>
  );
}

/** How often a model or a host failed, and how long it made us wait. Worst first, as sent. */
function Reliability({ rows }: { rows: StatsReliabilityRow[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (rows.length === 0) return null;
  const worst = rows.reduce((best, row) => (row.errorRatePct > best.errorRatePct ? row : best), rows[0]);
  return (
    <Fold
      label="reliability"
      hint={worst.errors > 0 ? `worst ${worst.key} ${worst.errorRatePct.toFixed(1)}%` : 'no error recorded'}>
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
    </Fold>
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
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
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
  empty: { padding: space.xl, fontSize: font.body, color: palette.textFaint },
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
    alignItems: 'baseline' as const,
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
  heroRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: space.sm },
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
  fold: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  foldHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  foldGlyph: { fontSize: font.meta, color: palette.textFaint, width: 12 },
  foldLabel: {
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  foldHint: { flex: 1, fontSize: font.micro, color: palette.textFaint, textAlign: 'right' as const },
  foldBody: { paddingHorizontal: space.sm, paddingBottom: space.sm },
});
