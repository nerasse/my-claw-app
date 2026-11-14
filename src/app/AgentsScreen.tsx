import { ChevronIcon } from '../components/icons';
import React, { useCallback, useMemo } from 'react';
import { Animated, Easing, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { isOneShot, scopeLabelOf, type RosterRow, type SubAgentsStatus } from '../core/subagents';
import type { SubAgentEntry } from '../core/protocol';
import { useLayerFrame } from '../core/layout';
import { keyLayerProps } from '../core/keyNav';
import { formatDate } from '../core/utils';

const keyOfRow = (row: RosterRow): string => row.key;

/**
 * The row that is working right now.
 *
 * A dot that breathes, not a spinner: a list of twenty agents would mount twenty indeterminate
 * spinners, each running its own animation for the one row that is busy, and at ten pixels a
 * spinner's arc reads as a stray parenthesis next to a name. The drawer marks a conversation whose
 * sub-agents work with the same idea (a quiet pulse), so this is the same language one level down.
 */
function BusyDot(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const pulse = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      // Both, not just `stop()`: a loop stopped between its two timings can leave the second
      // one scheduled, and a roster closed mid-pulse kept a timer alive for the rest of the
      // process (Jest reports the worker that will not exit).
      loop.stop();
      pulse.stopAnimation();
    };
  }, [pulse]);
  return <Animated.View style={[styles.busyDot, { opacity: pulse }]} />;
}

/**
 * One sub-agent, as a row of a list.
 *
 * It was a bordered card three lines tall -- a mark, the id, `● running`, then a meta line and
 * often a third for the model -- and a roster of twenty of them read as twenty boxes rather than as
 * something you scan. It is now the same row the conversation list uses, because it answers the
 * same question: a name, what it is, and when it last said something. The frame is gone; the
 * running state is the one mark that earns colour.
 */
