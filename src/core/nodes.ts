import { useSyncExternalStore } from 'react';
import { connection } from './connection';
import type { NodeRecord, NodesAddResultFrame, NodesListResultFrame, NodesRevokeResultFrame } from './protocol';

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

export interface NodeInstallCommands {
  /** What the node dials, `wss://<host>/node`. */
  server: string;
  unix: string;
  windows: string;
}

/**
 * The two one-liners the add card shows, built from the address this app reaches the server at.
 *
 * The same rule as `myclaw node add`: whoever knows the address says it, because the daemon only
 * ever sees the Host it was asked on. Here that is the address this device is connected to.
 */
export function nodeInstallCommands(origin: string, code: string): NodeInstallCommands {
  const base = origin.replace(/\/+$/, '');
  const server = `${base.replace(/^http/, 'ws')}/node`;
  const shown = formatClaimCode(code);
  return {
    server,
    unix: `curl -fsSL '${base}/node/install.sh' | sudo sh -s -- --pair ${shown} --server ${server}`,
    windows: `iwr -UseBasicParsing '${base}/node/install.ps1' -OutFile $env:TEMP\\install-node.ps1; & $env:TEMP\\install-node.ps1 -Pair ${shown} -Server ${server}`,
  };
}
