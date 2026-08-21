import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionSheet, type SheetEntry } from './ActionSheet';
import type { ApprovalDecision, ApprovalRequestFrame } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * Tools whose arguments are the whole decision: shown raw and unwrapped, because approving a
 * shell command from a truncated preview is approving something you did not read.
 */
const PRIMARY_ARG: Record<string, string> = {
  bash: 'command',
  read: 'path',
  write: 'path',
  apply_patch: 'path',
  fetch: 'url',
  ls: 'path',
  search: 'pattern',
};

/** The headline under the tool name: the argument that says what is about to happen. */
export function summarize(frame: ApprovalRequestFrame): string | null {
  const key = PRIMARY_ARG[frame.toolName];
  const value = key ? frame.args[key] : undefined;
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

function secondsLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/**
 * The approval prompt. Three grants, never two: "just this once" and "always in this
 * conversation" are different decisions and the sheet has to let the owner say which one he
 * means. The countdown is shown because an unanswered prompt is denied, and a denial the owner
 * did not choose should at least not be a surprise.
 */
export function ApprovalSheet({
  request,
  pending,
  onDecide,
  onDismiss,
}: {
  request: ApprovalRequestFrame;
  /** Prompts waiting behind this one, so a batch does not look like a single question. */
  pending: number;
  onDecide: (decision: ApprovalDecision) => void;
  onDismiss: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request.id]);

  const remaining = secondsLeft(request.expiresAt, now);
  const headline = useMemo(() => summarize(request), [request]);
  const details = useMemo(() => JSON.stringify(request.args, null, 2), [request.args]);
  // The primary argument is already above in full: repeating the whole object under it is noise
  // on the one-argument tools, which are most of them.
  const showDetails = !headline || Object.keys(request.args).length > 1;

  const options: SheetEntry[] = [
    {
      key: 'once',
      label: 'Allow once',
      hint: 'This call only.',
      onPress: () => onDecide('allow-once'),
    },
    ...(request.allowSessionOffered
      ? [
          {
            key: 'session',
            label: `Always allow ${request.toolName} here`,
            hint: 'Every later call in this conversation runs without asking.',
            onPress: () => onDecide('allow-session'),
          } as SheetEntry,
        ]
      : []),
    { type: 'separator' as const, key: 'sep' },
    {
      key: 'deny',
      label: 'Deny',
      danger: true,
      hint: 'The tool call fails and the agent is told.',
      onPress: () => onDecide('deny'),
    },
  ];

  return (
    <ActionSheet
      preview={`${request.toolName} wants to run`}
      options={options}
      onClose={onDismiss}>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text
            style={[styles.timer, remaining <= 15 ? styles.timerUrgent : null]}
            accessibilityLabel={`${remaining} seconds left to answer`}>
            {remaining > 0 ? `${remaining}s to answer` : 'expired'}
          </Text>
          {pending > 0 ? <Text style={styles.queued}>{pending} more waiting</Text> : null}
        </View>

        {headline ? (
          <Text style={styles.headline} selectable>
            {headline}
          </Text>
        ) : null}

        {showDetails ? (
          <ScrollView style={styles.detailsBox} nestedScrollEnabled>
            <Text style={styles.details} selectable>
              {details}
            </Text>
          </ScrollView>
        ) : null}

        {!request.allowSessionOffered ? (
          <Text style={styles.note}>
            Every {request.toolName} call is asked separately.
          </Text>
        ) : null}
      </View>
    </ActionSheet>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    body: { gap: space.sm },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timer: { fontSize: font.small, color: palette.textMuted },
    timerUrgent: { color: palette.danger },
    queued: { fontSize: font.small, color: palette.textMuted },
    headline: {
      fontSize: font.body,
      fontFamily: 'monospace' as const,
      color: palette.text,
      backgroundColor: palette.surfaceAlt,
      borderRadius: radius.sm,
      padding: space.sm,
    },
    detailsBox: { maxHeight: 160 },
    details: {
      fontSize: font.small,
      fontFamily: 'monospace' as const,
      color: palette.textMuted,
      backgroundColor: palette.surfaceAlt,
      borderRadius: radius.sm,
      padding: space.sm,
    },
    note: { fontSize: font.small, color: palette.textMuted },
  });
