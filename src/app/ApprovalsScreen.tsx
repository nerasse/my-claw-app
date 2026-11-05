import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ApprovalDecision, ApprovalGrantFrame, ApprovalHistoryResultFrame, ApprovalRequestFrame } from '../core/protocol';
import { encodeApprovalGrantRemove } from '../core/protocol';
import { connection } from '../core/connection';
import { BackButton, headerStyle } from '../components/BackButton';
import { CloseButton } from '../components/CloseButton';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { ApprovalHistoryScreen } from './ApprovalHistoryScreen';

type Tab = 'waiting' | 'history' | 'allowed';

/** The argument that says what a waiting call is about, in one line. */
function summaryOf(args: Record<string, unknown>): string {
  const key = ['command', 'path', 'url', 'pattern'].find(
    name => typeof args[name] === 'string' && (args[name] as string).trim().length > 0,
  );
  return key ? (args[key] as string).trim() : JSON.stringify(args);
}

/** `archy`, `local`: the machine an approval belongs to. */
function originOf(request: ApprovalRequestFrame): string {
  if (!request.origin || request.origin.kind === 'local') return 'this machine';
  return request.origin.name ?? request.origin.nodeId ?? 'node';
}

function originKeyOf(request: ApprovalRequestFrame): string {
  return request.origin?.kind === 'node' ? request.origin.nodeId ?? request.origin.name ?? 'node' : 'local';
}

function originLabelOf(key: string): string {
  return key === 'local' ? 'this machine' : key;
}

