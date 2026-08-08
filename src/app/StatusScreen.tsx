import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useStatus } from '../core/status';
import type { StatusPayload } from '../core/protocol';

/**
 * Fullscreen status page, drawn from the structured `/status` report: everything the command
 * prints in chat, laid out as cards. It lives outside the conversation (and outside the agent's
 * context -- a command never reaches the model), opened from the thread menu or by typing
 * `/status`. Rendered as an absolute layer of the shell, like the image viewer, so the back key
 * walks one level instead of closing the app.
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
  const insets = useSafeAreaInsets();
  const status = useStatus();
  useDismissKeyboard();

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
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
            this conversation
          </Text>
        </View>
      </View>

      {status.fetch === 'loading' ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : status.fetch === 'error' ? (
        <Text style={styles.empty}>{status.error}</Text>
      ) : status.payload ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SessionSection payload={status.payload} />
          <ModelSection payload={status.payload} />
          <ContextSection payload={status.payload} />
          <ConversationSection payload={status.payload} />
          <AnalyticsSection payload={status.payload} />
          <DelegatedSection payload={status.payload} />
          <RuntimeSection payload={status.payload} />
          {status.text ? (
            <>
              <Text style={styles.section}>text output</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.code} selectable>
                  {status.text}
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : null}
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

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.section}>{children}</Text>;
}

function SessionSection({ payload }: { payload: StatusPayload }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (!payload.session) {
    return (
      <>
        <SectionTitle>session</SectionTitle>
        <Card>
          <Text style={styles.note}>no session yet: nothing has been asked in this conversation.</Text>
        </Card>
      </>
    );
  }
  const s = payload.session;
  return (
    <>
      <SectionTitle>session</SectionTitle>
      <Card>
        <Row label="platform" value={`${s.platform} · ${s.chatType}`} />
        <Row label="created" value={`${s.createdAt.slice(0, 16).replace('T', ' ')} (${ago(s.createdAt)})`} />
        <Row label="last active" value={`${s.lastActiveAt.slice(0, 16).replace('T', ' ')} (${ago(s.lastActiveAt)})`} />
        <Row label="messages" value={String(s.messages)} />
        {s.subAgent ? (
          <>
            <Row label="sub-agent" value={`${s.subAgent.displayName} (${s.subAgent.type}, ${s.subAgent.visibility})`} />
            <Row label="spawned by" value={s.subAgent.parentSessionId} monospace />
          </>
        ) : null}
        <Row label="id" value={s.id} monospace />
      </Card>
    </>
  );
}

function ModelSection({ payload }: { payload: StatusPayload }): React.JSX.Element {
  return (
    <>
      <SectionTitle>model</SectionTitle>
      <Card>
        <Row label="current" value={payload.model.current} />
        {payload.model.configDefault ? <Row label="config default" value={payload.model.configDefault} /> : null}
        {payload.model.effort ? <Row label="effort" value={payload.model.effort} /> : null}
        <Row label="context limit" value={`${short(payload.model.contextLimit)} · ${payload.model.contextNotes.join(', ')}`} />
        {payload.model.selfHosted ? <Row label="billing" value="self-hosted, no marginal cost" /> : null}
      </Card>
    </>
  );
}

function ContextSection({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const c = payload.context;
  const limit = payload.model.contextLimit;
  const measuredPct = c.measured ? c.measured.pctOfLimit : null;
  const occupiedPct = limit > 0 ? (c.occupied / limit) * 100 : 0;
  const overThreshold = c.autoCompactOn && occupiedPct >= c.autoCompactThresholdPct;
  const barColor = overThreshold ? styles.barWarn.color : styles.barFill.color;
  return (
    <>
      <SectionTitle>context</SectionTitle>
      <Card>
        {c.measured ? (
          <>
            <View style={styles.statRow}>
              <Text style={styles.statKey}>measured</Text>
              <Text style={styles.statValue}>{`${short(c.measured.tokens)} on the last call`}</Text>
            </View>
            <Meter pct={measuredPct ?? 0} color={barColor} />
            <Text style={styles.statSub}>{`${c.measured.pctOfLimit.toFixed(1)}% of the limit`}</Text>
          </>
        ) : (
          <Row label="measured" value="no call recorded yet" />
        )}
        <Row label="estimated" value={`${short(c.estimated)} · chars/4, under-counts`} />
        <View style={styles.statRow}>
          <Text style={styles.statKey}>occupied</Text>
          <Text style={styles.statValue}>{`${short(c.occupied)} · drives auto-compaction`}</Text>
        </View>
        <Meter pct={Math.min(100, occupiedPct)} color={barColor} />
        <Text style={styles.statSub}>
          {`${occupiedPct.toFixed(1)}% of the limit${overThreshold ? ' · at the auto-compact threshold' : ''}`}
        </Text>
        <Row
          label="auto-compact"
          value={
            c.autoCompactOn
              ? `on, threshold ${c.autoCompactThresholdPct}% = ${short(c.autoCompactThresholdTokens)}`
              : 'off'
          }
        />
        {c.carried ? (
          <Row
            label="carried to"
            value={`${c.carried.model}: ${c.carried.messages} messages (~${short(c.carried.tokens)} tokens)${c.carried.dropped > 0 ? `, ${c.carried.dropped} oldest dropped` : ''}`}
          />
        ) : null}
      </Card>
    </>
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

function ConversationSection({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const c = payload.conversation;
  if (!c) {
    return (
      <>
        <SectionTitle>this conversation · since /new</SectionTitle>
        <Card>
          <Text style={styles.note}>no calls yet.</Text>
        </Card>
      </>
    );
  }
  return (
    <>
      <SectionTitle>this conversation · since /new</SectionTitle>
      <Card>
        <Row label="calls" value={String(c.calls)} />
        <Row label="in" value={`${short(c.promptTokens)}${c.cacheReadTokens > 0 ? ` · cached ${short(c.cacheReadTokens)}` : ''}`} />
        <Row label="out" value={short(c.completionTokens)} />
      </Card>
    </>
  );
}

function AnalyticsSection({ payload }: { payload: StatusPayload }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const a = payload.analytics;
  if (!a) return null;
  const title = [
    'analytics · 90 d',
    ...(a.calls > 0 || a.errors > 0 ? [`${a.calls} calls · ${a.errors} errors`] : []),
    ...(a.durationMs ? [duration(a.durationMs)] : []),
  ].join(' · ');
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card>
        {a.billedUsd > 0 ? <Row label="billed" value={money(a.billedUsd)} /> : null}
        {a.referenceUsd > 0 ? (
          <Row label="reference" value={`${money(a.referenceUsd)} · flat plans, subscriptions, self-hosted`} />
        ) : null}
        {a.unpriced > 0 ? <Row label="unpriced" value={`${a.unpriced} model(s) without a price`} /> : null}
        {a.rows.length > 0 ? (
          <View style={styles.modelTable}>
            <Text style={[styles.modelHead, styles.code]}>
              {'model'.padEnd(24)} calls  in      cached  out      cost
            </Text>
            {a.rows.map((row, index) => (
              <Text key={`${row.model}-${index}`} style={styles.code}>
                {row.model.split('/').pop()!.slice(0, 24).padEnd(24)}
                {String(row.calls).padStart(5)}
                {short(row.promptTokens).padStart(8)}
                {(row.cacheReadTokens > 0 ? short(row.cacheReadTokens) : '-').padStart(8)}
                {short(row.completionTokens).padStart(8)}
                {(row.costUsd === undefined
                  ? '  -'
                  : `${row.costBilled ? ' ' : '*'}${row.costApproximate ? '~' : ''}${money(row.costUsd)}`
                ).padStart(9)}
              </Text>
            ))}
            <Text style={styles.codeNote}>{`* not a charge · ~ price of a matched model id`}</Text>          </View>
        ) : null}
      </Card>
    </>
  );
}

function DelegatedSection({ payload }: { payload: StatusPayload }): React.JSX.Element | null {
  const d = payload.delegated;
  if (!d) return null;
  return (
    <>
      <SectionTitle>delegated · sub-agents, browser</SectionTitle>
      <Card>
        <Row label="calls" value={String(d.calls)} />
        <Row label="tokens" value={short(d.tokens)} />
        <Row label="billed" value={money(d.billedUsd)} />
        {d.referenceUsd > 0 ? <Row label="reference" value={money(d.referenceUsd)} /> : null}
      </Card>
    </>
  );
}

function RuntimeSection({ payload }: { payload: StatusPayload }): React.JSX.Element {
  const r = payload.runtime;
  return (
    <>
      <SectionTitle>runtime</SectionTitle>
      <Card>
        <Row label="active run" value={r.activeRun} />
        <Row label="verbose" value={r.verbose ? 'on' : 'off'} />
        {r.approvedTools.length > 0 ? <Row label="approved" value={r.approvedTools.join(', ')} /> : null}
        {r.sdkSessionId ? <Row label="sdk session" value={r.sdkSessionId} monospace /> : null}
      </Card>
    </>
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
  body: { paddingHorizontal: space.md, paddingBottom: space.xl },
  section: {
    marginTop: space.lg,
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    paddingVertical: space.sm,
  },
  rowKey: {
    width: 110,
    fontSize: font.small,
    color: palette.textFaint,
    paddingTop: 1,
  },
  rowValue: {
    flex: 1,
    fontSize: font.body,
    color: palette.text,
    textAlign: 'right' as const,
  },
  rowValueMono: {
    fontFamily: 'monospace',
    fontSize: font.small,
  },
  note: { paddingVertical: space.md, fontSize: font.body, color: palette.textMuted },
  statRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  statKey: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  statValue: { fontSize: font.body, color: palette.text },
  statSub: {
    fontSize: font.micro,
    color: palette.textFaint,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  meterTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden' as const,
  },
  meterFill: { height: 6, borderRadius: radius.pill },
  barFill: { color: palette.accent },
  barWarn: { color: palette.warn },
  modelTable: {
    marginTop: space.xs,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: palette.codeBg,
    gap: 2,
  },
  modelHead: { color: palette.textFaint },
  code: { fontFamily: 'monospace' as const, fontSize: font.micro, color: palette.text },
  codeNote: { fontSize: font.micro, color: palette.textFaint, paddingTop: space.xs },
  codeBlock: {
    backgroundColor: palette.codeBg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
  },
});
