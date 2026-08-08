import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useJobs } from '../core/jobs';
import type { JobEntry } from '../core/protocol';

function when(iso: string | null): string {
  if (!iso) return '·';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '·';
  const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/** The scheduled tasks of the server: one row per job, a tap opens the editor. Values that
 *  match nothing in the live catalogs are painted red (unknownModel, unknownWorkspace,
 *  unknownSkills/…): they still exist in the job, so they must stay visible to be fixed. */
export function JobsScreen({
  error,
  onClose,
  onAdd,
  onEdit,
  onSessions,
}: {
  error: string | null;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (job: JobEntry) => void;
  onSessions: (job: JobEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const jobs = useJobs();
  useDismissKeyboard();

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close jobs">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Jobs</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {jobs.length === 0 ? 'no scheduled task yet' : `${jobs.length} scheduled task${jobs.length > 1 ? 's' : ''}`}
          </Text>
        </View>
        <Pressable
          onPress={onAdd}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="Add job">
          <Text style={styles.addText}>+ New</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Jobs error ${error}`}>
          {error}
        </Text>
      ) : null}

      {jobs.length === 0 ? (
        <Text style={styles.empty}>
          nothing scheduled · add a job to run a prompt on a schedule
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {jobs.map((job, index) => (
            <JobCard key={job.id} job={job} index={index} onEdit={onEdit} onSessions={onSessions} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function JobCard({
  job,
  index,
  onEdit,
  onSessions,
}: {
  job: JobEntry;
  index: number;
  onEdit: (job: JobEntry) => void;
  onSessions: (job: JobEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const unknownNames = [
    ...job.unknownSkills.map(name => `skills: ${name}`),
    ...job.unknownMcp.map(name => `mcp: ${name}`),
    ...job.unknownTools.map(name => `tools: ${name}`),
  ];
  const paused = job.state === 'paused' || !job.enabled;
  const failed = job.lastStatus === 'error';

  return (
    <View>
      {index > 0 ? <View style={styles.separator} /> : null}
      <Pressable
        style={styles.card}
        onPress={() => onEdit(job)}
        accessibilityRole="button"
        accessibilityLabel={`Edit job ${job.name}`}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {job.name}
          </Text>
          <Text
            style={[
              styles.stateBadge,
              job.state === 'completed' || paused ? styles.stateIdle : styles.stateLive,
            ]}>
            {paused ? (job.pausedReason ? 'paused' : job.state) : job.state}
          </Text>
        </View>
        <Text style={styles.cardSchedule}>{job.schedule.display}</Text>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaItem}>next {when(job.nextRunAt)}</Text>
          <Text style={styles.cardMetaItem}>
            {failed ? 'last failed' : job.lastRunAt ? 'last ok' : 'never run'}
            {job.lastRunAt ? ` · ${when(job.lastRunAt)}` : ''}
          </Text>
        </View>

        {job.model || job.workspace || unknownNames.length > 0 ? (
          <View style={styles.cardRows}>
            {job.model ? (
              <Text style={[styles.rowValue, job.unknownModel ? styles.valueRemoved : null]} numberOfLines={1}>
                {job.unknownModel ? `${job.model} · no such model` : job.model}
              </Text>
            ) : null}
            {job.workspace ? (
              <Text style={[styles.rowValue, job.unknownWorkspace ? styles.valueRemoved : null]} numberOfLines={1}>
                {job.unknownWorkspace ? `${job.workspace} · workspace gone` : `workspace ${job.workspace}`}
              </Text>
            ) : null}
            {unknownNames.length > 0 ? (
              <Text style={styles.valueRemoved} numberOfLines={2}>
                {`removed: ${unknownNames.join(', ')}`}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.cardFooter} numberOfLines={1}>
          {job.deliver === 'local'
            ? 'output saved on the server, nothing delivered'
            : job.deliver === 'origin'
              ? 'delivered to the chat it was created from'
              : `delivered to ${job.deliver}`}
        </Text>
        <Pressable
          style={styles.sessionsRow}
          onPress={() => onSessions(job)}
          accessibilityRole="button"
          accessibilityLabel={`Job sessions ${job.name}`}>
          <Text style={styles.sessionsText}>sessions</Text>
          <Text style={styles.sessionsGlyph}>›</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
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
  addButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  addText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  empty: {
    padding: space.xl,
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textFaint,
  },
  body: { padding: space.md, paddingBottom: space.xl, gap: space.sm },
  separator: { height: 1, backgroundColor: palette.border, marginHorizontal: space.sm },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: space.md,
    gap: 4,
  },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  cardTitle: { flex: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  stateBadge: {
    fontSize: font.micro,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  stateLive: { color: palette.ok, borderColor: palette.ok },
  stateIdle: { color: palette.textFaint, borderColor: palette.border },
  cardSchedule: { fontSize: font.small, color: palette.textMuted },
  cardMeta: { flexDirection: 'row' as const, gap: space.md, flexWrap: 'wrap' as const },
  cardMetaItem: { fontSize: font.micro, color: palette.textFaint },
  cardRows: { gap: 2, marginTop: space.xs },
  rowValue: { fontSize: font.small, color: palette.textMuted },
  valueRemoved: { fontSize: font.small, color: palette.danger },
  cardFooter: { fontSize: font.micro, color: palette.textFaint, marginTop: space.xs },
  sessionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
  },
  sessionsText: { fontSize: font.small, color: palette.accent, fontWeight: '600' as const },
  sessionsGlyph: { fontSize: font.body, color: palette.accent },
});