function waitingFor(request: ApprovalRequestFrame): string {
  const since = request.requestedAt ?? (request.expiresAt > 0 ? request.expiresAt - 2 * 60_000 : Date.now());
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/**
 * Every approval of this install, in one place -- waiting, past, and the calls allowed for good.
 *
 * The waiting half is the one the sheet cannot serve: the sheet only exists while a prompt is
 * raised, and a prompt raised by a sub-agent on another machine used to have no screen at all.
 * Rows are grouped by machine and can be answered from here, which is what makes the filter worth
 * having: "archy is waiting on me" is a different decision from "this machine is".
 */
export function ApprovalsScreen({
  approvals,
  history,
  grants,
  onDecide,
  onBack,
  onRefreshHistory,
}: {
  approvals: ApprovalRequestFrame[];
  history: ApprovalHistoryResultFrame | null;
  grants: ApprovalGrantFrame[];
  onDecide: (id: string, decision: ApprovalDecision) => void;
  onBack: () => void;
  onRefreshHistory: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { scrollProps, indicator } = useScrollIndicator();
  const [tab, setTab] = useState<Tab>(approvals.length > 0 ? 'waiting' : 'history');
  const [machine, setMachine] = useState<string>('all');
  const [tool, setTool] = useState<string>('all');

  const machines = useMemo(() => [...new Set(approvals.map(originKeyOf))], [approvals]);
  const tools = useMemo(() => [...new Set(approvals.map(entry => entry.toolName))].sort(), [approvals]);
  const waiting = useMemo(
    () =>
      approvals.filter(entry => machine === 'all' || originKeyOf(entry) === machine).filter(
        entry => tool === 'all' || entry.toolName === tool,
      ),
    [approvals, machine, tool],
  );

  // A filter that empties the list is not a filter the owner can see the effect of; when the last
  // prompt of a machine leaves, its chip goes with it.
  useEffect(() => {
    if (machine !== 'all' && !machines.includes(machine)) setMachine('all');
  }, [machine, machines]);
  useEffect(() => {
    if (tool !== 'all' && !tools.includes(tool)) setTool('all');
  }, [tool, tools]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label="Back" />
        <Text style={styles.title}>Approvals</Text>
        <CloseButton />
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['waiting', `Waiting${approvals.length > 0 ? ` (${approvals.length})` : ''}`],
            ['history', 'History'],
            ['allowed', `Always allowed${grants.length > 0 ? ` (${grants.length})` : ''}`],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === key }}
            hitSlop={8}
            style={[styles.tab, tab === key ? styles.tabOn : null]}>
            <Text style={[styles.tabText, tab === key ? styles.tabTextOn : null]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'waiting' ? (
        <>
          {machines.length > 0 ? (
            <View style={styles.filters}>
              <Chip label="All machines" active={machine === 'all'} onPress={() => setMachine('all')} />
              {machines.map(key => (
                <Chip
                  key={key}
                  label={originLabelOf(key)}
                  active={machine === key}
                  onPress={() => setMachine(key)}
                />
              ))}
            </View>
          ) : null}
          {tools.length > 1 ? (
            <View style={styles.filters}>
              <Chip label="Every tool" active={tool === 'all'} onPress={() => setTool('all')} />
              {tools.map(name => (
                <Chip key={name} label={name} active={tool === name} onPress={() => setTool(name)} />
              ))}
            </View>
          ) : null}
          <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
            {waiting.length === 0 ? (
              <Text style={styles.empty}>Nothing is waiting for an answer.</Text>
            ) : (
              waiting.map(request => (
                <View key={request.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.tool}>{request.toolName}</Text>
                    <Text style={styles.meta}>{originOf(request)}</Text>
                    <Text style={styles.meta}>
                      {request.waitForever ? 'no timeout' : `${waitingFor(request)} waiting`}
                    </Text>
                  </View>
                  {request.headline ? <Text style={styles.headline}>{request.headline}</Text> : null}
                  <Text style={styles.args} selectable>
                    {summaryOf(request.args)}
                  </Text>
                  <View style={styles.actions}>
                    <Action label="Allow once" onPress={() => onDecide(request.id, 'allow-once')} />
                    {request.allowSessionOffered ? (
                      <Action label="This conversation" onPress={() => onDecide(request.id, 'allow-session')} />
                    ) : null}
                    {request.allowAlwaysOffered !== false ? (
                      <Action label="Always, exact call" onPress={() => onDecide(request.id, 'allow-always')} />
                    ) : null}
                    <Action label="Deny" danger onPress={() => onDecide(request.id, 'deny')} />
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </>
      ) : tab === 'history' ? (
        <ApprovalHistoryScreen history={history} onBack={() => setTab('waiting')} onRefresh={onRefreshHistory} embedded />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
          {grants.length === 0 ? (
            <Text style={styles.empty}>
              No call is allowed for good. Picking "Always allow this exact call" on a prompt adds one
              here, and it can be withdrawn from this page.
            </Text>
          ) : (
            grants.map(grant => (
              <View key={`${grant.tool}:${grant.origin}:${grant.args}`} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.tool}>{grant.tool}</Text>
                  <Text style={styles.meta}>{originLabelOf(grant.origin)}</Text>
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw this grant"
                    onPress={() => {
                      connection.send(encodeApprovalGrantRemove(grant)).catch(() => {});
                    }}>
                    <Text style={styles.withdraw}>withdraw</Text>
                  </Pressable>
                </View>
                <Text style={styles.args} selectable>
                  {grant.args}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
      {indicator}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={8}
      style={[styles.chip, active ? styles.chipOn : null]}>
      <Text style={[styles.chipText, active ? styles.chipTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

function Action({ label, danger, onPress }: { label: string; danger?: boolean; onPress: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={[styles.action, danger ? styles.actionDanger : null]}>
      <Text style={[styles.actionText, danger ? styles.actionTextDanger : null]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: headerStyle(palette),
  title: { fontSize: font.title, color: palette.text, fontWeight: '600' as const },
  tabs: { flexDirection: 'row' as const, gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm },
  tab: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt },
  tabOn: { backgroundColor: palette.accent },
  tabText: { fontSize: font.small, color: palette.textMuted },
  tabTextOn: { color: palette.accentText },
  filters: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
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
  card: { backgroundColor: palette.surface, borderRadius: radius.md, padding: space.sm, gap: space.xs },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  tool: { fontSize: font.body, color: palette.text, fontWeight: '600' as const },
  meta: { fontSize: font.small, color: palette.textMuted },
  headline: { fontSize: font.body, color: palette.text },
  args: {
    fontSize: font.small,
    fontFamily: 'monospace' as const,
    color: palette.textMuted,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: space.xs,
  },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs, marginTop: space.xs },
  action: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  actionDanger: { backgroundColor: palette.danger },
  actionText: { fontSize: font.small, color: palette.text },
  actionTextDanger: { color: palette.accentText },
  withdraw: { fontSize: font.small, color: palette.danger, marginLeft: 'auto' as const },
});
