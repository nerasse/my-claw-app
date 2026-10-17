import { useSyncExternalStore } from 'react';
import { connection } from './connection';
import type {
  NodeRecord,
  NodesAccessSetResultFrame,
  NodesAddResultFrame,
  NodesDescribeResultFrame,
  NodesListResultFrame,
  NodesRenameResultFrame,
  NodesRevokeResultFrame,
  NodesUpdateResultFrame,
} from './protocol';

type Listener = () => void;

/** A claim code on screen: what the machine to add pairs with, until it does. */
export interface NodeClaim {
  code: string;
  expiresAt: number;
}

export interface NodesState {
  status: 'unknown' | 'ready';
  nodes: NodeRecord[];
  claim: NodeClaim | null;
  busy: boolean;
  notice: string | null;
  error: string | null;
}

const EMPTY: NodesState = {
  status: 'unknown',
  nodes: [],
  claim: null,
  busy: false,
  notice: null,
  error: null,
};

/**
 * The remote nodes, and the claim code that adds one.
 *
 * Server state, never optimistically edited, for the reason the devices list is not: a revoke
 * that failed must not leave a row missing from the screen, because the owner would believe the
 * machine can no longer reach him when its credential is still live.
 */
class NodesStoreImpl {
  private state: NodesState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = (): NodesState => this.state;

  private set(next: Partial<NodesState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }

  refresh(): void {
    connection.send(JSON.stringify({ type: 'nodes.list' })).catch(() => {});
  }

  /** "Add a node": the name is a label for the roster; the machine's hostname fills in without one. */
  add(name: string): void {
    this.set({ busy: true, error: null, notice: null, claim: null });
    connection.send(JSON.stringify({ type: 'nodes.add', ...(name.trim() ? { name: name.trim() } : {}) })).catch(() => {});
  }

  revoke(nodeId: string): void {
    this.set({ busy: true, error: null, notice: null });
    connection.send(JSON.stringify({ type: 'nodes.revoke', nodeId })).catch(() => {});
  }

  /** The roster's label, and the agent file follows it. */
  rename(nodeId: string, name: string): void {
    this.set({ busy: true, error: null, notice: null });
    connection.send(JSON.stringify({ type: 'nodes.rename', nodeId, name })).catch(() => {});
  }

  /** The description the orchestrator reads when it picks this node's agent. */
  describe(nodeId: string, description: string): void {
    this.set({ busy: true, error: null, notice: null });
    connection.send(JSON.stringify({ type: 'nodes.describe', nodeId, description })).catch(() => {});
  }

  /**
   * What the node's agent may run there, and whether running it asks first. `tools: null`
   * removes the narrowing; the caller leaves a field out to keep it as it is.
   */
  setAccess(nodeId: string, access: { tools?: string[] | null; approval?: boolean; disabled?: boolean }): void {
    this.set({ busy: true, error: null, notice: null });
    connection.send(JSON.stringify({ type: 'nodes.access.set', nodeId, ...access })).catch(() => {});
  }

  /** Asks a connected node to take the server's build now, window or no window. */
  update(nodeId: string): void {
    this.set({ busy: true, error: null, notice: null });
    connection.send(JSON.stringify({ type: 'nodes.update', nodeId })).catch(() => {});
  }

  clearClaim(): void {
    this.set({ claim: null });
  }

  clearMessages(): void {
    this.set({ error: null, notice: null });
  }

  onList(frame: NodesListResultFrame): void {
    this.set({ status: 'ready', nodes: frame.nodes, busy: false });
  }

  onAdd(frame: NodesAddResultFrame): void {
    if (!frame.ok || !frame.code) {
      this.set({ busy: false, claim: null, error: frame.error ?? 'the code could not be made' });
      return;
    }
    this.set({ busy: false, error: null, claim: { code: frame.code, expiresAt: frame.expiresAt ?? 0 } });
  }

