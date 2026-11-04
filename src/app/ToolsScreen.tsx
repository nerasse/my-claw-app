import { ChevronIcon } from '../components/icons';
import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { ToolEntry } from '../core/protocol';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { CloseButton } from '../components/CloseButton';
import { LinkRow, Section } from './settingsParts';

/** Display names of the three sources, with the server-side location as the honest hint. */
const SOURCE_SECTIONS: Array<{
  source: ToolEntry['source'];
  label: string;
  hint: string;
}> = [
  {
    source: 'built-in',
    label: 'Built-in',
    hint: 'registered statically · available to every agent by default',
  },
  {
    source: 'plugin',
    label: 'Custom',
    hint: '~/.my-claw/tools.d · your own modules, hot-reloaded',
  },
  {
    source: 'mcp',
    label: 'MCP',
    hint: 'external servers · wiring and state on the MCPs page',
  },
];

/** The tools of one source in catalog order, with section headers. MCP tools are sub-grouped
 *  per server so the phone tells one server's namespace apart without guessing. `missing` rows
 *  are denylist names no tool carries anymore: rendered red, one tap toggles them off and away. */
type Row =
  | { kind: 'header'; source: ToolEntry['source'] }
  | { kind: 'missingHeader' }
  | { kind: 'missing'; name: string }
  | { kind: 'mcpHeader'; server: string }
  | { kind: 'tool'; tool: ToolEntry };

function buildRows(tools: ToolEntry[]): Row[] {
  const rows: Row[] = [];
  for (const section of SOURCE_SECTIONS) {
    const ofSource = tools.filter(tool => tool.source === section.source);
    if (ofSource.length === 0) continue;
    rows.push({ kind: 'header', source: section.source });
    if (section.source === 'mcp') {
      const servers = [
        ...new Set(ofSource.map(tool => tool.server ?? 'unknown')),
      ];
      for (const server of servers) {
        rows.push({ kind: 'mcpHeader', server });
        for (const tool of ofSource.filter(
          t => (t.server ?? 'unknown') === server,
        )) {
          rows.push({ kind: 'tool', tool });
        }
      }
    } else {
      for (const tool of ofSource) rows.push({ kind: 'tool', tool });
    }
  }
  return rows;
}

const keyOfRow = (row: Row): string =>
  row.kind === 'header'
    ? `h:${row.source}`
    : row.kind === 'missingHeader'
      ? 'missing:h'
      : row.kind === 'missing'
        ? `missing:${row.name}`
        : row.kind === 'mcpHeader'
          ? `m:${row.server}`
          : `t:${row.tool.source}:${row.tool.server ?? ''}:${row.tool.name}`;

/** The short part of `mcp__<server>__<tool>`: the page already groups by server. */
function shortName(tool: ToolEntry): string {
  const prefix = tool.server ? `mcp__${tool.server}__` : '';
  return tool.name.startsWith(prefix)
    ? tool.name.slice(prefix.length)
    : tool.name;
}

