import { useSyncExternalStore } from 'react';
import type {
  SubAgentCaller,
  SubAgentEntry,
  SubAgentHandoffOutcome,
  SubAgentsCallersResultFrame,
  SubAgentsHandoffResultFrame,
  SubAgentsListResultFrame,
  SpawnStatus,
} from './protocol';
import type { SpawnCard } from './chat';

type Listener = () => void;

export type SubAgentsStatus = 'unknown' | 'ready' | 'unsupported';

interface ThreadRoster {
  status: SubAgentsStatus;
  agents: SubAgentEntry[];
}

const EMPTY: ThreadRoster = { status: 'unknown', agents: [] };

/**
 * The live sub-agents of each conversation, mirrored from `subagents.list.result`. Kept per thread
 * because the server scopes the answer: what conversation A reaches is not what B reaches, so one
 * shared list would show the wrong roster for a moment after every switch.
 *
 * `unsupported` means a server that never answered (it drops frames it does not know), so the
 * counter can stay hidden instead of a screen spinning forever.
 */
class SubAgentsStoreImpl {
  private rosters = new Map<string, ThreadRoster>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get(threadId: string): ThreadRoster {
    return this.rosters.get(threadId) ?? EMPTY;
  }

  /** Drops everything. Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.rosters.clear();
    this.emit();
  }

  receive(frame: SubAgentsListResultFrame): void {
    this.rosters.set(frame.threadId, { status: 'ready', agents: frame.agents });
    this.emit();
  }

  /**
   * No answer came. Applied to every thread rather than one, because the silence is a property of
   * the server, not of the conversation that happened to ask first.
   */
  markUnsupported(): void {
    for (const [threadId, roster] of this.rosters) {
      if (roster.status === 'ready') continue;
      this.rosters.set(threadId, { status: 'unsupported', agents: [] });
    }
    this.unsupported = true;
    this.emit();
  }

  private unsupported = false;

