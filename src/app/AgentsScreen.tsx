import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useScrollIndicator } from '../components/ScrollIndicator';
import type { RosterGroup, SubAgentsStatus } from '../core/subagents';
import type { SubAgentEntry } from '../core/protocol';

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
  groups,
  status,
  onClose,
  onOpenAgent,
}: {
  parentTitle: string;
  groups: RosterGroup[];
  status: SubAgentsStatus;
  onClose: () => void;
  onOpenAgent: (entry: SubAgentEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { scrollProps, indicator } = useScrollIndicator();
  useDismissKeyboard();

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${parentTitle}`}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title} numberOfLines={1}>
            Agents
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {parentTitle}
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
        <ScrollView {...scrollProps} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {groups.map((group, index) => (
            <View key={`${group.major}/${group.type}`}>
              {index === 0 || groups[index - 1]!.major !== group.major ? (
                <View style={styles.majorHead}>
                  <Text style={styles.major}>{group.major}</Text>
                  {group.major === 'temporary' ? <Text style={styles.majorNote}>read-only</Text> : null}
                </View>
              ) : null}
              <Text style={styles.minor} numberOfLines={1}>
                {group.type}
              </Text>
              {group.rows.map(row => (
                <Pressable
                  key={row.key}
                  style={styles.card}
                  onPress={() => onOpenAgent(row.entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open sub-agent ${row.entry.id}, ${row.entry.status}`}>
                  <View style={styles.cardHead}>
                    <Text style={row.kind === 'temporary' ? styles.glyphFaint : styles.glyph}>
                      {row.kind === 'temporary' ? '◇' : '◈'}
                    </Text>
                    {/* The id, not the display name: the model picks names and repeats them. */}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {row.entry.id.replace(/^subagent\//, '')}
                    </Text>
                    {row.entry.status === 'running' ? (
                      <Text style={styles.running}>● running</Text>
                    ) : (
                      <Text style={styles.state}>idle</Text>
                    )}
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {`${row.entry.messageCount} msg${row.entry.messageCount === 1 ? '' : 's'} · ${row.entry.visibility}`}
                    {row.kind === 'temporary' ? ' · one-shot' : ''}
                    {row.entry.model ? ` · ${row.entry.model}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
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