export function ToolsScreen({
  tools,
  missing,
  error,
  saving,
  onBack,
  onToggle,
  onOpenMcps,
  onConfirm,
  onOpenApprovals,
}: {
  tools: ToolEntry[];
  /** Denylist names no tool carries anymore: rendered red so they can be toggled off and away. */
  missing: string[];
  /** Server refused the request: distinct from an empty catalog, which is itself a fact. */
  error?: string;
  saving: boolean;
  onBack: () => void;
  onToggle: (name: string, disabled: boolean) => void;
  /** The servers that bring the MCP tools: their own page, under this one. */
  onOpenMcps?: () => void;
  /** Ask before each run of a tool, or stop asking (server docs/tool-approvals.md). */
  onConfirm?: (name: string, confirm: boolean) => void;
  /** What the agent was allowed to run, and what was refused. */
  onOpenApprovals?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // nothing to type into on this page.
  useDismissKeyboard();
  const { scrollProps, indicator } = useScrollIndicator();
  // The catalogue is built-ins plus tools.d plus every MCP namespace, so it reaches the hundreds
  // and buildRows walks it several times over. Held across renders, and handed to the list as one
  // array: rebuilt inline, `data` was a new identity on every frame the shell received and the
  // list could never conclude that nothing had moved.
  const rows = useMemo(() => {
    const missingRows: Row[] =
      missing.length > 0
        ? [
            { kind: 'missingHeader' },
            ...missing.map(name => ({ kind: 'missing' as const, name })),
          ]
        : [];
    return [...missingRows, ...buildRows(tools)];
  }, [missing, tools]);
  const disabledCount = useMemo(
    () => tools.filter(tool => tool.disabled).length,
    [tools],
  );
  // One string: a Text split across expressions reads as an array to textsOf in tests.
  const subtitle = `${tools.length} tool${tools.length === 1 ? '' : 's'}${
    disabledCount > 0 ? ` · ${disabledCount} disabled` : ''
  }${missing.length > 0 ? ` · ${missing.length} removed` : ''}`;

  const renderRow = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'missingHeader' ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>removed</Text>
          <Text style={styles.sectionHint}>
            in the denylist, no tool has the name
          </Text>
        </View>
      ) : item.kind === 'missing' ? (
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.removedName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.description} numberOfLines={1}>
              no tool carries this name anymore
            </Text>
          </View>
          <Pressable
            onPress={() => onToggle(item.name, false)}
            disabled={saving}
            style={[styles.toggleButton, styles.toggleOn]}
            accessibilityRole="button"
            accessibilityState={{ checked: false }}
            accessibilityLabel={`Drop removed tool ${item.name}`}
          >
            <Text style={styles.toggleTextOn}>drop</Text>
          </Pressable>
        </View>
      ) : item.kind === 'header' ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{sectionLabel(item.source)}</Text>
          <Text style={styles.sectionHint}>{sectionHint(item.source)}</Text>
        </View>
      ) : item.kind === 'mcpHeader' ? (
        <View style={styles.mcpSection}>
          <Text style={styles.mcpLabel}>{item.server}</Text>
          <Text style={styles.sectionHint}>{`mcp__${item.server}__*`}</Text>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <View style={styles.rowTitleLine}>
              <Text style={styles.toolName} numberOfLines={1}>
                {shortName(item.tool)}
              </Text>
              {item.tool.disabled ? (
                <Text
                  style={styles.badge}
                  accessibilityLabel={`${item.tool.name} disabled`}
                >
                  disabled
                </Text>
              ) : null}
              {item.tool.confirm ? (
                <Text style={styles.badge} accessibilityLabel={`${item.tool.name} asks first`}>
                  asks first
                </Text>
              ) : null}
            </View>
            <Text style={styles.description} numberOfLines={2}>
              {item.tool.description}
            </Text>
          </View>
          {/* Absent on a server that cannot ask (older than 0.7.86): no switch that would do nothing. */}
          {onConfirm && item.tool.confirm !== undefined && !item.tool.disabled ? (
            <Pressable
              onPress={() => onConfirm(item.tool.name, !item.tool.confirm)}
              disabled={saving}
              style={[styles.toggleButton, item.tool.confirm ? styles.askOn : styles.askOff]}
              accessibilityRole="switch"
              accessibilityState={{ checked: item.tool.confirm === true }}
              accessibilityLabel={`Ask before running ${item.tool.name}`}>
              <Text style={item.tool.confirm ? styles.askTextOn : styles.askTextOff}>ask</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => onToggle(item.tool.name, !item.tool.disabled)}
            disabled={saving}
            style={[
              styles.toggleButton,
              item.tool.disabled ? styles.toggleOn : styles.toggleOff,
            ]}
            accessibilityRole="button"
            accessibilityState={{ checked: !item.tool.disabled }}
            accessibilityLabel={`${item.tool.disabled ? 'Enable' : 'Disable'} tool ${item.tool.name}`}
          >
            <Text
              style={
                item.tool.disabled ? styles.toggleTextOn : styles.toggleTextOff
              }
            >
              {item.tool.disabled ? 'off' : 'on'}
            </Text>
          </Pressable>
        </View>
      ),
    [onToggle, onConfirm, saving, styles],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <ChevronIcon direction="left" size={22} tone="text" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tools</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <CloseButton />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`Tools error ${error}`}>
          {error}
        </Text>
      ) : null}

      <View style={styles.listArea}>
        <FlatList
          {...scrollProps}
          style={styles.list}
          data={rows}
          keyExtractor={keyOfRow}
          contentContainerStyle={
            rows.length === 0 ? styles.emptyContent : styles.listContent
          }
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={50}
          windowSize={9}
          ListHeaderComponent={
            onOpenMcps || onOpenApprovals ? (
              <Section title="more">
                {onOpenMcps ? <LinkRow title="MCP servers" hint="add, remove, enable" onPress={onOpenMcps} label="Open MCPs" /> : null}
                {onOpenApprovals ? (
                  <LinkRow
                    title="Approval history"
                    hint="what the agent asked to run, allowed and refused · ask on a tool below"
                    onPress={onOpenApprovals}
                    label="Open tool approvals"
                  />
                ) : null}
              </Section>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ? undefined : 'no tools found'}
            </Text>
          }
          renderItem={renderRow}
        />
        {indicator}
      </View>
    </View>
  );
}

function sectionLabel(source: ToolEntry['source']): string {
  return (
    SOURCE_SECTIONS.find(section => section.source === source)?.label ?? source
  );
}

function sectionHint(source: ToolEntry['source']): string {
  return SOURCE_SECTIONS.find(section => section.source === source)?.hint ?? '';
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
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
  headerText: { flex: 1, gap: 1 },
  title: {
    fontSize: font.title,
    fontWeight: '600' as const,
    color: palette.text,
  },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
  listArea: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: space.xl },
  emptyContent: {
    flexGrow: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  empty: { fontSize: font.meta, color: palette.textFaint },
  section: {
    marginTop: space.lg,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    gap: 1,
  },
  mcpSection: {
    marginTop: space.md,
    marginBottom: 2,
    paddingHorizontal: space.md,
    gap: 1,
  },
  mcpLabel: {
    fontSize: font.small,
    color: palette.accent,
    fontWeight: '600' as const,
  },
  sectionLabel: {
    fontSize: font.micro,
    color: palette.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  sectionHint: { fontSize: font.small, color: palette.textFaint },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  toolName: {
    flexShrink: 1,
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.text,
  },
  removedName: {
    fontSize: font.body,
    fontWeight: '600' as const,
    color: palette.danger,
  },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  toggleButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  toggleOn: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
  },
  toggleOff: {
    borderColor: palette.accent,
    backgroundColor: palette.surfaceAlt,
  },
  // Asking is the exception: lit when on, quiet when off, so the few tools that ask stand out
  // instead of every row wearing the accent.
  askOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  askOff: { backgroundColor: 'transparent', borderColor: palette.border },
  askTextOn: { fontSize: font.small, fontWeight: '600' as const, color: palette.accentText },
  askTextOff: { fontSize: font.small, fontWeight: '600' as const, color: palette.textFaint },
  toggleTextOn: {
    fontSize: font.small,
    fontWeight: '600' as const,
    color: palette.textMuted,
  },
  toggleTextOff: {
    fontSize: font.small,
    fontWeight: '600' as const,
    color: palette.accent,
  },
  description: {
    fontSize: font.small,
    color: palette.textMuted,
    lineHeight: 16,
  },
});