const AgentRow = React.memo(function AgentRowView({
  row,
  onOpen,
}: {
  row: RosterRow;
  onOpen: (entry: SubAgentEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const entry = row.entry;
  const oneShot = isOneShot(entry);
  // What it is, then who can reach it, then the count. Joined once, so the line has one separator
  // style rather than a chain of ` · ` built by hand per case. A one-shot is always private, so
  // saying "this conversation" on every one of them repeats what "one-shot" already said.
  const meta = [
    entry.type,
    ...(oneShot ? ['one-shot'] : [scopeLabelOf(entry)]),
    ...(entry.messageCount > 0 ? [`${entry.messageCount} msg${entry.messageCount === 1 ? '' : 's'}`] : []),
  ];
  const when = entry.lastMessageAt ?? entry.createdAt;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={() => onOpen(entry)}
      accessibilityRole="button"
      accessibilityLabel={`Open sub-agent ${entry.id}, ${entry.status === 'running' ? 'running' : 'idle'}, last message ${formatDate(when)}`}>
      {/* The one mark that carries state. Idle rows get no dot at all: a column of grey dots says
          "nothing here" twenty times and pushes every name off its column. */}
      <View style={styles.mark}>{entry.status === 'running' ? <BusyDot /> : null}</View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          {/* The id, not the display name: the model picks names and repeats them, and this is the
              handle that opens the agent. */}
          <Text style={styles.name} numberOfLines={1}>
            {entry.id.replace(/^subagent\//, '')}
          </Text>
          {/* When it last spoke -- the row's order. Not "now" for a running row: a run can have
              been going for ten minutes since its last message, and the mark on the left already
              says it is busy. */}
          <Text style={styles.date} numberOfLines={1}>
            {formatDate(when)}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
        {/* The row is the only place that says which account a delegated run is on: `modelLive` is
            set when the run walked off its pin, and the name is then what is calling now. */}
        {entry.model ? (
          <Text style={[styles.model, entry.modelLive ? styles.modelLive : null]} numberOfLines={1}>
            {entry.model}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

/**
 * The sub-agents of a conversation -- or, from the drawer, the ones it shares with others.
 *
 * One flat list, most recently spoken to first (`rosterRows`): the ordering is the date, so there
 * is no section header left to read. Picking a row closes this screen, because it is a chooser
 * rather than a level to come back to; that is what lets the sub-agent's own header name the
 * parent conversation instead of naming this list.
 */
export function AgentsScreen({
  parentTitle,
  subtitle,
  rows,
  status,
  onClose,
  onOpenAgent,
}: {
  /** What the back row returns to. */
  parentTitle: string;
  /** What this list is a list of; defaults to the parent, which is not always what it means. */
  subtitle?: string;
  rows: RosterRow[];
  status: SubAgentsStatus;
  onClose: () => void;
  onOpenAgent: (entry: SubAgentEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const layerFrame = useLayerFrame();
  const insets = useSafeAreaInsets();
  const { scrollProps, indicator } = useScrollIndicator();
  useDismissKeyboard();

  const running = useMemo(() => rows.filter(row => row.entry.status === 'running').length, [rows]);

  const renderRow = useCallback(
    ({ item }: { item: RosterRow }) => <AgentRow row={item} onOpen={onOpenAgent} />,
    [onOpenAgent],
  );

  return (
    <View {...keyLayerProps('page')} style={[StyleSheet.absoluteFill, styles.stage, layerFrame]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${parentTitle}`}>
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title} numberOfLines={1}>
            Sub-agents
          </Text>
          {/* The count lives here rather than as a section header: it is the one figure the screen
              is worth opening for ("what is running while I read"). */}
          <Text style={styles.headerSub} numberOfLines={1}>
            {[subtitle ?? parentTitle, rows.length > 0 ? `${rows.length} agent${rows.length === 1 ? '' : 's'}` : '', running > 0 ? `${running} running` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      {status === 'unsupported' ? (
        <Text style={styles.empty}>this server does not report sub-agents · update it to see them</Text>
      ) : status === 'unknown' ? (
        <Text style={styles.empty}>loading agents</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>no sub-agent yet · the agent creates them when it delegates</Text>
      ) : null}

      <View style={styles.listWrap}>
        {/* Virtualized: a conversation keeps every one-shot it spawned, so this list has no
            ceiling. */}
        <FlatList
          {...scrollProps}
          data={rows}
          keyExtractor={keyOfRow}
          renderItem={renderRow}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={9}
          removeClippedSubviews={Platform.OS === 'android'}
        />
        {indicator}
      </View>
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
    empty: {
      color: palette.textMuted,
      fontSize: font.small,
      textAlign: 'center',
      paddingVertical: space.lg,
      paddingHorizontal: space.lg,
    },
    listWrap: {
      flex: 1,
      minHeight: 0,
    },
    body: {
      paddingHorizontal: space.sm,
      paddingTop: space.xs,
      paddingBottom: space.xl,
    },
    /**
     * A row, not a card: the conversation list's own metrics. A roster is scanned for a name, and a
     * border per entry turns a list into a stack of boxes.
     */
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.xs,
      paddingVertical: space.sm,
      paddingHorizontal: space.xs,
      borderRadius: radius.sm,
    },
    rowPressed: { backgroundColor: palette.surfaceAlt },
    /** The running slot, reserved: without it a busy row's name starts left of every idle one. */
    mark: { width: 12, paddingTop: 4, alignItems: 'center' },
    busyDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.accent },
    main: { flex: 1, minWidth: 0, gap: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    name: {
      flex: 1,
      color: palette.text,
      fontSize: font.meta,
      fontWeight: '500',
      fontFamily: 'monospace',
    },
    /**
     * When it last spoke: the conversation list's own figure, same corner, same ink. `tabular-nums`
     * because a column of times read down is a column, and proportional digits stagger it.
     */
    date: { flexShrink: 0, color: palette.textMeta, fontSize: font.micro, fontVariant: ['tabular-nums'] },
    meta: { color: palette.textMuted, fontSize: font.small },
    model: { color: palette.textMeta, fontSize: font.micro },
    /** Not the pin: the run is on another account right now. */
    modelLive: { color: palette.accent },
  });
}
