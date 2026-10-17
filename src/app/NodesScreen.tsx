import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { nodeInstallCommand, nodeServerUrl, nodesStore, useNodes, type NodeInstallMode, type NodePlatform } from '../core/nodes';
import type { NodeRecord } from '../core/protocol';
import { BackButton, headerStyle } from '../components/BackButton';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useScrollIndicator } from '../components/ScrollIndicator';
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

/** "2 of 3 tools: bash, read" -- what the agent actually holds, and what the machine offers. */
function toolLine(node: NodeRecord): string {
  if (node.tools.length === 0) return 'no tools';
  const exposed = node.exposed ?? node.tools;
  const names = exposed.join(', ') || 'none';
  const count = node.exposed ? `${exposed.length} of ${node.tools.length} tools` : `${node.tools.length} tools`;
  return `${count}: ${names}`;
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
  onOpenNode,
  connected,
  serverOrigin,
}: {
  onBack: () => void;
  onOpenNode: (nodeId: string) => void;
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
  // What the machine is, and how it installs: the command is generated from the two, so the
  // card shows one line to copy instead of four.
  const [platform, setPlatform] = useState<NodePlatform>('unix');
  const [mode, setMode] = useState<NodeInstallMode>('admin');
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (connected) nodesStore.refresh();
  }, [connected]);
  useEffect(
    () => () => {
      nodesStore.clearMessages();
      nodesStore.clearClaim();
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const claim = state.claim;
  const command = claim ? nodeInstallCommand(serverOrigin, claim.code, platform, mode) : '';

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

        {!adding ? null : claim ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pair a node</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>code</Text>
              <Text style={styles.code} selectable accessibilityLabel="Claim code">
                {claim.code.length === 8 ? `${claim.code.slice(0, 4)}-${claim.code.slice(4)}` : claim.code}
              </Text>
              <Text style={styles.detail}>{`single use · valid until ${until(claim.expiresAt)}`}</Text>
            </View>

            <Text style={styles.commandLabel}>the machine</Text>
            <View style={styles.segment}>
              <Pressable
                style={[styles.segmentItem, platform === 'unix' ? styles.segmentItemActive : null]}
                onPress={() => setPlatform('unix')}
                accessibilityRole="button"
                accessibilityState={{ selected: platform === 'unix' }}
                accessibilityLabel="Linux or macOS">
                <Text style={[styles.segmentText, platform === 'unix' ? styles.segmentTextActive : null]}>Linux / macOS</Text>
              </Pressable>
              <Pressable
                style={[styles.segmentItem, platform === 'windows' ? styles.segmentItemActive : null]}
                onPress={() => setPlatform('windows')}
                accessibilityRole="button"
                accessibilityState={{ selected: platform === 'windows' }}
                accessibilityLabel="Windows">
                <Text style={[styles.segmentText, platform === 'windows' ? styles.segmentTextActive : null]}>Windows</Text>
              </Pressable>
            </View>

            <Text style={styles.commandLabel}>how it installs</Text>
            <View style={styles.segment}>
              <Pressable
                style={[styles.segmentItem, mode === 'admin' ? styles.segmentItemActive : null]}
                onPress={() => setMode('admin')}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'admin' }}
                accessibilityLabel="Install as a service">
                <Text style={[styles.segmentText, mode === 'admin' ? styles.segmentTextActive : null]}>Service (admin)</Text>
              </Pressable>
              <Pressable
                style={[styles.segmentItem, mode === 'user' ? styles.segmentItemActive : null]}
                onPress={() => setMode('user')}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'user' }}
                accessibilityLabel="Install as this user">
                <Text style={[styles.segmentText, mode === 'user' ? styles.segmentTextActive : null]}>As you (user)</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              {mode === 'admin'
                ? 'a system service, started at boot, with its own account and the rights you grant it'
                : 'runs as you, with your rights, started at logon'}
            </Text>

            <Text style={styles.commandLabel}>
              {platform === 'windows' ? 'run this in PowerShell on it (elevated for the service)' : 'run this in a terminal on it'}
            </Text>
            <Text style={styles.command} selectable>
              {command}
            </Text>
            <Pressable
              style={[styles.button, styles.approve]}
              onPress={() => {
                copy(command);
                setCopied(true);
                if (copiedTimer.current) clearTimeout(copiedTimer.current);
                copiedTimer.current = setTimeout(() => setCopied(false), 2000);
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy the install command">
              <Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy the command'}</Text>
            </Pressable>
            <Text style={styles.detail} selectable numberOfLines={2}>
              {nodeServerUrl(serverOrigin)}
            </Text>

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
          <Pressable
            key={node.nodeId}
            style={styles.nodeRow}
            onPress={() => onOpenNode(node.nodeId)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${node.name}`}>
            <View style={styles.nodeMain}>
              <View style={styles.nodeTitleLine}>
                <View style={[styles.dot, node.online ? styles.dotOnline : null]} />
                <Text style={styles.nodeName} numberOfLines={1}>
                  {node.name}
                </Text>
                {node.mode ? <Text style={styles.badge}>{node.mode}</Text> : null}
                {node.approval ? <Text style={styles.badge}>ask</Text> : null}
                {node.version ? <Text style={styles.badge}>{node.version}</Text> : null}
              </View>
              <Text style={styles.detail}>{describe(node)}</Text>
              <Text style={styles.detail} numberOfLines={1}>
                {node.online ? 'online now' : since(node.lastSeenAt)}
                {` · ${toolLine(node)}`}
              </Text>
              {node.description ? (
                <Text style={styles.detail} numberOfLines={1}>
                  {node.description}
                </Text>
              ) : null}
              {node.agent ? <Text style={styles.detail}>{`agent ${node.agent}`}</Text> : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
      {indicator}
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
  chevron: { fontSize: font.title, color: palette.textFaint, paddingHorizontal: space.xs },
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
