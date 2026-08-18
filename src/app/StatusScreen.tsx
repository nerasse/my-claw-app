import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useStatus } from '../core/status';
import type { StatusPayload } from '../core/protocol';
import { useLayerFrame } from '../core/layout';

/**
 * Fullscreen status page, drawn from the structured `/status` report. It lives outside the
 * conversation (and outside the agent's context -- a command never reaches the model), opened
 * from the thread menu or by typing `/status`. Rendered as an absolute layer of the shell, like
 * the image viewer, so the back key walks one level instead of closing the app.
 *
 * Laid out by what a phone glance actually needs: how full the context is, what it cost, then
 * the conversation itself. Ids, notes and the chat command's raw text are one tap away rather
 * than in the way. The chat text says "since /new", a command the app never surfaces -- here a
 * conversation is a thread, so the counters are simply this conversation's.
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

export function StatusScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const layerFrame = useLayerFrame();
  const insets = useSafeAreaInsets();
  const status = useStatus();
  useDismissKeyboard();
  const payload = status.payload;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, layerFrame]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
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
          <Text style={styles.headerSub} numberOfLines={1}>
            {payload ? payload.model.current : 'this conversation'}
            {payload?.model.tag ? ` · tag ${payload.model.tag}` : ''}
          </Text>
        </View>
      </View>

      {status.fetch === 'loading' ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : status.fetch === 'error' ? (
        <Text style={styles.empty}>{status.error}</Text>
      ) : payload ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {payload.runtime.activeRun !== 'none' ? (
            <View style={styles.runBadge}>
              <Text style={styles.runBadgeText}>{`running · ${payload.runtime.activeRun}`}</Text>
            </View>
          ) : null}
          <ContextCard payload={payload} />
          <StatGrid payload={payload} />
          <CostCard payload={payload} />
          <DelegatedCard payload={payload} />
          <ConversationCard payload={payload} />
          <DetailsFold payload={payload} />
          {status.text ? (
            <Fold label="raw output" hint="the chat command's text">
              <View style={styles.codeBlock}>
                <Text style={styles.code} selectable>
                  {status.text}
                </Text>
              </View>
            </Fold>
          ) : null}
        </ScrollView>
      ) : null}
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
        {`${c.measured ? `measured ${short(c.measured.tokens)}` : 'no call recorded yet'} · estimated ${short(
          c.estimated,
        )}${c.mirrorIsTranscript ? ' (whole log: the engine compacts its own history)' : ''}`}
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? (
        <Text style={styles.statSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Four numbers, no scrolling: what this conversation has spent in messages and tokens. */
