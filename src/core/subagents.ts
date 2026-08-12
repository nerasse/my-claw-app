import { useSyncExternalStore } from 'react';
import type { SubAgentEntry, SubAgentsListResultFrame } from './protocol';

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

/** A named sub-agent: it lives on disk, so it can be opened, talked to, reset and deleted. */
export interface NamedRow {
  kind: 'named';
  key: string;
  entry: SubAgentEntry;
}

/**
 * A one-shot the model ran. The server deleted its session when the run ended, so there is nothing
 * to open: the row points back at the `spawn` card in the transcript, which holds the whole record.
 */
export interface TemporaryRow {
  kind: 'temporary';
  key: string;
  /** Chat item id of the `spawn` card, to scroll to. */
  toolItemId: string;
  name: string;
  ok: boolean;
  durationMs?: number;
}

export type RosterRow = NamedRow | TemporaryRow;

export interface RosterGroup {
  major: 'named' | 'temporary';
  /** The agent type, the second grouping level. */
  type: string;
  rows: RosterRow[];
}

interface SpawnCard {
  id: string;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs?: number;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Groups the roster the way it is read: named before temporary, then by agent type. Within a
 * category a type holding a running agent comes first, then alphabetically; within a type the
 * running ones lead, then the most recently created.
 *
 * Temporary rows come from the transcript rather than the server, because a one-shot's session is
 * already deleted while its `spawn` card still carries its type, outcome and duration.
 */
export function groupRoster(agents: SubAgentEntry[], spawnCards: SpawnCard[]): RosterGroup[] {
  const named = new Map<string, NamedRow[]>();
  for (const entry of agents) {
    const rows = named.get(entry.type) ?? [];
    rows.push({ kind: 'named', key: entry.id, entry });
    named.set(entry.type, rows);
  }
  for (const rows of named.values()) {
    rows.sort((a, b) => {
      const running = Number(b.entry.status === 'running') - Number(a.entry.status === 'running');
      if (running !== 0) return running;
      const created = b.entry.createdAt.localeCompare(a.entry.createdAt);
      return created !== 0 ? created : a.entry.id.localeCompare(b.entry.id);
    });
  }

  const temporary = new Map<string, TemporaryRow[]>();
  // Newest first: the transcript is chronological and the interesting one-shot is the last.
  for (const card of [...spawnCards].reverse()) {
    if (card.name !== 'spawn' || str(card.args.mode) !== 'run') continue;
    const type = str(card.args.type) || 'unknown';
    const rows = temporary.get(type) ?? [];
    rows.push({
      kind: 'temporary',
      key: card.id,
      toolItemId: card.id,
      name: str(card.args.name) || '(unnamed)',
      ok: card.ok,
      ...(card.durationMs === undefined ? {} : { durationMs: card.durationMs }),
    });
    temporary.set(type, rows);
  }

  const groupsOf = (
    source: Map<string, RosterRow[]>,
    major: 'named' | 'temporary',
    leads: (rows: RosterRow[]) => boolean,
  ): RosterGroup[] =>
    [...source.entries()]
      .sort(([aType, aRows], [bType, bRows]) => {
        const lead = Number(leads(bRows)) - Number(leads(aRows));
        return lead !== 0 ? lead : aType.localeCompare(bType);
      })
      .map(([type, rows]) => ({ major, type, rows }));

  return [
    ...groupsOf(named as Map<string, RosterRow[]>, 'named', rows =>
      rows.some(r => r.kind === 'named' && r.entry.status === 'running'),
    ),
    ...groupsOf(temporary as Map<string, RosterRow[]>, 'temporary', () => false),
  ];
}

export function useSubAgents(threadId: string | null): ThreadRoster {
  return useSyncExternalStore(
    listener => subAgentStore.subscribe(listener),
    () => (threadId ? subAgentStore.get(threadId) : EMPTY),
  );
}
