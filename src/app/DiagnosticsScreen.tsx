import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { LogsTailQuery } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

const LEVELS: Array<NonNullable<LogsTailQuery['level']>> = ['debug', 'info', 'warn', 'error'];
const SCOPES = ['all', 'my-claw-app', 'orchestrator', 'telegram', 'matrix'] as const;

export function DiagnosticsScreen({
  snapshot,
  logs,
  lastRun,
  busy,
  onSnapshot,
  onLogs,
  onBack,
}: {
  snapshot: string;
  logs: string;
  lastRun: string | null;
  busy: boolean;
  onSnapshot: () => void;
  onLogs: (query: LogsTailQuery) => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [level, setLevel] = useState<NonNullable<LogsTailQuery['level']>>('warn');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('all');
  const [contains, setContains] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // Cleared on unmount: a pending "Copied" reset would fire into a dead component.
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const fetchLogs = (extra: LogsTailQuery = {}): void => {
    onLogs({
      level,
      ...(scope === 'all' ? {} : { scope }),
      ...(contains.trim() ? { contains: contains.trim() } : {}),
      limit: 200,
      ...extra,
    });
  };

  const copy = (label: string, value: string): void => {
    if (!value) return;
    Clipboard.setString(value);
    setCopied(label);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(current => (current === label ? null : current)), 1500);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Diagnostics</Text>
          <Text style={styles.subtitle}>{lastRun ? `last run ${lastRun}` : 'server health and logs'}</Text>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        <Section
          title="Snapshot"
          styles={styles}
          action={
            <Row styles={styles}>
              <Button label="Refresh" a11yLabel="Refresh snapshot" onPress={onSnapshot} disabled={busy} styles={styles} />
              <Button
                label={copied === 'snapshot' ? 'Copied' : 'Copy'}
                a11yLabel="Copy snapshot"
                onPress={() => copy('snapshot', snapshot)}
                disabled={!snapshot}
                styles={styles}
              />
            </Row>
          }>
          <Text style={styles.mono} selectable>
            {snapshot || 'tap Refresh to pull the server snapshot'}
          </Text>
        </Section>

        <Section
          title="Logs"
          styles={styles}
          action={
            <Row styles={styles}>
              <Button label="Fetch" a11yLabel="Fetch logs" onPress={() => fetchLogs()} disabled={busy} styles={styles} />
              <Button
                label={copied === 'logs' ? 'Copied' : 'Copy'}
                a11yLabel="Copy logs"
                onPress={() => copy('logs', logs)}
                disabled={!logs}
                styles={styles}
              />
            </Row>
          }>
          <View style={styles.filters}>
            <Chips
              values={LEVELS}
              selected={level}
              onSelect={value => setLevel(value)}
              styles={styles}
              labelPrefix="Level"
            />
            <Chips
              values={SCOPES}
              selected={scope}
              onSelect={value => setScope(value)}
              styles={styles}
              labelPrefix="Scope"
            />
            <TextInput
              style={styles.search}
              value={contains}
              onChangeText={setContains}
              placeholder="contains…"
              placeholderTextColor={styles.placeholderColor.color}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Filter logs by text"
            />
            {lastRun ? (
              <Pressable
                onPress={() => fetchLogs({ run: lastRun, level: 'debug' })}
                style={styles.runButton}
                accessibilityRole="button"
                accessibilityLabel={`Logs for the last run ${lastRun}`}>
                <Text style={styles.runButtonText}>Last run only ({lastRun})</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.mono} selectable>
            {logs || 'no lines yet'}
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}

function Row({ children, styles }: { children: React.ReactNode; styles: Styles }): React.JSX.Element {
  return <View style={styles.row}>{children}</View>;
}

function Button({
  label,
  a11yLabel,
  onPress,
  disabled,
  styles,
}: {
  label: string;
  /** Two buttons can read "Copy": the screen reader needs to know which one. */
  a11yLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  styles: Styles;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Chips<T extends string>({
  values,
  selected,
  onSelect,
  styles,
  labelPrefix,
}: {
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  styles: Styles;
  labelPrefix: string;
}): React.JSX.Element {
  return (
    <View style={styles.chipRow}>
      {values.map(value => (
        <Pressable
          key={value}
          onPress={() => onSelect(value)}
          style={[styles.chip, value === selected ? styles.chipActive : null]}
          accessibilityRole="button"
          accessibilityState={{ selected: value === selected }}
          accessibilityLabel={`${labelPrefix} ${value}`}>
          <Text style={[styles.chipText, value === selected ? styles.chipTextActive : null]}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Section({
  title,
  action,
  children,
  styles,
}: {
  title: string;
  action: React.ReactNode;
  children: React.ReactNode;
  styles: Styles;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

const createStyles = (p: Palette) =>
  ({
    screen: { flex: 1, backgroundColor: p.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      backgroundColor: p.surface,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceAlt,
    },
    backGlyph: { color: p.text, fontSize: font.screen, lineHeight: font.screen + 2 },
    headerText: { flex: 1 },
    title: { color: p.text, fontSize: font.title, fontWeight: '600' },
    subtitle: { color: p.textMuted, fontSize: font.meta, marginTop: 2 },
    body: { flex: 1 },
    bodyContent: { padding: space.md, gap: space.md, paddingBottom: space.xl },
    section: {
      backgroundColor: p.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      padding: space.sm,
      gap: space.sm,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { color: p.text, fontSize: font.body, fontWeight: '600' },
    button: {
      paddingHorizontal: space.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
      backgroundColor: p.surfaceAlt,
      borderWidth: 1,
      borderColor: p.border,
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: p.text, fontSize: font.meta, fontWeight: '600' },
    row: { flexDirection: 'row', gap: space.xs },
    filters: { gap: space.xs },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
    chip: {
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: p.surfaceAlt,
      borderWidth: 1,
      borderColor: p.border,
    },
    chipActive: { backgroundColor: p.accent, borderColor: p.accent },
    chipText: { color: p.textMuted, fontSize: font.meta },
    chipTextActive: { color: p.accentText, fontWeight: '600' },
    search: {
      backgroundColor: p.surfaceAlt,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: p.border,
      color: p.text,
      fontSize: font.body,
      paddingHorizontal: space.sm,
      paddingVertical: 6,
    },
    placeholderColor: { color: p.textMuted },
    runButton: {
      paddingHorizontal: space.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
      backgroundColor: p.surfaceAlt,
      borderWidth: 1,
      borderColor: p.border,
      alignSelf: 'flex-start',
    },
    runButtonText: { color: p.text, fontSize: font.meta },
    mono: {
      color: p.textMuted,
      fontSize: font.meta,
      fontFamily: 'monospace',
      lineHeight: font.meta + 6,
    },
  }) as const;
