import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { composeNodeDescription, nodesStore, useNodes } from '../core/nodes';
import type { NodeMcpConfig, NodeMcpEntry } from '../core/protocol';
import { BackButton, headerStyle } from '../components/BackButton';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { ActionSheet } from '../components/ActionSheet';
import { CloseButton } from '../components/CloseButton';
import { useDismissKeyboard } from '../core/keyboard';

function since(iso: string | undefined): string {
  if (!iso) return 'never seen';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'never seen';
  const minutes = Math.floor((Date.now() - at) / 60000);
  if (minutes < 2) return 'seen just now';
  if (minutes < 60) return `seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `seen ${hours} h ago`;
  return `seen ${Math.floor(hours / 24)} d ago`;
}

function detail(iso: string | undefined): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  return Number.isNaN(at) ? '' : new Date(at).toLocaleString();
}

/**
 * One node: its name, what its agent tells the orchestrator, and what it may run there.
 *
 * The switches are server state and are never edited locally -- a write that failed must not
 * leave a tool looking exposed when it is not. The two text fields are the exception: they hold
 * what is being typed until Save, and the server's answer is what the roster shows after.
 */
export function NodeScreen({
  nodeId,
  onBack,
  connected,
  serverVersion,
}: {
  nodeId: string;
  onBack: () => void;
  connected: boolean;
  /** The server's own version: a node behind it is offered the update, here on demand. */
  serverVersion?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const { scrollProps, indicator } = useScrollIndicator();
  const state = useNodes();
  const node = state.nodes.find(candidate => candidate.nodeId === nodeId) ?? null;
  const [name, setName] = useState(node?.name ?? '');
  const [description, setDescription] = useState(node?.description ?? '');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [guided, setGuided] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [reaches, setReaches] = useState('');
  const [never, setNever] = useState('');
  const [mcpEditor, setMcpEditor] = useState<McpEditor | null>(null);
  const [removingMcp, setRemovingMcp] = useState<NodeMcpEntry | null>(null);

  // Seeded once per node, when the roster has it: a refresh must not clobber what is being typed.
  useEffect(() => {
    if (!node || seededFor === node.nodeId) return;
    setName(node.name);
    setDescription(node.description ?? '');
    setSeededFor(node.nodeId);
  }, [node, seededFor]);

  useEffect(() => {
    if (connected) nodesStore.refresh();
  }, [connected]);
  useEffect(
    () => () => {
      nodesStore.clearMessages();
    },
    [],
  );

  const exposed = node?.exposed ?? node?.tools ?? [];
  const busy = state.busy;

  const configuredMcp = (): Record<string, NodeMcpConfig> =>
    Object.fromEntries(
      (node?.mcp ?? []).filter(entry => !entry.external && entry.config).map(entry => [entry.name, entry.config as NodeMcpConfig]),
    );

  const editMcp = (entry: NodeMcpEntry): void => {
    const config = entry.config;
    setMcpEditor({
      original: entry.name,
      name: entry.name,
      transport: config?.transport === "http" || config?.transport === "sse" ? config.transport : "stdio",
      command: config?.command ?? "",
      args: (config?.args ?? []).join(" "),
      url: config?.url ?? "",
    });
  };

  const saveMcp = (): void => {
    if (!node || !mcpEditor) return;
    const server = mcpEditor.name.trim();
    if (!server) return;
    const next = configuredMcp();
    if (mcpEditor.original && mcpEditor.original !== server) delete next[mcpEditor.original];
    next[server] =
      mcpEditor.transport === "stdio"
        ? { transport: "stdio", command: mcpEditor.command.trim(), ...(mcpEditor.args.trim() ? { args: mcpEditor.args.trim().split(/\s+/) } : {}) }
        : { transport: mcpEditor.transport, url: mcpEditor.url.trim() };
    nodesStore.setMcp(node.nodeId, next);
    setMcpEditor(null);
  };

  const removeMcp = (): void => {
    if (!node || !removingMcp) return;
    const next = configuredMcp();
    delete next[removingMcp.name];
    nodesStore.setMcp(node.nodeId, next);
    setRemovingMcp(null);
  };

  const toggleTool = (tool: string, on: boolean): void => {
    if (!node) return;
    const next = on ? [...exposed, tool] : exposed.filter(candidate => candidate !== tool);
    // Everything on again removes the narrowing rather than freezing today's list, so a tool the
    // machine starts offering later is exposed without a visit here.
    const all = node.tools.every(candidate => next.includes(candidate));
    nodesStore.setAccess(node.nodeId, { tools: all ? null : next });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label="Back to the nodes" />
        <Text style={styles.title} numberOfLines={1}>
          {node?.name ?? 'Node'}
        </Text>
        <CloseButton />
      </View>

      <ScrollView {...scrollProps} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!node ? (
          <Text style={styles.hint}>
            {state.status === 'unknown'
              ? connected
                ? 'loading'
                : 'Connect to your server to load the node.'
              : 'This node is no longer paired.'}
          </Text>
        ) : (
          <>
            {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
            {state.notice ? <Text style={styles.notice}>{state.notice}</Text> : null}

            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.switchTitle}>Enabled</Text>
                  <Text style={styles.hint}>
                    off: its agent does not run. The machine stays paired and connected, and nothing else changes.
                  </Text>
                </View>
                <Switch
                  value={node.disabled !== true}
                  onValueChange={value => nodesStore.setAccess(node.nodeId, { disabled: !value })}
                  disabled={busy}
                  accessibilityLabel="Enabled"
                  accessibilityRole="switch"
                />
              </View>
              {node.disabled ? <Text style={styles.detail}>its agent is off; a spawn says so</Text> : null}
            </View>

            {node.online && serverVersion && node.version && node.version !== serverVersion ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Update</Text>
                <Text style={styles.hint}>
                  {`This machine runs ${node.version}, the server runs ${serverVersion}. Its own retry waits half an hour between attempts; this asks it now.`}
                </Text>
                <Pressable
                  style={[styles.button, styles.approve, busy && styles.busy]}
                  onPress={() => nodesStore.update(node.nodeId)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Update now">
                  <Text style={styles.buttonText}>Update now</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Name</Text>
              <Text style={styles.hint}>Its agent file follows it, so node-{'{name}'} stays recognisable.</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Node name"
              />
              <Pressable
                style={[styles.button, styles.approve, (busy || !name.trim() || name.trim() === node.name) && styles.busy]}
                onPress={() => nodesStore.rename(node.nodeId, name)}
                disabled={busy || !name.trim() || name.trim() === node.name}
                accessibilityRole="button"
                accessibilityLabel="Save the name">
                {busy ? <ActivityIndicator size="small" /> : <Text style={styles.buttonText}>Save</Text>}
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Description</Text>
              <Text style={styles.hint}>What the orchestrator reads when it picks this node's agent: what it is for, what it reaches, what must never be touched.</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                multiline
                accessibilityLabel="Node description"
              />
              <Pressable
                onPress={() => setGuided(current => !current)}
                accessibilityRole="button"
                accessibilityLabel="Guided fields">
                <Text style={styles.link}>{guided ? 'hide the guided fields' : 'guided fields'}</Text>
              </Pressable>
              {guided ? (
                <View style={styles.guided}>
                  <Text style={styles.hint}>
                    Three answers, one line: they are joined into the description above, which stays editable before
                    you save it.
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={purpose}
                    onChangeText={setPurpose}
                    placeholder="what it is for"
                    accessibilityLabel="What it is for"
                  />
                  <TextInput
                    style={styles.input}
                    value={reaches}
                    onChangeText={setReaches}
                    placeholder="what it reaches (network, services, data)"
                    accessibilityLabel="What it reaches"
                  />
                  <TextInput
                    style={styles.input}
                    value={never}
                    onChangeText={setNever}
                    placeholder="what must never be touched"
                    accessibilityLabel="What must never be touched"
                  />
                  <Pressable
                    style={[styles.button, (!purpose.trim() && !reaches.trim() && !never.trim()) && styles.busy]}
                    onPress={() => setDescription(composeNodeDescription({ purpose, reaches, never }))}
                    disabled={!purpose.trim() && !reaches.trim() && !never.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="Compose the description">
                    <Text style={styles.buttonText}>Compose</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                style={[styles.button, styles.approve, (busy || !description.trim() || description.trim() === (node.description ?? '')) && styles.busy]}
                onPress={() => nodesStore.describe(node.nodeId, description)}
                disabled={busy || !description.trim() || description.trim() === (node.description ?? '')}
                accessibilityRole="button"
                accessibilityLabel="Save the description">
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
              {node.agent ? <Text style={styles.detail}>{`agent ${node.agent}`}</Text> : <Text style={styles.detail}>no agent file</Text>}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>MCP servers</Text>
              <Text style={styles.hint}>
                Servers this machine runs for my-claw. It starts them itself; its own config stays the ceiling for what
                they may reach.
              </Text>
              {(node.mcp ?? []).length === 0 ? <Text style={styles.hint}>none</Text> : null}
              {(node.mcp ?? []).map(entry => (
                <View key={entry.name} style={styles.mcpRow}>
                  <View style={styles.mcpMain}>
                    <Text style={styles.toolName}>{entry.name}</Text>
                    <Text style={styles.detail} numberOfLines={2}>
                      {`${entry.transport}${entry.target ? ` · ${entry.target}` : ""}`}
                    </Text>
                    <Text style={styles.detail}>
                      {entry.external
                        ? "not managed here"
                        : entry.ok === undefined
                          ? "waiting for the machine"
                          : entry.ok
                            ? `${entry.tools ?? 0} tool${entry.tools === 1 ? "" : "s"}`
                            : `failed: ${entry.error ?? "unknown"}`}
                    </Text>
                  </View>
                  {entry.external ? null : (
                    <View style={styles.mcpActions}>
                      <Pressable onPress={() => editMcp(entry)} accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`}>
                        <Text style={styles.link}>edit</Text>
                      </Pressable>
                      <Pressable onPress={() => setRemovingMcp(entry)} accessibilityRole="button" accessibilityLabel={`Remove ${entry.name}`}>
                        <Text style={styles.removeLink}>remove</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
              {mcpEditor ? (
                <View style={styles.guided}>
                  <TextInput
                    style={styles.input}
                    value={mcpEditor.name}
                    onChangeText={value => setMcpEditor(current => (current ? { ...current, name: value } : current))}
                    placeholder="name, e.g. godot"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="MCP name"
                  />
                  <View style={styles.segment}>
                    {(["stdio", "http"] as const).map(transport => (
                      <Pressable
                        key={transport}
                        style={[styles.segmentItem, mcpEditor.transport === transport ? styles.segmentItemActive : null]}
                        onPress={() => setMcpEditor(current => (current ? { ...current, transport } : current))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: mcpEditor.transport === transport }}
                        accessibilityLabel={`Transport ${transport}`}>
                        <Text style={[styles.segmentText, mcpEditor.transport === transport ? styles.segmentTextActive : null]}>
                          {transport === "stdio" ? "command (stdio)" : "URL (http)"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {mcpEditor.transport === "stdio" ? (
                    <>
                      <TextInput
                        style={styles.input}
                        value={mcpEditor.command}
                        onChangeText={value => setMcpEditor(current => (current ? { ...current, command: value } : current))}
                        placeholder="command, e.g. godot-mcp"
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="MCP command"
                      />
                      <TextInput
                        style={styles.input}
                        value={mcpEditor.args}
                        onChangeText={value => setMcpEditor(current => (current ? { ...current, args: value } : current))}
                        placeholder="arguments, separated by spaces"
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="MCP arguments"
                      />
                    </>
                  ) : (
                    <TextInput
                      style={styles.input}
                      value={mcpEditor.url}
                      onChangeText={value => setMcpEditor(current => (current ? { ...current, url: value } : current))}
                      placeholder="http://127.0.0.1:8000/mcp"
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel="MCP URL"
                    />
                  )}
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.button, styles.grow, styles.approve, (busy || !mcpEditor.name.trim() || !(mcpEditor.transport === "stdio" ? mcpEditor.command.trim() : mcpEditor.url.trim())) && styles.busy]}
                      onPress={saveMcp}
                      disabled={busy || !mcpEditor.name.trim() || !(mcpEditor.transport === "stdio" ? mcpEditor.command.trim() : mcpEditor.url.trim())}
                      accessibilityRole="button"
                      accessibilityLabel="Save the MCP server">
                      <Text style={styles.buttonText}>Save</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.grow]}
                      onPress={() => setMcpEditor(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel the MCP server">
                      <Text style={styles.buttonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.button}
                  onPress={() => setMcpEditor({ original: null, name: "", transport: "stdio", command: "", args: "", url: "" })}
                  accessibilityRole="button"
                  accessibilityLabel="Add an MCP server">
                  <Text style={styles.buttonText}>Add a server</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>What it may run</Text>
              <Text style={styles.hint}>
                A tool left off is absent from the agent's set. The machine's own config is the ceiling: a tool it does
                not expose cannot be added here.
              </Text>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.switchTitle}>Ask before running anything</Text>
                  <Text style={styles.hint}>the sheet appears once per tool, then the session covers the rest</Text>
                </View>
                <Switch
                  value={node.approval === true}
                  onValueChange={value => nodesStore.setAccess(node.nodeId, { approval: value })}
                  disabled={busy}
                  accessibilityLabel="Ask before running anything"
                  accessibilityRole="switch"
                />
              </View>
              {node.tools.length === 0 ? (
                <Text style={styles.hint}>This machine announced no tool. Its config.json decides what it offers.</Text>
              ) : null}
              {node.tools.map(tool => (
                <View key={tool} style={styles.switchRow}>
                  <View style={styles.switchLabel}>
                    <Text style={styles.toolName}>{tool}</Text>
                  </View>
                  <Switch
                    value={exposed.includes(tool)}
                    onValueChange={value => toggleTool(tool, value)}
                    disabled={busy}
                    accessibilityLabel={`Expose ${tool}`}
                    accessibilityRole="switch"
                  />
                </View>
              ))}
              <Text style={styles.detail}>
                {node.exposed ? `${exposed.length} of ${node.tools.length} exposed` : `${node.tools.length} tools exposed`}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>This machine</Text>
              <Text style={styles.detail}>{node.online ? 'online now' : since(node.lastSeenAt)}</Text>
              <Text style={styles.detail}>{[node.os, node.arch].filter(Boolean).join(' ') || 'no facts yet'}</Text>
              {node.hostname ? <Text style={styles.detail} selectable>{`host ${node.hostname}`}</Text> : null}
              {node.user ? <Text style={styles.detail}>{`user ${node.user}${node.mode ? ` · ${node.mode} mode` : ''}`}</Text> : null}
              {node.version ? <Text style={styles.detail}>{`node client ${node.version}`}</Text> : null}
              {node.createdAt ? <Text style={styles.detail}>{`paired ${detail(node.createdAt)}`}</Text> : null}
              <Text style={styles.detail} selectable>{node.nodeId}</Text>
            </View>

            <Pressable
              style={[styles.button, styles.revoke]}
              onPress={() => setConfirming(true)}
              accessibilityRole="button"
              accessibilityLabel="Revoke this node">
              <Text style={styles.revokeText}>Revoke</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      {indicator}

      {removingMcp && node ? (
        <ActionSheet
          preview={`Stop "${removingMcp.name}" on "${node.name}"? The machine closes the server and drops its tools; nothing else changes.`}
          options={[{ label: "Remove", danger: true, onPress: removeMcp }]}
          onClose={() => setRemovingMcp(null)}
        />
      ) : null}

      {confirming && node ? (
        <ActionSheet
          preview={`Revoke "${node.name}"? Its socket closes at once, its credential stops working, and its agent file is removed. The client stays installed on that machine.`}
          options={[
            {
              label: 'Revoke',
              danger: true,
              onPress: () => {
                nodesStore.revoke(node.nodeId);
                setConfirming(false);
                onBack();
              },
            },
          ]}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </View>
  );
}

interface McpEditor {
  /** The name it had before the edit, absent for a new server. */
  original: string | null;
  name: string;
  transport: "stdio" | "http" | "sse";
  command: string;
  args: string;
  url: string;
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: headerStyle(palette),

  title: { flexShrink: 1, fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  content: { paddingVertical: space.md, gap: space.sm, paddingBottom: space.xl },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  hint: { fontSize: font.small, color: palette.textMuted },
  detail: { fontSize: font.small, color: palette.textFaint },
  error: { fontSize: font.small, color: palette.danger },
  notice: { fontSize: font.small, color: palette.accent },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    color: palette.text,
    backgroundColor: palette.bg,
    fontSize: font.body,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' as const },
  button: {
    minHeight: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  approve: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  busy: { opacity: 0.7 },
  revoke: { borderColor: palette.danger },
  revokeText: { fontSize: font.small, color: palette.danger, fontWeight: '600' as const },
  buttonText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: 4,
  },
  switchLabel: { flex: 1 },
  switchTitle: { color: palette.text, fontSize: font.body, fontWeight: '600' as const },
  toolName: { color: palette.text, fontSize: font.body },
  link: { fontSize: font.small, color: palette.accent },
  removeLink: { fontSize: font.small, color: palette.danger },
  segment: {
    flexDirection: 'row' as const,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: 2,
    gap: 2,
  },
  segmentItem: { flex: 1, alignItems: 'center' as const, paddingVertical: 8, borderRadius: radius.sm - 1 },
  segmentItemActive: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.accent },
  segmentText: { fontSize: font.meta, color: palette.textMuted },
  segmentTextActive: { color: palette.text, fontWeight: '600' as const },
  actions: { flexDirection: 'row' as const, gap: space.sm },
  grow: { flex: 1, alignItems: 'center' as const },
  mcpRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  mcpMain: { flex: 1, gap: 2 },
  mcpActions: { gap: space.sm, alignItems: 'flex-end' as const },
  guided: { gap: space.sm, paddingTop: space.xs },
});