function StatGrid({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const c = payload.conversation;
  return (
    <View style={styles.grid}>
      <Stat label="messages" value={payload.session ? String(payload.session.messages) : '-'} />
      <Stat label="calls" value={c ? String(c.calls) : '0'} />
      <Stat
        label="tokens in"
        value={c ? short(c.promptTokens) : '-'}
        sub={c && c.cacheReadTokens > 0 ? `cached ${short(c.cacheReadTokens)}` : undefined}
      />
      <Stat label="tokens out" value={c ? short(c.completionTokens) : '-'} />
    </View>
  );
}

function CostCard({ payload }: { payload: StatusPayload }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const a = payload.analytics;
  if (!a) return null;
  return (
    <Card>
      <CardHead title="cost · 90 days" trailing={money(a.billedUsd)} />
      <Text style={styles.cardNote}>
        {`${a.calls} calls · ${a.errors} errors${a.durationMs ? ` · ${duration(a.durationMs)} of API time` : ''}`}
      </Text>
      {a.referenceUsd > 0 ? (
        <Text style={styles.cardNote}>{`${money(a.referenceUsd)} reference · flat plans, subscriptions, self-hosted`}</Text>
      ) : null}
      {a.unpriced > 0 ? (
        <Text style={styles.cardNote}>{`${a.unpriced} model(s) without a price`}</Text>
      ) : null}
      {a.rows.length > 0 ? (
        <View style={styles.modelTable}>
          {a.rows.map((row, index) => (
            <View key={`${row.model}-${index}`} style={styles.modelRow}>
              <Text style={styles.modelName} numberOfLines={1}>
                {row.model.split('/').pop()}
              </Text>
              <Text style={styles.modelNums}>
                {`${row.calls}× · ${short(row.promptTokens)} in · ${short(row.completionTokens)} out`}
              </Text>
              <Text style={styles.modelCost}>
                {row.costUsd === undefined
                  ? '-'
                  : `${row.costBilled ? '' : '*'}${row.costApproximate ? '~' : ''}${money(row.costUsd)}`}
              </Text>
            </View>
          ))}
          <Text style={styles.codeNote}>* not a charge · ~ price of a matched model id</Text>
        </View>
      ) : null}
    </Card>
  );
}

function DelegatedCard({ payload }: { payload: StatusPayload }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const d = payload.delegated;
  if (!d) return null;
  return (
    <Card>
      <CardHead title="delegated · sub-agents, browser" trailing={money(d.billedUsd)} />
      <Text style={styles.cardNote}>
        {`${d.calls} calls · ${short(d.tokens)} tokens${d.referenceUsd > 0 ? ` · ${money(d.referenceUsd)} reference` : ''}`}
      </Text>
    </Card>
  );
}

function ConversationCard({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const s = payload.session;
  if (!s) {
    return (
      <Card>
        <CardHead title="conversation" />
        <Text style={styles.cardNote}>nothing has been asked here yet.</Text>
      </Card>
    );
  }
  return (
    <Card>
      <CardHead title="conversation" />
      <Row label="platform" value={`${s.platform} · ${s.chatType}`} />
      <Row label="started" value={ago(s.createdAt)} />
      <Row label="last active" value={ago(s.lastActiveAt)} />
      <Row label="active run" value={payload.runtime.activeRun} />
      {s.subAgent ? (
        <Row label="sub-agent" value={`${s.subAgent.displayName} (${s.subAgent.type}, ${s.subAgent.visibility})`} />
      ) : null}
    </Card>
  );
}

/** Everything true but rarely asked: ids, window provenance, tool approvals. */
function DetailsFold({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const s = payload.session;
  const r = payload.runtime;
  const c = payload.context;
  return (
    <Fold label="details" hint="ids, context window, approvals">
      <Card>
        <Row label="context limit" value={`${short(payload.model.contextLimit)} · ${payload.model.contextNotes.join(', ')}`} />
        {payload.model.configDefault ? <Row label="config default" value={payload.model.configDefault} /> : null}
        {payload.model.effort ? <Row label="effort" value={payload.model.effort} /> : null}
        {payload.model.selfHosted ? <Row label="billing" value="self-hosted, no marginal cost" /> : null}
        {c.carried ? (
          <Row
            label="carried to"
            value={`${c.carried.model}: ${c.carried.messages} messages (~${short(c.carried.tokens)} tokens)${
              c.carried.dropped > 0 ? `, ${c.carried.dropped} oldest dropped` : ''
            }`}
          />
        ) : null}
        <Row label="verbose" value={r.verbose ? 'on' : 'off'} />
        {r.approvedTools.length > 0 ? <Row label="approved" value={r.approvedTools.join(', ')} /> : null}
        {s ? <Row label="created" value={s.createdAt.slice(0, 16).replace('T', ' ')} /> : null}
        {s ? <Row label="session id" value={s.id} monospace /> : null}
        {s?.subAgent ? <Row label="spawned by" value={s.subAgent.parentSessionId} monospace /> : null}
        {r.sdkSessionId ? <Row label="sdk session" value={r.sdkSessionId} monospace /> : null}
      </Card>
    </Fold>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.md,
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
  empty: { padding: space.xl, fontSize: font.body, color: palette.textFaint },
  body: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
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
  cardTrailing: { fontSize: font.meta, fontWeight: '600' as const, color: palette.text },
  cardNote: { fontSize: font.small, color: palette.textMuted },
  cardNoteWarn: { color: palette.warn },
  heroRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: space.sm },
  hero: { fontSize: 28, lineHeight: 32, fontWeight: '700' as const, color: palette.text },
  heroUnit: { fontSize: font.body, color: palette.textFaint },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  statCell: {
    flexGrow: 1,
    flexBasis: '47%' as const,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  statLabel: {
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  statValue: { fontSize: font.screen, fontWeight: '600' as const, color: palette.text },
  statSub: { fontSize: font.micro, color: palette.textFaint },
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
  modelTable: { marginTop: space.xs, gap: space.xs },
  modelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.xxs,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  modelName: { flex: 1, fontSize: font.small, color: palette.text },
  modelNums: { fontSize: font.micro, color: palette.textFaint },
  modelCost: { width: 58, fontSize: font.small, color: palette.text, textAlign: 'right' as const },
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
  code: { fontFamily: 'monospace' as const, fontSize: font.micro, color: palette.text },
  codeBlock: {
    backgroundColor: palette.codeBg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
  },
});
