import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useStatus } from '../core/status';
import { withoutEndpoint } from '../core/model';
import { subAgentsUsage } from '../core/usage';
import type { StatusPayload, UsageAgent, UsageModelRow, UsageOwn, UsageTotals } from '../core/protocol';

/**
 * The status page of a conversation, drawn from the structured `/status` report the server pushes
 * for as long as the page is open (docs/status-page.md). It lives outside the conversation and
 * outside the agent's context: a command never reaches the model. Opened from the thread menu or
 * by typing `/status`, it is a page of the shell like settings: beside the conversation on a wide
 * window, in its place on a phone.
 *
 * Laid out by what a glance needs: how full the context is, what the conversation has cost in
 * total (its own calls and every sub-agent it drove), then who spent what. Ids, provenance and
 * tuning are one tap away rather than in the way.
 */

function short(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  return n.toLocaleString('en-US');
}

function money(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function duration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
}

/** The one figure for a set of rows: what was charged plus what it would have cost. */
function cost(t: UsageTotals): number {
  return t.billedUsd + t.referenceUsd;
}

/** A priced row's cost with its markers: `*` not a charge, `~` a neighbouring model's price. */
function rowCost(row: UsageModelRow): string {
  if (row.costUsd === undefined) return '-';
  return `${row.costBilled ? '' : '*'}${row.costApproximate ? '~' : ''}${money(row.costUsd)}`;
}

/** One figure for a set of rows, `-` when there is nothing priced behind it. */
function totalsCost(t: UsageTotals): string {
  return t.unpriced > 0 && cost(t) === 0 ? '-' : money(cost(t));
}

/** Calls, tokens in and out, with the errors when there are any. */
function totalsLine(t: UsageTotals): string {
  return `${t.calls}× · ${short(t.promptTokens)} in · ${short(t.completionTokens)} out`;
}

/** A model's line: tokens in, cached and out, with the errors when there are any. */
function rowLine(row: UsageModelRow): string {
  return `${row.calls}× · ${short(row.promptTokens)} in${
    row.cacheReadTokens > 0 ? ` · ${short(row.cacheReadTokens)} cached` : ''
  } · ${short(row.completionTokens)} out${row.errors > 0 ? ` · ${row.errors} err` : ''}`;
}

/**
 * Where the calls went, without the route: `streamlake · fp8`, `api.anthropic.com`. Absent on a
 * server that predates the field, which is why it is optional rather than defaulted.
 */
function rowRoute(row: UsageModelRow): string {
  return [row.provider, row.variant].filter(Boolean).join(' · ');
}

/**
 * The models behind a figure, each over two lines: the name and its price first, where the calls
 * went, which rung priced them, and what they cost in tokens under that.
 */
function rowDetail(row: UsageModelRow): string {
  return [rowRoute(row), rowLine(row), row.costSource].filter(Boolean).join(' · ');
}

/**
 * The model's own name: the tail of the reference once its endpoint pin is off.
 *
 * The pin is a route (`@streamlake/fp8`), not part of the name, and it is where a name cut from the
 * whole reference used to come from: `fp8` is a quantization and `flex` a service tier, and both
 * were being drawn as models of their own.
 */
function rowName(row: UsageModelRow): string {
  const bare = withoutEndpoint(row.model);
  return bare.split('/').pop() ?? bare;
}

