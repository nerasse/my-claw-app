import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { composeNodeDescription, nodesStore, useNodes } from '../core/nodes';
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
          <Text style={styles.hint}>{connected ? 'This node is no longer paired.' : 'Connect to your server to load the node.'}</Text>
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
                  {`this machine runs ${node.version}, the server runs ${serverVersion}. Its own retry waits half an
                  hour between attempts; this asks it now.`}
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
                style={[styles.button, styles.approve, (busy || !description.trim() || description.trim() === (node.description ?? '')) && styles.busy]}
                onPress={() => nodesStore.describe(node.nodeId, description)}
                disabled={busy || !description.trim() || description.trim() === (node.description ?? '')}
                accessibilityRole="button"
                accessibilityLabel="Save the description">
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
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
              {node.agent ? <Text style={styles.detail}>{`agent ${node.agent}`}</Text> : <Text style={styles.detail}>no agent file</Text>}
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
  guided: { gap: space.sm, paddingTop: space.xs },
});
