import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import type { JobRunEntry } from '../core/protocol';

function when(ts: number): string {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '·';
  const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/**
 * The runs of one job: every run is a real session the server kept, so each row reopens it as
 * a chat the user can read and even answer on. The header carries the back arrow and a
 * shortcut to the job's own editor.
 */
export function JobSessionsScreen({
  jobName,
  runs,
  error,
  onClose,
  onEditJob,
  onOpenRun,
}: {
  jobName: string;
  runs: JobRunEntry[] | null;
  error: string | null;
  onClose: () => void;
  onEditJob: () => void;
  onOpenRun: (threadId: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  useDismissKeyboard();

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to jobs">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title} numberOfLines={1}>
            {jobName}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {runs === null ? 'loading runs' : `${runs.length} run${runs.length > 1 ? 's' : ''}`}
          </Text>
        </View>
        <Pressable
          onPress={onEditJob}
          style={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel="Edit job settings">
          <Text style={styles.settingsText}>settings</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Runs error ${error}`}>
          {error}
        </Text>
      ) : null}

      {runs !== null && runs.length === 0 ? (
        <Text style={styles.empty}>no run yet · the job will create one at its next run</Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {(runs ?? []).map((run, index) => (
          <View key={run.threadId}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <Pressable
              style={styles.card}
              onPress={() => onOpenRun(run.threadId)}
              accessibilityRole="button"
              accessibilityLabel={`Open run ${run.title}`}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {run.title}
                </Text>
                <Text style={styles.cardTime}>{when(run.runAt)}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {run.messageCount === 0
                  ? 'empty run'
                  : `${run.messageCount} message${run.messageCount > 1 ? 's' : ''}`}
                {' · tap to open and chat on it'}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    stage: {
      backgroundColor: palette.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.md,
      paddingBottom: space.sm,
      gap: space.sm,
    },
    backButton: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backGlyph: {
      color: palette.accent,
      fontSize: 22,
      lineHeight: 24,
      marginTop: -2,
    },
    headerMain: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: palette.text,
      fontSize: font.body,
      fontWeight: '600',
    },
    headerSub: {
      color: palette.textMuted,
      fontSize: font.small,
    },
    settingsButton: {
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      borderRadius: radius.md,
      backgroundColor: palette.surfaceAlt,
    },
    settingsText: {
      color: palette.accent,
      fontSize: font.small,
      fontWeight: '600',
    },
    error: {
      color: palette.danger,
      fontSize: font.small,
      paddingHorizontal: space.md,
      paddingBottom: space.sm,
    },
    empty: {
      color: palette.textMuted,
      fontSize: font.small,
      textAlign: 'center',
      paddingVertical: space.lg,
      paddingHorizontal: space.lg,
    },
    body: {
      padding: space.md,
      paddingBottom: space.xl,
    },
    separator: {
      height: 1,
      backgroundColor: palette.border,
      marginHorizontal: space.sm,
    },
    card: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      padding: space.md,
      gap: 4,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    cardTitle: {
      flex: 1,
      color: palette.text,
      fontSize: font.body,
      fontWeight: '600',
    },
    cardTime: {
      color: palette.textMuted,
      fontSize: font.small,
    },
    cardMeta: {
      color: palette.textMuted,
      fontSize: font.small,
      marginTop: space.xs,
    },
  });
}
