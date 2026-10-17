import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { nodesStore, nodeInstallCommands, useNodes } from '../core/nodes';
import type { NodeRecord } from '../core/protocol';
import { BackButton, headerStyle } from '../components/BackButton';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { ActionSheet } from '../components/ActionSheet';
import { CloseButton } from '../components/CloseButton';
import { useDismissKeyboard } from '../core/keyboard';
import Clipboard from '@react-native-clipboard/clipboard';

/** "3 hours ago" beats an ISO string on a phone: the question is always how stale a node is. */
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

function until(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function describe(node: NodeRecord): string {
  const facts = [node.os, node.arch].filter(Boolean).join(' ');
  const parts = [facts, node.mode ? `${node.mode} mode` : '', node.user].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'no facts yet';
}

/**
 * The remote nodes: machines my-claw reaches over the connection they dial out themselves. Each
 * one is a sub-agent whose tools run there, never here -- docs/remote-nodes.md on the server.
 *
 * The page does three things and nothing else: show the roster, mint a claim code, revoke. The
 * tools a node offers are its own config file's business, and its description is written in its
 * agent file, under Agents.
 */
export function NodesScreen({
  onBack,
  connected,
  serverOrigin,
}: {
  onBack: () => void;
  connected: boolean;
  /** The address this device reaches the server at: what the install lines name. */
  serverOrigin: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const { scrollProps, indicator } = useScrollIndicator();
  const state = useNodes();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<NodeRecord | null>(null);

  useEffect(() => {
    if (connected) nodesStore.refresh();
  }, [connected]);
  useEffect(
    () => () => {
      nodesStore.clearMessages();
      nodesStore.clearClaim();
    },
    [],
  );

  const claim = state.claim;
  const commands = claim ? nodeInstallCommands(serverOrigin, claim.code) : null;

  const copy = useCallback((text: string) => {
    Clipboard.setString(text);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label="Back to settings" />
        <Text style={styles.title}>Nodes</Text>
        <CloseButton />
      </View>

      <ScrollView {...scrollProps} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.grow, adding && styles.approve]}
            onPress={() => setAdding(current => !current)}
            accessibilityRole="button"
            accessibilityState={{ selected: adding }}
            accessibilityLabel="Add a node">
            <Text style={styles.buttonText}>Add a node</Text>
          </Pressable>
        </View>
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        {state.notice ? <Text style={styles.notice}>{state.notice}</Text> : null}

        {!adding ? null : claim && commands ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pair a node</Text>
            <Text style={styles.hint}>
              On the machine to add, run one of these. With sudo it installs as a service (root, its own user
              account); without, it runs as you and does what you can do.
            </Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>code</Text>
              <Text style={styles.code} selectable accessibilityLabel="Claim code">
                {claim.code.length === 8 ? `${claim.code.slice(0, 4)}-${claim.code.slice(4)}` : claim.code}
              </Text>
              <Text style={styles.detail}>{`single use · valid until ${until(claim.expiresAt)}`}</Text>
            </View>
            <Text style={styles.detail} selectable numberOfLines={2}>
              {commands.server}
            </Text>
            <Text style={styles.commandLabel}>Linux / macOS</Text>
            <Text style={styles.command} selectable>
              {commands.unix}
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => copy(commands.unix)}
              accessibilityRole="button"
              accessibilityLabel="Copy the Linux and macOS command">
              <Text style={styles.buttonText}>Copy</Text>
            </Pressable>
            <Text style={styles.commandLabel}>Windows (PowerShell)</Text>
            <Text style={styles.command} selectable>
              {commands.windows}
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => copy(commands.windows)}
              accessibilityRole="button"
              accessibilityLabel="Copy the Windows command">
              <Text style={styles.buttonText}>Copy</Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.grow, state.busy && styles.busy]}
                onPress={() => nodesStore.add(name)}
                disabled={state.busy}
                accessibilityRole="button"
                accessibilityLabel="Get another code">
                <Text style={styles.buttonText}>New code</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.grow]}
                onPress={() => {
                  nodesStore.clearClaim();
                  setName('');
                  setAdding(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close the pairing card">
                <Text style={styles.buttonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add a node</Text>
            <Text style={styles.hint}>
              A node dials out to this server and offers the tools its own config allows. It becomes a sub-agent
              named after it: no tool lands on the orchestrator.
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="its name, e.g. build box (default: its hostname)"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Name of the new node"
            />
            <Pressable
              style={[styles.button, styles.approve, (state.busy || !connected) && styles.busy]}
              onPress={() => nodesStore.add(name)}
              disabled={state.busy || !connected}
              accessibilityRole="button"
              accessibilityLabel="Get a pairing code">
              {state.busy ? <ActivityIndicator size="small" /> : <Text style={styles.buttonText}>Get a code</Text>}
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionLabel}>NODES · {state.nodes.length}</Text>
        {state.status === 'unknown' ? (
          <Text style={styles.hint}>{connected ? 'loading' : 'Connect to your server to load the nodes.'}</Text>
        ) : state.nodes.length === 0 ? (
          <Text style={styles.hint}>no node</Text>
        ) : null}

        {state.nodes.map(node => (
          <View key={node.nodeId} style={styles.nodeRow}>
            <View style={styles.nodeMain}>
              <View style={styles.nodeTitleLine}>
                <View style={[styles.dot, node.online ? styles.dotOnline : null]} />
                <Text style={styles.nodeName} numberOfLines={1}>
                  {node.name}
                </Text>
                {node.mode ? <Text style={styles.badge}>{node.mode}</Text> : null}
                {node.version ? <Text style={styles.badge}>{node.version}</Text> : null}
              </View>
              <Text style={styles.detail}>{describe(node)}</Text>
              <Text style={styles.detail}>
                {node.online ? 'online now' : since(node.lastSeenAt)}
                {node.tools.length > 0 ? ` · ${node.tools.length} tools: ${node.tools.join(', ')}` : ' · no tools'}
              </Text>
              {node.agent ? <Text style={styles.detail}>{`agent ${node.agent}`}</Text> : null}
            </View>
            <Pressable
              style={styles.revoke}
              onPress={() => setConfirming(node)}
              accessibilityRole="button"
              accessibilityLabel={`Revoke ${node.name}`}>
              <Text style={styles.buttonText}>Revoke</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      {indicator}

      {confirming ? (
        <ActionSheet
          preview={`Revoke "${confirming.name}"? Its socket closes at once, its credential stops working, and its agent file is removed. The client stays installed on that machine.`}
          options={[
            {
              label: 'Revoke',
              danger: true,
              onPress: () => {
                nodesStore.revoke(confirming.nodeId);
                setConfirming(null);
              },
            },
          ]}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1, backgroundColor: palette.bg },
  header: headerStyle(palette),

  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
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
  codeBox: {
    alignItems: 'center' as const,
    gap: 2,
    paddingVertical: space.sm,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
  },
  codeLabel: {
    fontSize: font.micro,
    color: palette.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  code: { fontSize: 30, fontWeight: '700' as const, letterSpacing: 4, color: palette.text },
  commandLabel: {
    marginTop: space.xs,
    fontSize: font.micro,
    color: palette.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  command: {
    fontFamily: 'monospace',
    fontSize: font.micro,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  grow: { flex: 1, alignItems: 'center' as const },
  actions: { flexDirection: 'row' as const, gap: space.sm },
  button: {
    flex: 1,
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
  revoke: {
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  sectionLabel: {
    marginTop: space.md,
    fontSize: font.micro,
    color: palette.textMuted,
    letterSpacing: 0.5,
  },
  nodeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  nodeMain: { flex: 1, gap: 2 },
  nodeTitleLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  nodeName: { flexShrink: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOnline: { backgroundColor: palette.accent },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
  },
});
