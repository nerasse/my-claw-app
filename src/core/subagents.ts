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
  major: 'named' | 'temporary';
  /** The agent type, the second grouping level. */
  type: string;
  rows: RosterRow[];
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

export function useSubAgents(threadId: string | null): ThreadRoster {
  return useSyncExternalStore(
    listener => subAgentStore.subscribe(listener),
    () => (threadId ? subAgentStore.get(threadId) : EMPTY),
  );
}