export function StatusScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const status = useStatus();
  useDismissKeyboard();
  const payload = status.payload;
  // Two lines because the model id is the long part. Glued to the tag it ran out of width and the
  // phone cut the model, which is the one thing the header exists to say.
  const headerModel = payload ? payload.model.current : 'this conversation';
  const headerNotes = payload
    ? [
        payload.model.tag ? `tag ${payload.model.tag}` : null,
        payload.model.effort ? `effort ${payload.model.effort}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close status">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Status</Text>
          <Text style={styles.headerSub}>{headerModel}</Text>
          {headerNotes ? <Text style={styles.headerNotes}>{headerNotes}</Text> : null}
        </View>
        {status.fetch === 'ready' ? (
          <View style={styles.live} accessibilityLabel="Live: the page follows the conversation">
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>live</Text>
          </View>
        ) : null}
      </View>

      {status.fetch === 'loading' ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : status.fetch === 'error' ? (
        <Text style={styles.empty}>{status.error}</Text>
      ) : payload ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <RunStrip payload={payload} />
          <ContextCard payload={payload} />
          <UsageCard payload={payload} />
          <DetailsFold payload={payload} />
        </ScrollView>
      ) : null}
    </View>
  );
}

/** What is going on right now: the live run tree, a compaction in progress. Nothing when idle. */
function RunStrip({ payload }: { payload: StatusPayload }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const r = payload.runtime;
  if (r.runs.length === 0 && !r.compacting) return null;
  const parts = [...r.runs]
    .sort((a, b) => a.depth - b.depth)
    .map(run => (run.depth === 0 ? run.label : `${run.label}[${run.depth}]`));
  if (r.compacting) parts.push('compacting');
  return (
    <View style={styles.runBadge}>
      <Text style={styles.runBadgeText}>{`running · ${parts.join(', ')}`}</Text>
    </View>
  );
}

function Fold({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
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

function Row({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{label}</Text>
      <Text style={[styles.rowValue, monospace && styles.rowValueMono]} selectable>
        {value}
      </Text>
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

/** The one thing worth a glance: how close this conversation is to auto-compaction. */
function ContextCard({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const c = payload.context;
  const limit = payload.model.contextLimit;
  const occupiedPct = limit > 0 ? (c.occupied / limit) * 100 : 0;
  const overThreshold = c.autoCompactOn && occupiedPct >= c.autoCompactThresholdPct;
  const color = overThreshold ? styles.barWarn.color : styles.barFill.color;
  return (
    <Card>
      <CardHead title="context" trailing={`${occupiedPct.toFixed(1)}%`} />
      <View style={styles.heroRow}>
        <Text style={styles.hero}>{short(c.occupied)}</Text>
        <Text style={styles.heroUnit}>{`/ ${short(limit)}`}</Text>
      </View>
      <Meter pct={Math.min(100, occupiedPct)} color={color} />
      <Text style={[styles.cardNote, overThreshold && styles.cardNoteWarn]}>
        {c.autoCompactOn
          ? `auto-compact at ${c.autoCompactThresholdPct}% · ${short(c.autoCompactThresholdTokens)}${
              overThreshold ? ' · reached' : ''
            }`
          : 'auto-compact off'}
      </Text>
      <Text style={styles.cardNote}>
        {c.measured ? `last call measured ${short(c.measured.tokens)}` : 'no call recorded yet'}
      </Text>
    </Card>
  );
}

function Meter({ pct, color }: { pct: number; color: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

/**
 * Everything the conversation has spent, total first: its own calls and every sub-agent it drove
 * are one figure, then one row each, a sub-agent's own sub-agents indented under it. A row unfolds
 * into the models it used.
 */
function UsageCard({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const u = payload.usage;
  if (!u) {
    return (
      <Card>
        <CardHead title="usage" />
        <Text style={styles.cardNote}>nothing has been called here yet.</Text>
      </Card>
    );
  }
  const t = u.total;
  const tokens = t.promptTokens + t.completionTokens;
  const split = t.billedUsd > 0 && t.referenceUsd > 0;
  const hasReference = t.referenceUsd > 0;
  const hasApproximate = [...u.own.rows, ...u.agents.flatMap(a => a.rows)].some(r => r.costApproximate);
  const legend = [
    hasReference ? '* not a charge' : null,
    hasApproximate ? '~ neighbouring model id' : null,
    t.unpriced > 0 ? `${t.unpriced} model(s) unpriced` : null,
    u.since ? `since ${u.since.slice(0, 10)} (90 days)` : null,
  ].filter(Boolean);
  return (
    <Card>
      <CardHead title="usage · total" trailing={money(cost(t))} />
      <Text style={styles.cardNote}>
        {`${short(tokens)} tokens · ${short(t.promptTokens)} in · ${short(t.cacheReadTokens)} cached · ${short(
          t.completionTokens,
        )} out · ${t.calls} calls${t.errors > 0 ? ` · ${t.errors} errors` : ''}`}
      </Text>
      {split ? (
        <Text style={styles.cardNote}>{`billed ${money(t.billedUsd)} · reference ${money(t.referenceUsd)}`}</Text>
      ) : hasReference ? (
        <Text style={styles.cardNote}>reference price, not a charge</Text>
      ) : null}
      <View style={styles.tree}>
        <MainUsage own={u.own} />
        <SubAgents agents={u.agents} />
      </View>
      {legend.length > 0 ? <Text style={styles.codeNote}>{legend.join(' · ')}</Text> : null}
    </Card>
  );
}

/**
 * The conversation's own calls, open. It is the figure every other one is read against, and
 * folding it asked for a tap to answer the page's own question.
 */
function MainUsage({ own }: { own: UsageOwn }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.usageRow}>
      <View style={styles.usageHead}>
        <View style={styles.usageWho}>
          <Text style={styles.usageName} numberOfLines={1}>
            this conversation
          </Text>
          {own.durationMs > 0 ? (
            <Text style={styles.usageHint} numberOfLines={1}>{`${duration(own.durationMs)} of API time`}</Text>
          ) : null}
        </View>
        <Text style={styles.usageNums} numberOfLines={1}>
          {totalsLine(own)}
        </Text>
        <Text style={styles.usageCost}>{totalsCost(own)}</Text>
      </View>
      <ModelTable rows={own.rows} />
    </View>
  );
}

/**
 * The models behind a figure, each over two lines: the name and its price first, where the calls
 * went and what they cost in tokens under them. Squeezed onto one line the name had about five
 * characters, which is not a model anybody can tell from its neighbour.
 */
function ModelTable({ rows }: { rows: UsageModelRow[] }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.modelTable}>
      {rows.length === 0 ? <Text style={styles.codeNote}>no call of its own</Text> : null}
      {rows.map((row, index) => (
        <View key={`${row.model}-${index}`} style={styles.modelRow}>
          <View style={styles.modelTop}>
            <Text style={styles.modelName} numberOfLines={1}>
              {rowName(row)}
            </Text>
            <Text style={styles.modelCost}>{rowCost(row)}</Text>
          </View>
          <Text style={styles.modelNums} numberOfLines={1}>
            {rowDetail(row)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Every sub-agent of the conversation as one figure: what the delegation cost in calls, tokens and
 * money, with the models they all ran on merged by id. The per-agent cards sit one tap below -- a
 * recap is read for the total, and with five workers their names are what it is read past.
 */
function SubAgents({ agents }: { agents: UsageAgent[] }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const recap = subAgentsUsage(agents);
  if (!recap) return null;
  return (
    <View style={styles.usageRow}>
      <View style={styles.usageHead}>
        <View style={styles.usageWho}>
          <Text style={styles.usageName} numberOfLines={1}>
            {agents.length === 1 ? '1 sub-agent' : `${agents.length} sub-agents`}
          </Text>
        </View>
        <Text style={styles.usageNums} numberOfLines={1}>
          {totalsLine(recap.totals)}
        </Text>
        <Text style={styles.usageCost}>{totalsCost(recap.totals)}</Text>
      </View>
      <ModelTable rows={recap.rows} />
      <Pressable
        onPress={() => setOpen(value => !value)}
        style={styles.usageHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="By sub-agent">
        <Text style={styles.foldGlyph}>{open ? '▾' : '▸'}</Text>
        <View style={styles.usageWho}>
          <Text style={styles.usageName} numberOfLines={1}>
            by sub-agent
          </Text>
        </View>
      </Pressable>
      {open
        ? agents.map(agent => <AgentRow key={agent.sessionId} agent={agent} />)
        : null}
    </View>
  );
}

function AgentRow({ agent }: { agent: UsageAgent }): React.JSX.Element {
  const shape = [agent.type, agent.alive ? null : 'gone'].filter(Boolean).join(' · ');
  return (
    <UsageRow
      label={agent.displayName}
      hint={shape || undefined}
      running={agent.running}
      totals={agent}
      rows={agent.rows}
      depth={agent.depth}
    />
  );
}

/** One sub-agent: who, then calls, in, out, cost. Unfolds into its per-model lines. */
function UsageRow({
  label,
  hint,
  running,
  totals,
  rows,
  depth,
}: {
  label: string;
  hint?: string;
  running?: boolean;
  totals: UsageTotals;
  rows: UsageModelRow[];
  depth: number;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const indent = Math.max(0, depth - 1) * space.lg;
  return (
    <View style={[styles.usageRow, { marginLeft: indent }]}>
      <Pressable
        onPress={() => setOpen(value => !value)}
        style={styles.usageHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Usage of ${label}`}>
        <Text style={styles.foldGlyph}>{open ? '▾' : '▸'}</Text>
        <View style={styles.usageWho}>
          <View style={styles.usageNameRow}>
            {running ? <View style={styles.runningDot} accessibilityLabel={`${label} is running`} /> : null}
            <Text style={styles.usageName} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {hint ? (
            <Text style={styles.usageHint} numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Text style={styles.usageNums} numberOfLines={1}>
          {totalsLine(totals)}
        </Text>
        <Text style={styles.usageCost}>{totalsCost(totals)}</Text>
      </Pressable>
      {open ? <ModelTable rows={rows} /> : null}
    </View>
  );
}