  onRevoked(frame: NodesRevokeResultFrame): void {
    const name = this.state.nodes.find(node => node.nodeId === frame.nodeId)?.name ?? frame.nodeId;
    this.set({
      busy: false,
      error: frame.ok ? null : (frame.error ?? 'the node could not be revoked'),
      notice: frame.ok ? `${name} revoked` : null,
    });
    if (frame.ok) this.refresh();
  }

  onRenamed(frame: NodesRenameResultFrame): void {
    this.set({
      busy: false,
      error: frame.ok ? null : (frame.error ?? 'the node could not be renamed'),
      notice: frame.ok ? `renamed to ${frame.name ?? ''}${frame.agent ? ` (agent ${frame.agent})` : ''}` : null,
    });
    if (frame.ok) this.refresh();
  }

  onDescribed(frame: NodesDescribeResultFrame): void {
    this.set({
      busy: false,
      error: frame.ok ? null : (frame.error ?? 'the description could not be written'),
      notice: frame.ok ? 'description saved' : null,
    });
    if (frame.ok) this.refresh();
  }

  onAccessSet(frame: NodesAccessSetResultFrame): void {
    this.set({
      busy: false,
      error: frame.ok ? null : (frame.error ?? 'the access could not be set'),
      notice: frame.ok ? 'saved' : null,
    });
    if (frame.ok) this.refresh();
  }

  onUpdated(frame: NodesUpdateResultFrame): void {
    this.set({
      busy: false,
      error: frame.ok ? null : (frame.error ?? 'the update could not be offered'),
      notice: frame.ok ? 'update offered; the node restarts on the new build' : null,
    });
  }

  /** Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.listeners.forEach(listener => listener());
  }
}

export const nodesStore = new NodesStoreImpl();

export function useNodes(): NodesState {
  return useSyncExternalStore(nodesStore.subscribe, nodesStore.get, nodesStore.get);
}

/** The code as the machine must type it, in the form both installers normalise back. */
export function formatClaimCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * The three questions the generated description asks, joined into the one line the agent file
 * carries. Empty answers are dropped; a sentence that already ends in punctuation keeps it.
 */
export function composeNodeDescription(fields: { purpose: string; reaches: string; never: string }): string {
  const sentence = (text: string): string => {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  };
  return [
    sentence(fields.purpose),
    fields.reaches.trim() ? `Reaches ${sentence(fields.reaches)}` : '',
    fields.never.trim() ? `Never touch ${sentence(fields.never)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export type NodePlatform = 'unix' | 'windows';
/** `admin` installs a system service; `user` runs with the account's own rights. */
export type NodeInstallMode = 'admin' | 'user';

/** What the node dials: `wss://<host>/node`. */
export function nodeServerUrl(origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base.replace(/^http/, 'ws')}/node`;
}

/**
 * The one line a machine runs to install and pair. It fetches the installer from this server,
 * which relays the binary with its own release key, and hands it the code and the address to
 * dial -- so the machine needs nothing else.
 *
 * The same rule as `myclaw node add`: whoever knows the address says it, because the daemon only
 * ever sees the Host it was asked on. Here that is the address this device is connected to.
 */
export function nodeInstallCommand(origin: string, code: string, platform: NodePlatform, mode: NodeInstallMode): string {
  const base = origin.replace(/\/+$/, '');
  const server = nodeServerUrl(origin);
  const shown = formatClaimCode(code);
  if (platform === 'windows') {
    return `iwr -UseBasicParsing '${base}/node/install.ps1' -OutFile $env:TEMP\\install-node.ps1; & $env:TEMP\\install-node.ps1 -Pair ${shown} -Server ${server} -Mode ${mode}`;
  }
  return `curl -fsSL '${base}/node/install.sh' | ${mode === 'admin' ? 'sudo ' : ''}sh -s -- --pair ${shown} --server ${server} --mode ${mode}`;
}
