import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ApprovalHistoryEntry, ApprovalOutcome, ApprovalHistoryResultFrame } from '../core/protocol';
import { BackButton, headerStyle } from '../components/BackButton';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { CloseButton } from '../components/CloseButton';

/** How each outcome reads. The wording separates a refusal from a prompt nobody answered. */
const OUTCOME_LABEL: Record<ApprovalOutcome, string> = {
  'allow-once': 'allowed once',
  'allow-session': 'allowed for the conversation',
  deny: 'denied',
  expired: 'not answered',
  cancelled: 'cancelled',
};

function when(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const minutes = Math.floor((Date.now() - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(at).toISOString().slice(0, 10);
}

/** A decision taken in under a second was not read; worth showing, not worth judging. */
function took(durationMs: number): string {
  if (durationMs < 1000) return '<1s';
  return `${Math.round(durationMs / 1000)}s`;
}

type Filter = 'all' | 'allowed' | 'denied';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'allowed', label: 'Allowed' },
  { key: 'denied', label: 'Denied' },
];

function matches(entry: ApprovalHistoryEntry, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'allowed') return entry.outcome === 'allow-once' || entry.outcome === 'allow-session';
  return entry.outcome === 'deny';
}

/**
 * What the agent was allowed to do, and what was refused. The journal is written server-side on
 * every decision, including the ones nobody saw: a tool covered by an earlier "always allow"
 * runs with nothing on screen, and this list is the only place that says it happened.
 */
export function ApprovalHistoryScreen({
  history,
  onBack,
  onRefresh,
}: {
  history: ApprovalHistoryResultFrame | null;
  onBack: () => void;
  onRefresh: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { scrollProps, indicator } = useScrollIndicator();
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  // The journal is never pushed: nothing arrives until someone asks, so the page asks on open.
  useEffect(() => {
    onRefresh();
    // Opening the page is the trigger; a changing callback identity must not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = useMemo(
    () => (history?.entries ?? []).filter(entry => matches(entry, filter)),
    [history, filter],
  );
  const stats = history?.stats;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label="Back to settings" />
        <Text style={styles.title}>Tool approvals</Text>
        <Pressable onPress={onRefresh} accessibilityRole="button" accessibilityLabel="Refresh" hitSlop={12}>
          <Text style={styles.refresh}>↻</Text>
        </Pressable>
        <CloseButton />
      </View>

      {stats ? (
        <View style={styles.stats}>
          <Stat label="allowed" value={stats.allowed} />
          <Stat label="denied" value={stats.denied} />
          <Stat label="unanswered" value={stats.expired} />
        </View>
      ) : null}

      <View style={styles.filters}>
        {FILTERS.map(entry => (
          <Pressable
            key={entry.key}
            onPress={() => setFilter(entry.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === entry.key }}
            hitSlop={8}
            style={[styles.chip, filter === entry.key ? styles.chipOn : null]}>
            <Text style={[styles.chipText, filter === entry.key ? styles.chipTextOn : null]}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        {history === null ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : entries.length === 0 ? (
          <Text style={styles.empty}>
            {filter === 'all'
              ? 'No tool has ever asked for approval. With an empty blacklist, nothing does.'
              : 'Nothing here with this filter.'}
          </Text>
        ) : (
          entries.map(entry => {
            const open = expanded === entry.id;
            return (
              <Pressable
                key={entry.id}
                onPress={() => setExpanded(open ? null : entry.id)}
                accessibilityRole="button"
                style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.tool}>{entry.toolName}</Text>
                  <Text style={[styles.outcome, styles[outcomeStyle(entry.outcome)]]}>
                    {OUTCOME_LABEL[entry.outcome]}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {when(entry.decidedAt)}
                  {entry.auto ? ' · automatic, not asked' : ` · answered in ${took(entry.durationMs)}`}
                </Text>
                <Text style={styles.args} numberOfLines={open ? undefined : 1} selectable={open}>
                  {entry.args}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {indicator}
    </View>
  );
}

function outcomeStyle(outcome: ApprovalOutcome): 'outcomeAllow' | 'outcomeDeny' | 'outcomeIdle' {
  if (outcome === 'allow-once' || outcome === 'allow-session') return 'outcomeAllow';
  if (outcome === 'deny') return 'outcomeDeny';
  return 'outcomeIdle';
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: headerStyle(palette),

  refresh: { fontSize: font.body, color: palette.accent, marginLeft: 'auto' as const, paddingHorizontal: space.xs },
  title: { fontSize: font.title, color: palette.text, fontWeight: '600' as const },
  stats: { flexDirection: 'row' as const, gap: space.md, paddingHorizontal: space.md, paddingBottom: space.sm },
  stat: { alignItems: 'flex-start' as const },
  statValue: { fontSize: font.title, color: palette.text, fontWeight: '600' as const },
  statLabel: { fontSize: font.small, color: palette.textMuted },
  filters: { flexDirection: 'row' as const, gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  chipOn: { backgroundColor: palette.accent },
  chipText: { fontSize: font.small, color: palette.textMuted },
  chipTextOn: { color: palette.accentText },
  content: { paddingHorizontal: space.md, paddingBottom: space.xl, gap: space.sm },
  empty: { fontSize: font.body, color: palette.textMuted, paddingVertical: space.lg },
  row: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  rowHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  tool: { fontSize: font.body, color: palette.text, fontWeight: '600' as const },
  outcome: { fontSize: font.small },
  outcomeAllow: { color: palette.accent },
  outcomeDeny: { color: palette.danger },
  outcomeIdle: { color: palette.textMuted },
  meta: { fontSize: font.small, color: palette.textMuted },
  args: { fontSize: font.small, fontFamily: 'monospace' as const, color: palette.textMuted },
});
