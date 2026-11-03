import { ChevronIcon } from '../components/icons';
import React, { useCallback, useMemo } from 'react';
import { Platform, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { scopeLabelOf, type RosterGroup, type RosterRow, type SubAgentsStatus } from '../core/subagents';
import type { SubAgentEntry } from '../core/protocol';
import { useLayerFrame } from '../core/layout';
import { keyLayerProps } from '../core/keyNav';

/**
 * A group as the list consumes it. `showMajor` is decided once, here, rather than by having every
 * header look back at the group before it on every render.
 */
type AgentSection = { major: string; type: string; showMajor: boolean; data: RosterRow[] };

const keyOfRow = (row: RosterRow): string => row.key;

/** One sub-agent. Memoized: a busy conversation keeps every one-shot it ever spawned. */
const AgentCard = React.memo(function AgentCardView({
  row,
  onOpen,
}: {
  row: RosterRow;
  onOpen: (entry: SubAgentEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const entry = row.entry;
  return (
    <Pressable
      style={styles.card}
      onPress={() => onOpen(entry)}
      accessibilityRole="button"
      accessibilityLabel={`Open sub-agent ${entry.id}, ${entry.status}`}>
      <View style={styles.cardHead}>
        <Text style={row.kind === 'temporary' ? styles.glyphFaint : styles.glyph}>
          {row.kind === 'temporary' ? '◇' : '◈'}
        </Text>
        {/* The id, not the display name: the model picks names and repeats them. */}
        <Text style={styles.cardTitle} numberOfLines={1}>
          {entry.id.replace(/^subagent\//, '')}
        </Text>
        {entry.status === 'running' ? (
          <Text style={styles.running}>● running</Text>
        ) : (
          <Text style={styles.state}>idle</Text>
        )}
      </View>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {`${entry.messageCount} msg${entry.messageCount === 1 ? '' : 's'} · ${scopeLabelOf(entry)}`}
        {row.kind === 'temporary' ? ' · one-shot' : ''}
        {entry.model ? ` · ${entry.model}` : ''}
      </Text>
    </Pressable>
  );
});

/**
 * The sub-agents of one conversation, grouped named-then-temporary and by agent type inside each.
 * The split is not cosmetic: a named sub-agent lives until killed, while a one-shot (a kept
 * `run-` session) dies with its parent conversation. Both open as a real chat, though.
 *
 * Picking a row closes this screen. It is a chooser, not a level to come back to, which is what
 * lets the sub-agent's own header name the parent conversation instead of naming this list.
 */
export function AgentsScreen({
  parentTitle,
  subtitle,
  groups,
  status,
  onClose,
  onOpenAgent,
}: {
  /** What the back row returns to. */
  parentTitle: string;
  /** What this list is a list of; defaults to the parent, which is not always what it means. */
  subtitle?: string;
  groups: RosterGroup[];
  status: SubAgentsStatus;
  onClose: () => void;
  onOpenAgent: (entry: SubAgentEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const layerFrame = useLayerFrame();
  const insets = useSafeAreaInsets();
  const { scrollProps, indicator } = useScrollIndicator();
  useDismissKeyboard();

  const total = useMemo(() => groups.reduce((sum, group) => sum + group.rows.length, 0), [groups]);
  const sections = useMemo<AgentSection[]>(
    () =>
      groups.map((group, index) => ({
        major: group.major,
        type: group.type,
        showMajor: index === 0 || groups[index - 1]!.major !== group.major,
        data: group.rows,
      })),
    [groups],
  );

  const renderRow = useCallback(
    ({ item }: { item: RosterRow }) => <AgentCard row={item} onOpen={onOpenAgent} />,
    [onOpenAgent],
  );
  const renderSectionHeader = useCallback(
    ({ section }: { section: AgentSection }) => (
      <View>
        {section.showMajor ? (
          <View style={styles.majorHead}>
            <Text style={styles.major}>{section.major}</Text>
            {section.major === 'temporary' ? <Text style={styles.majorNote}>read-only</Text> : null}
          </View>
        ) : null}
        <Text style={styles.minor} numberOfLines={1}>
          {section.type}
        </Text>
      </View>
    ),
    [styles],
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
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle ?? parentTitle}
          </Text>
        </View>
      </View>

      {status === 'unsupported' ? (
        <Text style={styles.empty}>this server does not report sub-agents · update it to see them</Text>
      ) : status === 'unknown' ? (
        <Text style={styles.empty}>loading agents</Text>
      ) : total === 0 ? (
        <Text style={styles.empty}>no sub-agent yet · the agent creates them when it delegates</Text>
      ) : null}

      <View style={styles.listWrap}>
        {/* Virtualized: a conversation keeps every one-shot it spawned, so this list has no
            ceiling. Headers do not stick — they are read as separators, not as a position. */}
        <SectionList
          {...scrollProps}
          sections={sections}
          keyExtractor={keyOfRow}
          renderItem={renderRow}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
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
      padding: space.md,
      paddingBottom: space.xl,
    },
    majorHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space.md,
      marginBottom: space.xs,
    },
    major: {
      color: palette.textFaint,
      fontSize: font.micro,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    majorNote: {
      color: palette.textFaint,
      fontSize: font.micro,
    },
    minor: {
      color: palette.textMuted,
      fontSize: font.meta,
      fontFamily: 'monospace',
      marginTop: space.sm,
      marginBottom: space.xs,
    },
    card: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      marginBottom: space.xs,
      gap: 2,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    glyph: {
      color: palette.accent,
      fontSize: font.meta,
    },
    glyphFaint: {
      color: palette.textFaint,
      fontSize: font.meta,
    },
    cardTitle: {
      flex: 1,
      color: palette.text,
      fontSize: font.meta,
      fontWeight: '600',
      fontFamily: 'monospace',
    },
    running: {
      color: palette.accent,
      fontSize: font.micro,
      fontWeight: '600',
    },
    state: {
      color: palette.textFaint,
      fontSize: font.micro,
    },
    cardMeta: {
      color: palette.textMuted,
      fontSize: font.small,
    },
  });
}