/** Where a model choice comes from, spelled. `agent-file` and `agent` are two ways of saying a pin. */
const MODEL_ORIGIN: Record<string, string> = {
  session: 'this conversation',
  agent: 'the agent config',
  'agent-file': 'the agent file',
  global: 'the global default',
};

/** The rung an effort comes from, spelled: the level alone cannot say which one is answering. */
const EFFORT_RUNG: Record<string, string> = {
  session: 'this conversation',
  tag: 'the model tag',
  scope: 'the agent',
  config: 'the global default',
  'api-default': 'the API default',
  'provider-default': 'the provider default',
  unsupported: 'discarded by the model',
};

/** The effort with its rung, or the reason there is none. */
function effortValue(model: StatusPayload['model']): string {
  const rung = EFFORT_RUNG[model.effortSource ?? ''] ?? model.effortSource ?? '';
  if (model.effortSource === 'unsupported') return rung;
  return model.effort ? `${model.effort} · ${rung}` : `none set · ${rung}`;
}

/** Everything true but rarely asked: dates, ids, window provenance, tuning, approvals. */
function DetailsFold({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const s = payload.session;
  const r = payload.runtime;
  const c = payload.context;
  return (
    <Fold label="details" hint="dates, ids, context window, tuning">
      <Card>
        {s ? <Row label="started" value={`${s.createdAt.slice(0, 16).replace('T', ' ')} · ${ago(s.createdAt)}`} /> : null}
        {s ? <Row label="last active" value={ago(s.lastActiveAt)} /> : null}
        {s ? <Row label="turns" value={String(s.turns)} /> : null}
        {s ? <Row label="session id" value={s.id} monospace /> : null}
        {s?.subAgent ? (
          <Row label="sub-agent" value={`${s.subAgent.displayName} (${s.subAgent.type}, ${s.subAgent.visibility})`} />
        ) : null}
        {s?.subAgent ? <Row label="spawned by" value={s.subAgent.parentSessionId} monospace /> : null}
        <Row label="context limit" value={`${short(payload.model.contextLimit)} · ${payload.model.contextNotes.join(', ')}`} />
        <Row label="estimated" value={`${short(c.estimated)} · chars/4, under-counts`} />
        <Row label="request wall" value={payload.model.timeout} />
        <Row label="current model" value={payload.model.current} monospace />
        {payload.model.source ? (
          <Row label="picked by" value={MODEL_ORIGIN[payload.model.source] ?? payload.model.source} />
        ) : null}
        {payload.model.defaultModel ? (
          <Row label="default model" value={payload.model.defaultModel} monospace />
        ) : null}
        {payload.model.defaultModel ? (
          <Text style={styles.codeNote}>
            The default is the fallback: it runs here unless this conversation picks its own, and it
            takes over when a model above it stops resolving.
          </Text>
        ) : null}
        {payload.model.effortSource ? (
          <Row label="current effort" value={effortValue(payload.model)} />
        ) : null}
        {payload.model.selfHosted ? <Row label="billing" value="self-hosted, no marginal cost" /> : null}
        <Row label="verbose" value={r.verbose ? 'on' : 'off'} />
        {r.approvedTools.length > 0 ? <Row label="approved" value={r.approvedTools.join(', ')} /> : null}
      </Card>
    </Fold>
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
  headerNotes: { fontSize: font.micro, color: palette.textFaint },
  live: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingRight: space.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
  liveText: { fontSize: font.micro, color: palette.textFaint, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  empty: { padding: space.xl, fontSize: font.body, color: palette.textFaint },
  body: { paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
  runBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
  },
  runBadgeText: { fontSize: font.small, fontWeight: '600' as const, color: palette.accent },
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
  cardTrailing: { fontSize: font.screen, fontWeight: '700' as const, color: palette.text },
  cardNote: { fontSize: font.small, color: palette.textMuted },
  cardNoteWarn: { color: palette.warn },
  heroRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: space.sm },
  hero: { fontSize: 28, lineHeight: 32, fontWeight: '700' as const, color: palette.text },
  heroUnit: { fontSize: font.body, color: palette.textFaint },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    paddingVertical: space.xs,
  },
  rowKey: { width: 96, fontSize: font.small, color: palette.textFaint, paddingTop: 1 },
  rowValue: { flex: 1, fontSize: font.meta, color: palette.text, textAlign: 'right' as const },
  rowValueMono: { fontFamily: 'monospace', fontSize: font.small },
  meterTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden' as const,
  },
  meterFill: { height: 6, borderRadius: radius.pill },
  barFill: { color: palette.accent },
  barWarn: { color: palette.warn },
  tree: { marginTop: space.xs, borderTopWidth: 1, borderTopColor: palette.border },
  usageRow: { borderBottomWidth: 1, borderBottomColor: palette.border },
  usageHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
  },
  usageWho: { flex: 1, minWidth: 0 },
  usageNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  usageName: { fontSize: font.meta, color: palette.text, flexShrink: 1 },
  usageHint: { fontSize: font.micro, color: palette.textFaint },
  runningDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent },
  usageNums: { fontSize: font.micro, color: palette.textFaint, flexShrink: 1 },
  usageCost: { width: 58, fontSize: font.small, fontWeight: '600' as const, color: palette.text, textAlign: 'right' as const },
  modelTable: { paddingLeft: space.lg, paddingBottom: space.sm, gap: space.xs },
  modelRow: { paddingVertical: space.xxs, gap: 1 },
  modelTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  modelName: { flex: 1, fontSize: font.small, color: palette.textMuted },
  modelNums: { fontSize: font.micro, color: palette.textFaint },
  modelCost: { width: 58, fontSize: font.small, color: palette.textMuted, textAlign: 'right' as const },
  codeNote: { fontSize: font.micro, color: palette.textFaint },
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