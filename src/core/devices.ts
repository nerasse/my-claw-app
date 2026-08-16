import { useSyncExternalStore } from 'react';
import { connection } from './connection';
import type {
  DeviceListResultFrame,
  DevicePairInfoFrame,
  DevicePairResultFrame,
  DeviceRecord,
  DeviceRevokeResultFrame,
} from './protocol';

type Listener = () => void;

export interface PairingCandidate {
  code: string;
  verification: string;
  origin?: string;
  ip?: string;
  userAgent?: string;
  expiresAt: number;
}

export interface DevicesState {
  status: 'unknown' | 'ready';
  devices: DeviceRecord[];
  /** The code being looked at, once the server answered. Null while nothing is pending. */
  candidate: PairingCandidate | null;
  busy: boolean;
  notice: string | null;
  error: string | null;
}

const EMPTY: DevicesState = {
  status: 'unknown',
  devices: [],
  candidate: null,
  busy: false,
  notice: null,
  error: null,
};

/**
 * Paired devices, and the approval of a browser waiting on a pairing code.
 *
 * The list is server state and is never optimistically edited: a revoke that failed must not
 * leave a device missing from the screen, because the owner would believe a credential is gone
 * when it still opens the conversation.
 */
class DevicesStoreImpl {
  private state: DevicesState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = (): DevicesState => this.state;

  private set(next: Partial<DevicesState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }

  refresh(): void {
    connection.send(JSON.stringify({ type: 'device.list' })).catch(() => {});
  }

  revoke(deviceId: string): void {
    this.set({ busy: true, error: null, notice: null });
    connection.send(JSON.stringify({ type: 'device.revoke', deviceId })).catch(() => {});
  }

  /** Step one of an approval: ask what the code stands for, and show it to the owner. */
  lookup(code: string): void {
    const cleaned = normalizeCode(code);
    if (cleaned.length === 0) return;
    this.set({ busy: true, error: null, notice: null, candidate: null });
    connection.send(JSON.stringify({ type: 'device.pair.lookup', code: cleaned })).catch(() => {});
  }

  approve(name: string): void {
    const code = this.state.candidate?.code;
    if (!code) return;
    this.set({ busy: true, error: null });
    connection.send(JSON.stringify({ type: 'device.pair.approve', code, name })).catch(() => {});
  }

  deny(): void {
    const code = this.state.candidate?.code;
    if (!code) return;
    this.set({ busy: true, error: null });
    connection.send(JSON.stringify({ type: 'device.pair.deny', code })).catch(() => {});
  }

  clearCandidate(): void {
    this.set({ candidate: null, error: null, notice: null });
  }

  clearMessages(): void {
    this.set({ error: null, notice: null });
  }

  onList(frame: DeviceListResultFrame): void {
    this.set({ status: 'ready', devices: frame.devices, busy: false });
  }

  onRevoked(frame: DeviceRevokeResultFrame): void {
    this.set({
      busy: false,
      error: frame.ok ? null : (frame.error ?? 'the device could not be revoked'),
      notice: frame.ok ? `${frame.deviceId} revoked` : null,
    });
    if (frame.ok) this.refresh();
  }

  onPairInfo(frame: DevicePairInfoFrame): void {
    this.set({
      busy: false,
      error: null,
      candidate: {
        code: frame.code,
        verification: frame.verification,
        origin: frame.origin,
        ip: frame.ip,
        userAgent: frame.userAgent,
        expiresAt: frame.expiresAt,
      },
    });
  }

  /** The lookup found nothing: the message says which of the four reasons it was. */
  onPairError(reason: string): void {
    this.set({ busy: false, candidate: null, error: pairError(reason) });
  }

  onPairResult(frame: DevicePairResultFrame): void {
    this.set({
      busy: false,
      candidate: null,
      error: frame.ok ? null : pairError(frame.error),
      notice: frame.ok ? 'paired' : null,
    });
    if (frame.ok) this.refresh();
  }

  /** Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.listeners.forEach(listener => listener());
  }
}

/** The server folds what a human types; the app does it too so the error comes before the frame. */
export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

function pairError(reason: string | undefined): string {
  switch (reason) {
    case 'unknown':
      return 'no pairing is waiting on that code';
    case 'expired':
      return 'the code expired, ask for a new one';
    case 'attempts':
      return 'too many tries on that code';
    case 'disabled':
      return 'pairing is disabled on the server';
    default:
      return reason ?? 'the pairing failed';
  }
}

export const devicesStore = new DevicesStoreImpl();

export function useDevices(): DevicesState {
  return useSyncExternalStore(devicesStore.subscribe, devicesStore.get, devicesStore.get);
}
