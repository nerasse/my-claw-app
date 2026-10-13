import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { deviceBridge } from './nativeBridge';
import { prefs } from './prefs';
import { connection } from './connection';
import { isValidServerUrl } from './serverUrl';

/**
 * The servers this phone uses, one profile each: a name, an address, the conversation it was on
 * (docs/servers.md). One is active at a time; its credential and its send queue are the ones the
 * native side uses, and the others keep theirs until the owner switches back.
 *
 * A profile is a server, not an address: the same server reached on the LAN and over the VPN is
 * one profile whose address the owner edits, two servers are two profiles. The first one is
 * `default`, which is what a phone updated from a single-server build already holds.
 *
 * Android only. A browser is on the server that serves it, and the iPhone build keeps one server
 * until its keychain holds one credential per profile.
 */
export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  lastThreadId: string | null;
  /**
   * The get-started steps skipped on this server: a model skipped on the owner's server says
   * nothing about a relative's, which has none yet.
   */
  setupSkipped: string[];
}

/** What prefs holds for the active profile, which the app edits live. */
function liveOf(current: { serverUrl: string; lastThreadId: string | null; setupSkipped: string[] }) {
  return { url: current.serverUrl, lastThreadId: current.lastThreadId, setupSkipped: current.setupSkipped };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export const multiServerSupported = Platform.OS === 'android';
export const DEFAULT_SERVER = 'default';

interface ServersState {
  list: ServerProfile[];
  active: string;
}

type Listener = () => void;

function parseList(raw: string | undefined): ServerProfile[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .filter(entry => typeof entry.id === 'string' && entry.id !== '')
      .map(entry => ({
        id: entry.id as string,
        name: typeof entry.name === 'string' ? entry.name : '',
        url: typeof entry.url === 'string' ? entry.url : '',
        lastThreadId: typeof entry.lastThreadId === 'string' && entry.lastThreadId ? entry.lastThreadId : null,
        setupSkipped: Array.isArray(entry.setupSkipped) ? entry.setupSkipped.filter((key): key is string => typeof key === 'string') : [],
      }));
  } catch {
    return [];
  }
}

/** What a profile is called when the owner never named it: the host it is reached at. */
export function serverName(profile: ServerProfile): string {
  if (profile.name.trim()) return profile.name.trim();
  // The port too when there is one: two servers of one machine are told apart by it.
  const host = /^[a-z]+:\/\/([^/?#]+)/i.exec(profile.url.trim())?.[1];
  return host ?? 'New server';
}

class ServersStore {
  private state: ServersState = { list: [], active: DEFAULT_SERVER };
  private listeners = new Set<Listener>();
  private markHydrated: () => void = () => {};
  private hydrated = new Promise<void>(resolve => {
    this.markHydrated = resolve;
  });

  /** Settles once the stored profiles are read: which server is active is unknown before. */
  whenHydrated(): Promise<void> {
    return this.hydrated;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = (): ServersState => this.state;

  active(): ServerProfile | undefined {
    return this.state.list.find(profile => profile.id === this.state.active);
  }

  /**
   * After `prefs.hydrate`: the profiles as stored, or the one a single-server build had. The
   * native side is told which one is active before anything connects.
   */
  async hydrate(): Promise<void> {
    let raw: Record<string, string> = {};
    try {
      raw = await deviceBridge.prefsGetAll();
    } catch {
      raw = {};
    }
    const current = prefs.get();
    let list = parseList(raw.servers);
    let active = raw.activeServer?.trim() || DEFAULT_SERVER;
    // A single-server build: one profile, which the line below fills from prefs like any active one.
    if (list.length === 0) list = [{ id: DEFAULT_SERVER, name: '', url: '', lastThreadId: null, setupSkipped: [] }];
    if (!list.some(profile => profile.id === active)) active = list[0]!.id;
    // prefs holds the live address, conversation and skipped steps of the active one: it is what
    // the app edits.
    list = list.map(profile => (profile.id === active ? { ...profile, ...liveOf(current) } : profile));
    this.state = { list, active };
    this.emit();
    if (multiServerSupported) await deviceBridge.setActiveServer(active).catch(() => {});
    this.markHydrated();
  }

  /** The active profile follows the address, the conversation and the skipped steps the app is on. */
  syncActive(current: { serverUrl: string; lastThreadId: string | null; setupSkipped: string[] }): void {
    const active = this.active();
    const live = liveOf(current);
    if (!active || (active.url === live.url && active.lastThreadId === live.lastThreadId && sameList(active.setupSkipped, live.setupSkipped))) return;
    this.write(this.state.list.map(profile => (profile.id === active.id ? { ...profile, ...live } : profile)), this.state.active);
  }

  rename(id: string, name: string): void {
    this.write(this.state.list.map(profile => (profile.id === id ? { ...profile, name: name.trim().slice(0, 40) } : profile)), this.state.active);
  }

  /** Not the active one: its credential and unsent messages go with it. */
  forget(id: string): void {
    if (id === this.state.active) return;
    this.write(this.state.list.filter(profile => profile.id !== id), this.state.active);
    deviceBridge.forgetServer(id).catch(() => {});
  }

  /** A new, empty profile, switched to: the app comes back on the Join screen, with no address. */
  async add(): Promise<void> {
    const id = `s-${Math.random().toString(36).slice(2, 10)}`;
    this.write([...this.state.list, { id, name: '', url: '', lastThreadId: null, setupSkipped: [] }], this.state.active);
    await this.switchTo(id);
  }

  /**
   * Puts the current server away and starts the app afresh on another. Every store of the shell
   * holds the current server's conversations, so the JS restarts rather than unpick them: the
   * connection service keeps running, swaps its queue and presents the other credential.
   */
  async switchTo(id: string): Promise<void> {
    const target = this.state.list.find(profile => profile.id === id);
    if (!target || id === this.state.active) return;
    const current = prefs.get();
    const list = this.state.list.map(profile => (profile.id === this.state.active ? { ...profile, ...liveOf(current) } : profile));
    this.write(list, id);
    prefs.set('serverUrl', target.url);
    prefs.set('lastThreadId', target.lastThreadId);
    prefs.set('setupSkipped', target.setupSkipped);
    await deviceBridge.setActiveServer(id).catch(() => {});
    if (isValidServerUrl(target.url)) connection.connect(target.url);
    else connection.disconnect();
    deviceBridge.reloadApp();
  }

  private write(list: ServerProfile[], active: string): void {
    this.state = { list, active };
    this.emit();
    deviceBridge.prefsSet('servers', JSON.stringify(list)).catch(() => {});
    deviceBridge.prefsSet('activeServer', active).catch(() => {});
  }

  private emit(): void {
    this.listeners.forEach(listener => listener());
  }

  /** Only tests need it: the store is module-level on purpose. */
  reset(): void {
    this.state = { list: [], active: DEFAULT_SERVER };
    this.hydrated = new Promise<void>(resolve => {
      this.markHydrated = resolve;
    });
    this.emit();
  }
}

export const serversStore = new ServersStore();

export function useServers(): ServersState {
  return useSyncExternalStore(serversStore.subscribe, serversStore.get, serversStore.get);
}