  /** True once a server has proved it does not know the frame. */
  isUnsupported(): boolean {
    return this.unsupported;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const subAgentStore = new SubAgentsStoreImpl();

export type CallersStatus = 'idle' | 'loading' | 'ready' | 'refused';

export interface CallersState {
  status: CallersStatus;
  callers: SubAgentCaller[];
  /** The last hand-back's per-target outcome, kept so the sheet can say what actually landed. */
  delivered?: SubAgentHandoffOutcome[];
}

const NO_CALLERS: CallersState = { status: 'idle', callers: [] };
Object.freeze(NO_CALLERS);

/**
 * Who called each sub-agent, per sub-agent thread, mirrored from `subagents.callers.result`.
 *
 * Separate from the roster: the roster is pushed on every lifecycle event and every window holds
 * it, whereas this is pulled when a menu opens and belongs to the window that opened it. `refused`
 * is a real state, not an empty list -- an unreachable sub-agent answers like a missing one, and
 * the sheet must say so rather than show "no callers".
 */
class SubAgentCallersStoreImpl {
  private states = new Map<string, CallersState>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get(threadId: string): CallersState {
    return this.states.get(threadId) ?? NO_CALLERS;
  }

  /** The request left. Kept apart from `ready` so the sheet can show a spinner, not an empty list. */
  requested(threadId: string): void {
    const current = this.get(threadId);
    this.states.set(threadId, { ...current, status: 'loading' });
    this.emit();
  }

  receive(frame: SubAgentsCallersResultFrame): void {
    this.states.set(frame.threadId, { status: 'ready', callers: frame.callers });
    this.emit();
  }

  /** The server refused: an unreachable sub-agent is indistinguishable from a missing one. */
  refused(threadId: string): void {
    this.states.set(threadId, { status: 'refused', callers: [] });
    this.emit();
  }

  receiveHandoff(frame: SubAgentsHandoffResultFrame): void {
    const current = this.get(frame.threadId);
    this.states.set(frame.threadId, { ...current, delivered: frame.delivered });
    this.emit();
  }

  /** Forgets the last outcome once the sheet closed, so reopening it does not replay old news. */
  clearDelivered(threadId: string): void {
    const current = this.states.get(threadId);
    if (!current?.delivered) return;
    this.states.set(threadId, { status: current.status, callers: current.callers });
    this.emit();
  }

  reset(): void {
    this.states.clear();
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const subAgentCallersStore = new SubAgentCallersStoreImpl();

export function useSubAgentCallers(threadId: string | null): CallersState {
  return useSyncExternalStore(
    listener => subAgentCallersStore.subscribe(listener),
    () => (threadId ? subAgentCallersStore.get(threadId) : NO_CALLERS),
  );
}

/** A named sub-agent: created as a `session`, lives on disk until killed or until its parent
 *  conversation is deleted (when private). */
export interface NamedRow {
  kind: 'named';
  key: string;
  entry: SubAgentEntry;
}

/**
 * A one-shot the model ran (`subagent/run-<uuid>`). The server keeps it after the run now, so it
 * is a row like the others — opened as a chat, driven again — only its lifecycle differs: it is
 * always private and dies with its parent conversation.
 */
export interface TemporaryRow {
  kind: 'temporary';
  key: string;
  entry: SubAgentEntry;
}

export type RosterRow = NamedRow | TemporaryRow;

export interface RosterGroup {
  /**
   * The first grouping level. `named`/`temporary` inside one conversation's roster; a scope label
   * (`public`, `workspace · <key>`) on the drawer page, which groups by who can reach an agent
   * rather than by how long it lives.
   */
  major: string;
  /** The agent type, the second grouping level. */
  type: string;
  rows: RosterRow[];
}

/** What the roster shows next to an agent, and what the drawer page groups by. */
export function scopeLabelOf(entry: SubAgentEntry): string {
  if (entry.visibility !== 'workspace') return entry.visibility;
  return `workspace · ${entry.workspaceKey ?? 'default'}`;
}

/**
 * Groups the roster the way it is read: named before temporary, then by agent type. Within a
 * category a type holding a running agent comes first, then alphabetically; within a type the
 * running ones lead, then the most recently created.
 *
 * The two categories are distinguished by id: `subagent/run-` is a kept one-shot, anything else
 * is a named session. Both come from the server's roster, which is already scoped to the asking
 * conversation.
 */
export function groupRoster(agents: SubAgentEntry[]): RosterGroup[] {
  const buckets = new Map<'named' | 'temporary', Map<string, RosterRow[]>>([
    ['named', new Map()],
    ['temporary', new Map()],
  ]);
  for (const entry of agents) {
    const kind: 'named' | 'temporary' = entry.id.startsWith('subagent/run-') ? 'temporary' : 'named';
    const byType = buckets.get(kind)!;
    const rows = byType.get(entry.type) ?? [];
    rows.push({ kind, key: entry.id, entry });
    byType.set(entry.type, rows);
  }
  for (const byType of buckets.values()) {
    for (const rows of byType.values()) {
      rows.sort((a, b) => {
        const running = Number(b.entry.status === 'running') - Number(a.entry.status === 'running');
        if (running !== 0) return running;
        const created = b.entry.createdAt.localeCompare(a.entry.createdAt);
        return created !== 0 ? created : a.entry.id.localeCompare(b.entry.id);
      });
    }
  }

  const groupsOf = (source: Map<string, RosterRow[]>, major: 'named' | 'temporary'): RosterGroup[] =>
    [...source.entries()]
      .sort(([aType, aRows], [bType, bRows]) => {
        const lead = Number(bRows.some(r => r.entry.status === 'running')) - Number(aRows.some(r => r.entry.status === 'running'));
        return lead !== 0 ? lead : aType.localeCompare(bType);
      })
      .map(([type, rows]) => ({ major, type, rows }));

  return [...groupsOf(buckets.get('named')!, 'named'), ...groupsOf(buckets.get('temporary')!, 'temporary')];
}

/**
 * The agents this conversation shares with others, grouped by scope: `public` first, then one
 * section per workspace. A workspace agent is only ever in the roster when the conversation that
 * asked belongs to that workspace -- the server filters before sending -- so a section here is a
 * scope the owner is actually inside, never a directory of everything that exists.
 *
 * One-shots are absent by construction: they are private, and private agents belong to the
 * conversation roster rather than to this page.
 */
export function groupSharedRoster(agents: SubAgentEntry[]): RosterGroup[] {
  const buckets = new Map<string, SubAgentEntry[]>();
  for (const entry of agents) {
    if (entry.visibility !== 'global' && entry.visibility !== 'workspace') continue;
    const label = entry.visibility === 'global' ? 'public' : scopeLabelOf(entry);
    const rows = buckets.get(label) ?? [];
    rows.push(entry);
    buckets.set(label, rows);
  }

  // `public` leads because it is the widest scope; the workspaces follow alphabetically, so a
  // section does not move under the reader when an agent starts or stops running.
  const labels = [...buckets.keys()].sort((a, b) => {
    if (a === 'public') return -1;
    if (b === 'public') return 1;
    return a.localeCompare(b);
  });

  return labels.flatMap(label =>
    groupRoster(buckets.get(label)!).map(group => ({ ...group, major: label })),
  );
}

export function useSubAgents(threadId: string | null): ThreadRoster {
  return useSyncExternalStore(
    listener => subAgentStore.subscribe(listener),
    () => (threadId ? subAgentStore.get(threadId) : EMPTY),
  );
}

/**
 * The sub-agent a `spawn` card refers to, by the id the server pushed or, failing that, the name
 * the call asked for.
 *
 * The name is what makes a card survive a reload: `chat.spawn.start` carries the id but is sent
 * once and never replayed, whereas the roster is asked for (`subagents.list`) and comes back
 * whenever the page reconnects.
 */
export function agentOfCard(
  card: { args: Record<string, unknown>; subagentId?: string },
  byId: ReadonlyMap<string, SubAgentEntry>,
  byName: ReadonlyMap<string, SubAgentEntry>,
): SubAgentEntry | undefined {
  const claimed = typeof card.args.name === 'string' ? card.args.name : '';
  // `send` names its target by id, `spawn` by display name: a send card has no `name` argument at
  // all, so without the id lookup it would never find its door.
  const addressed = typeof card.args.id === 'string' ? card.args.id : '';
  return (card.subagentId ? byId.get(card.subagentId) : undefined) ?? byId.get(addressed) ?? byName.get(claimed);
}

export function indexRoster(agents: readonly SubAgentEntry[]): {
  byId: Map<string, SubAgentEntry>;
  byName: Map<string, SubAgentEntry>;
} {
  return {
    byId: new Map(agents.map(agent => [agent.id, agent])),
    byName: new Map(agents.map(agent => [agent.displayName, agent])),
  };
}

/**
 * Which `spawn` cards still lead somewhere, keyed by card id.
 *
 * A card outlives the sub-agent it made, so the door is offered only while the roster still lists
 * it: a killed one stops offering rather than opening a dead thread. A one-shot run has no
 * persistent door once it finishes, but while it is listed it must be reachable -- the spawn card
 * is the only handle the owner has on it.
 */
export function spawnDoorsOf(
  cards: readonly SpawnCard[],
  agents: readonly SubAgentEntry[],
): Map<string, { label: string; status: 'idle' | 'running'; model?: string; modelLive?: boolean }> {
  const { byId, byName } = indexRoster(agents);
  const doors = new Map<string, { label: string; status: 'idle' | 'running'; model?: string; modelLive?: boolean }>();
  for (const card of cards) {
    const agent = agentOfCard(card, byId, byName);
    if (!agent) continue;
    doors.set(card.id, {
      label: agent.id.replace(/^subagent\//, ''),
      status: agent.status,
      // The card is where the owner watches an agent work: the model it is calling belongs there,
      // and `modelLive` marks the ones that walked off their pin (server docs/provider-failures.md).
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.modelLive ? { modelLive: true } : {}),
    });
  }
  return doors;
}

/**
 * Sub-agent lifecycle state per spawn card, keyed by card id.
 *
 * A pure projection of what the card already carries. The roster fallback that used to live here is
 * `chatStore.reconcileSpawnRoster`, which is the one place it belongs: it fires when the roster
 * arrives and writes into the status map every reader shares, instead of being re-derived by one
 * consumer that happened to hold the roster. Two copies of the same name match were two places for
 * it to drift.
 */
export function spawnLiveOf(
  cards: readonly SpawnCard[],
): Map<string, { subagentId: string; displayName: string; status: SpawnStatus }> {
  const live = new Map<string, { subagentId: string; displayName: string; status: SpawnStatus }>();
  for (const card of cards) {
    if (!card.subagentId || !card.status) continue;
    const named = typeof card.args.name === 'string' ? card.args.name : undefined;
    live.set(card.id, { subagentId: card.subagentId, displayName: card.displayName ?? named ?? card.subagentId, status: card.status });
  }
  return live;
}
