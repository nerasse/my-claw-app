import { useCallback, useSyncExternalStore } from 'react';
import type { AttachmentMeta, HistoryEntry, LocationData, RunMeta, SpawnAction, SpawnLifecycleState, SubAgentEntry, ToolCallPayload } from './protocol';
import { questionStore } from './questionStore';
import { agentOfCard, indexRoster } from './subagents';
import { hasNothingToShow, isOwnerMessage } from './runRows';

export type RunStatus = 'running' | 'done' | 'aborted' | 'error';

/** The run an item belongs to, client-side: timestamps in ms, the server speaks ISO. */
export interface RunInfo {
  /** The id of the run's `run_start` entry: the grouping key. */
  id: string;
  status: RunStatus;
  startTs: number;
  endTs?: number;
}

/**
 * Why a bubble is waiting rather than answered.
 *
 * `compaction` and `injection` are the server holding a send it has: behind a history rewrite, or
 * in the active run's mailbox for the next turn. `undelivered` is the send the server never got --
 * the socket refused it, or it claimed to be open and nothing was receipted -- and it is the app
 * that holds it, retrying on its own (2026-09-16).
 */
export type QueuedReason = 'compaction' | 'injection' | 'undelivered';

export interface TextItem {
  kind: 'text';
  id: string;
  role: 'user' | 'agent';
  text: string;
  attachments: AttachmentMeta[];
  location?: LocationData;
  streaming: boolean;
  error?: string;
  /** What the server heard, per recording id, rendered inside each recording's own bubble. */
  transcripts?: Record<string, string>;
  /** What the model thought before answering, shown collapsed. */
  reasoning?: string;
  /**
   * Token estimate from an engine that redacts its thinking (the Claude bridge): there is a count
   * to show and nothing to expand.
   */
  reasoningTokens?: number;
  /**
   * When the first thinking delta landed, and how long the thinking lasted once the answer
   * started. Measured here rather than reported by the server: the wire carries no thinking
   * duration, and the two instants that bound it are exactly the two frames the client already
   * receives. It follows that a thread rehydrated from server history comes back without them.
   */
  reasoningStartedAt?: number;
  reasoningMs?: number;
  /**
   * A model call opened this bubble and has produced nothing yet, since this instant (the
   * server's). The bubble draws "Thinking" with a counter where its caret would be, and the first
   * thing the turn writes into it takes the mark down. It lives on the bubble because the wait
   * belongs to the reply that is about to land here: drawn at the foot of the thread it sat
   * outside every bubble, beside an empty one wearing a bare caret (2026-09-30).
   */
  waitingSince?: number;
  /** Server-side command output (`/status`, ...), drawn apart from agent replies. */
  command?: boolean;
  /**
   * The server is holding this send behind a compaction, since this instant. Its run starts when
   * the history stops being rewritten, which takes a minute or two, and nothing else travels in
   * the meantime.
   */
  queuedSince?: number;
  /** Why the server parked this send: a compaction holding the history, or the run's mailbox
   *  holding it for the next turn. Drives the bubble's label. */
  queuedReason?: QueuedReason;
  /**
   * Sent, receipt awaited (`chat.send.received`). A socket a NAT timeout or a VPN switch killed
   * stays OPEN for a browser, so a send can leave without arriving: the receipt is the only proof.
   * Lifted by the receipt; turned into `error: 'not delivered'` when none comes in time.
   */
  pending?: boolean;
  /** A long aside a command produced (a compaction summary), folded away under the outcome. */
  details?: string;
  /** A statement of the system (a model fallback), drawn apart for the same reason. */
  notice?: boolean;
  /**
   * A compaction boundary, and how many turns it summarises. Not a message: the row is drawn as a
   * divider with the summary folded under it, because the turns above are still in the thread and
   * the owner did not write this.
   */
  summaryOf?: number;
  /**
   * How long the compaction took, when the server recorded it. Drawn on the boundary's own rule
   * ("Context compacted · 3 turns summarized · 1 min 20 s"), formatted like every other span in
   * the thread (`formatSpan`); absent on a boundary written before it was measured, and then
   * nothing is drawn rather than a zero.
   */
  compactionMs?: number;
  /** On a boundary: what the compaction archived, folded beside the summary (server, 2026-10-04). */
  archive?: string;
  /**
   * A compaction that was stopped: nothing was folded, the summary never landed, and `summaryOf`
   * counts the turns the plan was about to cover -- all of them still on the thread, in full.
   * Drawn as the boundary's sibling, with "kept" where a summary landed; `summaryOf` is also what
   * keeps it hoisted out of a run group, so the rule never reads as a bubble.
   */
  compactionStopped?: boolean;
  /** The run this bubble belongs to, when it sits inside one -- docs/run-grouping.md. */
  run?: RunInfo;
  /**
   * The fold row this bubble was fetched for, when it came back from `chat.run.items`.
   *
   * It is what keeps a group's open state across the swap from the folded row to the items it
   * stood for: the row was keyed `run-<first entry>`, and `foldKeyOf` reads the same string here
   * (docs/run-hydration.md).
   */
  foldOf?: string;
  ts: number;
}

export interface ToolItem extends ToolCallPayload {
  kind: 'tool';
  ts: number;
  /** The run this card belongs to, when it sits inside one -- docs/run-grouping.md. */
  run?: RunInfo;
  /** The fold row this card was fetched for -- `foldOf` on a bubble, same reason. */
  foldOf?: string;
  /**
   * The run ended while this call was still in flight, so its result frame is never coming.
   *
   * Client-side only: the server has no such state, it writes the call it settled. The card is
   * terminal (no spinner, a frozen duration) and says so rather than claiming a failure, which
   * is a verdict only a result can carry.
   */
  interrupted?: boolean;
}

/**
 * A finished run's work, standing in for the items it folds -- docs/run-hydration.md.
 *
 * Sent by the server in place of those items, and drawn as a collapsed group with nothing under
 * it until the reader opens one. That is what makes a long conversation cheap to open: the page
 * carries the headers, and the work of a group is fetched only if it is looked at.
 *
 * The row is a real item at a real position: it holds the id paging cursors point at, and
 * `hydrateRun` replaces it in place with what it stood for.
 */
export interface RunSummaryItem {
  kind: 'run';
  /** `run-<first folded entry id>`, as the server minted it. */
  id: string;
  /** Required here, unlike on a bubble: this row *is* its run. */
  run: RunInfo;
  toolCount: number;
  firstTool?: string;
  /** Rows the fold hides: the size of the skeleton drawn while they load. */
  itemCount: number;
  /** The last entry the row stands for; with `id`, the range hydration asks for. */
  lastId: string;
  /** `idle` until the group is opened; `failed` when the branch no longer holds the range. */
  hydration: 'idle' | 'loading' | 'failed';
  ts: number;
}

export type ChatItem = TextItem | ToolItem | RunSummaryItem;

/** A `spawn` tool call, reduced to what the shell needs to offer a door to the sub-agent. */
export interface SpawnCard {
  id: string;
  name: string;
  args: ToolItem['args'];
  ok: ToolItem['ok'];
  durationMs: ToolItem['durationMs'];
  /** Live or replayed lifecycle state of the sub-agent behind the card. */
  subagentId?: string;
  status?: SpawnLifecycleState['status'];
  displayName?: string;
  type?: string;
  mode?: string;
  resultLength?: number;
  error?: string;
}

/**
 * The tools a sub-agent card can come from. `spawn` creates one, `send` drives an existing one,
 * `delegate_browser_task` runs the browser agent as one, and all three run the identical
 * lifecycle: matching on `spawn` alone left every `send` card as a plain tool row with no status,
 * no door and nothing replayed after a reload, and the browser call was that plain row until it
 * became a real sub-agent (server 0.7).
 *
 * A `delegate_browser_task` call with `kept` runs no task: it lists or settles the windows earlier
 * tasks kept (the server folded `held_browser_windows` into it, 2026-10-04): a plain tool row.
 */
const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(['spawn', 'send', 'delegate_browser_task']);

export function isSubAgentTool(name: string, args: Record<string, unknown>): boolean {
  return SUBAGENT_TOOLS.has(name) && !(name === 'delegate_browser_task' && args.kept !== undefined);
}

type Listener = () => void;

/** Frozen so every empty-thread snapshot is the same reference (useSyncExternalStore requirement). */
const EMPTY_ITEMS: ChatItem[] = [];
const EMPTY_THREADS: string[] = [];
const EMPTY_SPAWN_CARDS: SpawnCard[] = [];
Object.freeze(EMPTY_SPAWN_CARDS);
/** One notification per displayed frame at most, whatever rate the tokens arrive at. */
const FRAME_MS = 16;
Object.freeze(EMPTY_ITEMS);
Object.freeze(EMPTY_THREADS);

function textOf(entry: HistoryEntry): string {
  if (entry.role === 'tool' || entry.role === 'run') return '';
  return entry.text;
}

/**
 * Well past what a day of chatting holds, low enough that a session carried to its end cannot
 * pin tens of thousands of bubbles in memory: past the cap the oldest items are dropped
 * (unloading), and because paging asks by the id of the oldest held item, they come back when
 * the reader scrolls there again.
 */
export const MAX_HELD_ITEMS = 6000;
export const TRIM_TO_ITEMS = 4000;

/**
 * How far back a thread has been read. `loading` is held here rather than in the screen so a
 * remount mid-request cannot fire a second one for the same page.
 *
 * `oldestId` is the id of the thread's oldest held item: paging asks for the page just before
 * it, which stays exact when the session grows between loads and when the client trims its
 * oldest items (docs/session-log.md).
 */
export interface HistoryPage {
  nextBefore: number;
  hasMore: boolean;
  loading: boolean;
  oldestId: string | null;
}

const NO_PAGE: HistoryPage = { nextBefore: 0, hasMore: false, loading: false, oldestId: null };
Object.freeze(NO_PAGE);

/**
 * An item that exists only in this window: the turn in flight. The server cannot have written it
 * yet, so no sync result can carry it, and it always belongs after everything a sync delivers.
 *
 * A parked send counts as one. The server took it and put it in a mailbox, and writes it to the
 * history only when the run drains it. Left out of this test it passed for persisted, which cost
 * it both ways: a sync delta hoisted the run's cards above the message still waiting, and a reset
 * dropped the bubble outright while the owner was watching it wait.
 */
function isLocalLive(item: ChatItem): boolean {
  // A finished run streams nothing and runs nothing. A bubble still flagged under one is a frame
  // that never came, not a turn in flight, and trusting the flag is what kept a stopped run's
  // reasoning alive through every reload, re-appended under the answer with its counter still
  // climbing (thread 4d5775e7, 2026-09-22: "Reasoning 23 min 43 s" after the last message).
  const alive = !item.run || item.run.status === 'running';
  if (item.kind === 'text') return (item.streaming === true && alive) || item.queuedSince !== undefined;
  return item.kind === 'tool' && item.running === true && alive;
}

/**
 * What a page leaves standing beside it: the items only this device holds.
 *
 * When the server says no run is answering on the thread, nothing can be streaming -- a bubble the
 * device still marks so belongs to a run that is over, and the page is the whole truth about it.
 * The owner's own sends survive (parked, or not yet on the log), because those are this device's
 * to keep, and so does a tool card still marked running: `reconcileRuns` settles it as
 * interrupted right after, the state its lost result leaves it in (a decision of its own, older
 * than this one). Otherwise the rule is the one above.
 */
function survivesPage(item: ChatItem, activeRun: boolean | undefined, userBubbles: boolean): boolean {
  const ownSend = item.kind === 'text' && item.role === 'user' && item.summaryOf === undefined;
  if (activeRun === false) {
    if (item.kind === 'tool') return item.running === true;
    return ownSend && (userBubbles || item.queuedSince !== undefined);
  }
  return isLocalLive(item) || (userBubbles && ownSend);
}

/**
 * An item inside a window's range that the window does not carry, and that is not therefore a
 * stale copy of something it does: what only this device holds yet.
 *
 * The turn in flight, plus the question that started it. The server writes a question under the
 * id the app minted for it, so an unmatched user bubble is one the log does not hold yet -- the
 * window was computed before the entry landed -- and never a second identity for one it does.
 * Dropping it took the owner's own message off the screen while a run was answering it.
 */
function windowLacks(item: ChatItem, activeRun?: boolean): boolean {
  return survivesPage(item, activeRun, true);
}

/** The server speaks ISO strings; the store thinks in milliseconds. */
function runInfoOf(run: RunMeta): RunInfo {
  return {
    id: run.id,
    status: run.status,
    startTs: new Date(run.startTs).getTime() || Date.now(),
    ...(run.endTs ? { endTs: new Date(run.endTs).getTime() || Date.now() } : {}),
  };
}

/** Replayed server entries as bubbles. Shared by the newest page and by every older one. */
function itemsOf(entries: HistoryEntry[]): ChatItem[] {
  return entries.map((entry, index) => {
    const ts = new Date(entry.ts).getTime() || Date.now() + index;
    if (entry.role === 'tool') {
      return {
        kind: 'tool',
        id: entry.id,
        name: entry.name,
        args: entry.args,
        durationMs: entry.durationMs,
        ok: entry.ok,
        output: entry.output,
        truncated: entry.truncated,
        // Carried through, so a tool still executing when the page reloaded keeps its spinner.
        // Without it the card rebuilt as a finished, successful, empty-output call.
        ...(entry.running && (!entry.spawn || entry.spawn.status === 'running') ? { running: true } : {}),
        ...(entry.spawn ? { spawn: entry.spawn } : {}),
        ...(entry.run ? { run: runInfoOf(entry.run) } : {}),
        ts,
      };
    }
    if (entry.role === 'run') {
      // A folded run: everything the header draws, and nothing else. The items arrive later, on
      // `chat.run.items`, and take this row's place.
      return {
        kind: 'run',
        id: entry.id,
        run: runInfoOf(entry.run),
        toolCount: entry.toolCount,
        ...(entry.firstTool ? { firstTool: entry.firstTool } : {}),
        itemCount: entry.itemCount,
        lastId: entry.lastId,
        hydration: 'idle',
        ts,
      };
    }
    return {
      kind: 'text',
      id: entry.id,
      role: entry.role === 'user' ? 'user' : 'agent',
      text: textOf(entry),
      attachments: entry.attachments ?? [],
      streaming: false,
      ...(entry.location ? { location: entry.location } : {}),
      ...(entry.transcripts ? { transcripts: entry.transcripts } : {}),
      ...(entry.reasoning ? { reasoning: entry.reasoning } : {}),
      ...(entry.reasoningTokens ? { reasoningTokens: entry.reasoningTokens } : {}),
      ...(entry.reasoningMs !== undefined ? { reasoningMs: entry.reasoningMs } : {}),
      ...(entry.command ? { command: true } : {}),
      ...(entry.details ? { details: entry.details } : {}),
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.summaryOf ? { summaryOf: entry.summaryOf } : {}),
      ...(entry.compactionMs !== undefined ? { compactionMs: entry.compactionMs } : {}),
      ...(entry.archive ? { archive: entry.archive } : {}),
      ...(entry.compactionStopped ? { compactionStopped: true } : {}),
      ...(entry.run ? { run: runInfoOf(entry.run) } : {}),
      ts,
    };
  });
}

/**
 * A compaction running on a thread: when it started (server clock) and the summary so far.
 *
 * The text is written live by the summarizer since 2026-09-12 and shown under the rule, so the
 * minutes the operation takes are readable rather than a bare counter.
 */
export interface CompactionRun {
  since: number;
  text: string;
  /**
   * What the summarizer has thought so far.
   *
   * Its own field, not folded into `text`: the thinking comes first and is a different thing on
   * screen. A compaction inheriting the session's effort spends a minute here with nothing to
   * show, and a bare counter reads the same whether a model is thinking or a provider is dead.
   */
  reasoning: string;
}

/**
 * How long a sent bubble the page does not carry is taken to be a turn still on its way in. Long
 * enough for preprocessing, gates and a prompt build; short enough that a bubble the server is
 * never going to mirror does not outlive the screen it was typed on.
 */
class ChatStoreImpl {
  private threads = new Map<string, ChatItem[]>();
  private streams = new Map<string, string>();
  /** Accumulated reasoning per open bubble, the counterpart of `streams` for the text. */
  private reasoning = new Map<string, string>();
  /** When each open bubble started thinking. Dropped once the span is sealed onto the item. */
  private reasoningStart = new Map<string, number>();
  /** The id of the bubble a thread's answer is streaming into; the media delivery that ends
   *  the answer lands on it instead of opening a second bubble. */
  private lastStream = new Map<string, string>();
  /** Threads with a run in flight on the server: drives the Stop button across the whole run. */
  private activeRuns = new Set<string>();
  /**
   * Threads a stop is in flight for: armed when a stop is sent, lifted when the cycle it targets
   * ends -- see `claimStop` for the exact doors.
   */
  private stopping = new Set<string>();

  /**
   * Threads the server says a stop is in flight for (`chat.run.stopping`): a stop taken on
   * another surface, and the state a window that reloaded mid-stop is replayed. Kept apart from
   * the local mark so a press can still arm instantly without claiming the server's state, and
   * read through the same `isStopping`; every door that lifts one lifts both.
   */
  private serverStopping = new Set<string>();
  /**
   * The run currently being answered, per thread. Live frames attach to it; sync entries carry
   * the server's id, which replaces the synthetic one when it arrives -- docs/run-grouping.md.
   */
  private openRuns = new Map<string, { info: RunInfo; synthetic: boolean }>();
  private syntheticSeq = 0;
  /** Sends whose receipt has not come yet, by chat.send id, with the timer that gives up. */
  private awaitingReceipt = new Map<string, ReturnType<typeof setTimeout>>();
  /** Whether the server receipts sends (`hello.receipts`): an older one is not waited for. */
  private receipts = false;
  /** Placeholder bubble per thread while a slow command runs, keyed by thread -> bubble id. */
  private pendingCommands = new Map<string, string>();
  /**
   * Threads on which a compaction is running, with the server's start instant.
   *
   * State, not an item. It was a bubble (a streaming "command" placeholder in the thread): one more
   * live item that every sync delta re-appended at the end, that a fresh page dropped and a replay
   * recreated, and that exactly one frame could ever remove. Two ghosts of it were seen wandering
   * through a run an hour after the compaction had ended. As state there is one per thread by
   * construction, nothing moves it, and every sign that the operation is over can end it.
   */
  private compacting = new Map<string, CompactionRun>();
  private unread = new Set<string>();
  private unreadSnapshot: string[] = EMPTY_THREADS;
  /** The threads a run is answering on, as a snapshot the list can compare by identity. */
  private runningSnapshot: string[] = EMPTY_THREADS;
  /** Where the next older page starts, per thread, and whether there is one at all. */
  private pages = new Map<string, HistoryPage>();
  /**
   * Whether dropping the oldest held items is safe right now: the reader is on the newest
   * message, so nothing they can see is going away. Set from the scroll handler; while the
   * reader is up in the history the trim waits.
   */
  private trimAllowed = new Map<string, boolean>();
  /**
   * What each hydrated run row stood for, per thread: the row itself and the ids of the items
   * that replaced it. This is what lets the trim fold a group back rather than drop it --
   * docs/run-hydration.md.
   */
  private hydrated = new Map<string, Map<string, { row: RunSummaryItem; itemIds: string[] }>>();
  /**
   * Sync cursors per thread: `since` is the id of the last entry received (for delta requests),
   * `leaf` is the branch tip the client is showing. Updated after every sync.
   */
  private syncState = new Map<string, { since: string | null; leaf: string | null; truncated?: boolean }>();
  private listeners = new Set<Listener>();
  private spawnCards = new Map<string, { tools: ToolItem[]; cards: SpawnCard[] }>();
  /** Live spawn states scoped by thread and card, without parsing user-controlled ids. */
  private spawnStatus = new Map<string, Map<string, SpawnLifecycleState>>();
  /** Pending coalesced notification, see `emitSoon`. */
  private frame: ReturnType<typeof setTimeout> | null = null;

  private spawnState(threadId: string, cardId: string): SpawnLifecycleState | undefined {
    return this.spawnStatus.get(threadId)?.get(cardId);
  }

  private setSpawnState(threadId: string, cardId: string, state: SpawnLifecycleState): void {
    let states = this.spawnStatus.get(threadId);
    if (!states) {
      states = new Map();
      this.spawnStatus.set(threadId, states);
    }
    states.set(cardId, state);
  }

  /** Returns the sync cursor for a thread, or null values for a thread not yet synced. */
  getSyncState(threadId: string): { since: string | null; leaf: string | null; truncated?: boolean } {
    return this.syncState.get(threadId) ?? { since: null, leaf: null };
  }

  private setSyncState(threadId: string, since: string | null, leaf: string | null, truncated?: boolean): void {
    this.syncState.set(threadId, { since, leaf, ...(truncated ? { truncated } : {}) });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Recomputed only when a spawn card actually changed. Every patch rebuilds the row array, so a
   * reader keyed on the list alone would see a new value on every token of every stream.
   */
  spawnCardsOf(threadId: string): SpawnCard[] {
    const tools = this.getItems(threadId).filter(
      (item): item is ToolItem => item.kind === 'tool' && isSubAgentTool(item.name, item.args),
    );
    const cached = this.spawnCards.get(threadId);
    if (cached && cached.tools.length === tools.length && cached.tools.every((tool, i) => tool === tools[i])) {
      return cached.cards;
    }
    const cards = tools.map(item => {
      const live = this.spawnState(threadId, item.id) ?? item.spawn;
      return {
        id: item.id,
        name: item.name,
        args: item.args,
        ok: item.ok,
        durationMs: item.durationMs,
        ...(live ? {
          subagentId: live.subagentId,
          status: live.status,
          displayName: live.displayName,
          type: live.agentType,
          mode: live.mode,
          ...(live.resultLength !== undefined ? { resultLength: live.resultLength } : {}),
          ...(live.error !== undefined ? { error: live.error } : {}),
        } : {}),
      };
    });
    // Standalone spawn cards: a programmatic spawn has no tool item, so it is carried by the
    // status map alone. Its card id is the subagent id; settled ones stay until the thread is
    // dismissed.
    const toolIds = new Set(tools.map(tool => tool.id));
    for (const [cardId, live] of this.spawnStatus.get(threadId) ?? []) {
      if (toolIds.has(cardId)) continue;
      cards.push({
        id: cardId,
        name: live.action,
        args: { type: live.agentType, mode: live.mode, task: '' },
        ok: live.status === 'complete',
        durationMs: undefined,
        subagentId: live.subagentId,
        status: live.status,
        displayName: live.displayName,
        type: live.agentType,
        mode: live.mode,
        ...(live.resultLength !== undefined ? { resultLength: live.resultLength } : {}),
        ...(live.error !== undefined ? { error: live.error } : {}),
      });
    }
    this.spawnCards.set(threadId, { tools, cards });
    return cards;
  }

  /** A sub-agent spawned: record its live state so the spawn card shows it before the tool result
   *  lands. `cardId` is the tool-start card id (tool spawns) or the sub-agent id. */
  startSpawn(threadId: string, cardId: string, info: { subagentId: string; displayName: string; type: string; mode: string; action: SpawnAction }): void {
    const current = this.spawnState(threadId, cardId);
    // A delayed start frame must never resurrect a terminal state restored from history or
    // received earlier on the live socket. It can still clear a stale spinner on that card.
    if (current?.status !== undefined && current.status !== 'running') {
      const item = this.getItems(threadId).find(entry => entry.id === cardId);
      if (item?.kind === 'tool' && item.running) {
        this.patchTool(threadId, cardId, { running: false, ok: current.status === 'complete', spawn: current }, true);
      }
      return;
    }
    const next: SpawnLifecycleState = current?.status === 'running'
      ? { ...current, displayName: info.displayName, agentType: info.type, mode: info.mode, action: info.action }
      : {
          subagentId: info.subagentId,
          displayName: info.displayName,
          agentType: info.type,
          mode: info.mode,
          action: info.action,
          status: 'running',
          startedAt: new Date().toISOString(),
        };
    this.setSpawnState(threadId, cardId, next);
    this.spawnCards.delete(threadId);
    this.emit();
  }

  /**
   * Reconciles legacy history that predates persisted spawn lifecycle state. New cards are
   * authoritative from `spawn`; old cards can only recover a live child from the roster. An idle
   * legacy child is left unresolved rather than falsely labelled successful.
   */
  reconcileSpawnRoster(threadId: string, agents: readonly SubAgentEntry[]): void {
    // The one owner of the roster fallback, sharing its match with `spawnDoorsOf` so the two cannot
    // disagree about which sub-agent a card refers to.
    const { byId, byName } = indexRoster(agents);
    for (const item of this.getItems(threadId)) {
      if (item.kind !== 'tool' || !isSubAgentTool(item.name, item.args) || !item.running) continue;
      const current = this.spawnState(threadId, item.id) ?? item.spawn;
      if (current) continue;
      const agent = agentOfCard({ args: item.args }, byId, byName);
      if (!agent) continue;
      if (agent.status === 'running') {
        this.startSpawn(threadId, item.id, {
          subagentId: agent.id,
          displayName: agent.displayName,
          type: agent.type,
          mode: typeof item.args.mode === 'string' ? item.args.mode : 'run',
          action: item.name === 'send' ? 'send' : 'spawn',
        });
      }
    }
  }

  /** Settles a spawn card with a final status. Kept so a finished card still shows what happened. */
  settleSpawn(threadId: string, cardId: string, outcome: { subagentId?: string; status: 'complete' | 'error' | 'aborted'; resultLength?: number; error?: string }): void {
    const current = this.spawnState(threadId, cardId);
    const tool = this.getItems(threadId).find(item => item.id === cardId);
    const runningTool = tool?.kind === 'tool' && isSubAgentTool(tool.name, tool.args) && tool.running;
    const fallbackName = tool?.kind === 'tool' && typeof tool.args.name === 'string' ? tool.args.name : outcome.subagentId ?? cardId;
    const next: SpawnLifecycleState | undefined = current ?? (outcome.subagentId ? {
      subagentId: outcome.subagentId,
      displayName: fallbackName,
      agentType: tool?.kind === 'tool' && typeof tool.args.type === 'string' ? tool.args.type : 'unknown',
      mode: tool?.kind === 'tool' && typeof tool.args.mode === 'string' ? tool.args.mode : 'run',
      action: tool?.kind === 'tool' && tool.name === 'send' ? 'send' as const : 'spawn' as const,
      status: 'running' as const,
      startedAt: new Date().toISOString(),
    } : undefined);
    // A delayed duplicate terminal event must not rewrite the first terminal outcome.
    if (current && current.status !== 'running') {
      if (runningTool) this.patchTool(threadId, cardId, { running: false, ok: current.status === 'complete', spawn: current }, true);
      return;
    }
    if (next) {
      const spawn = {
        ...next,
        status: outcome.status,
        ...(outcome.resultLength !== undefined ? { resultLength: outcome.resultLength } : {}),
        ...(outcome.error !== undefined ? { error: outcome.error } : {}),
      };
      this.setSpawnState(threadId, cardId, spawn);
      if (runningTool || tool?.kind === 'tool') {
        this.patchTool(threadId, cardId, { running: false, ok: outcome.status === 'complete', spawn }, true);
      }
    } else if (runningTool) {
      this.patchTool(threadId, cardId, { running: false }, true);
    }
    this.spawnCards.delete(threadId);
    this.emit();
  }

  getItems(threadId: string): ChatItem[] {
    return this.threads.get(threadId) ?? EMPTY_ITEMS;
  }

  getUnreadThreads(): string[] {
    return this.unreadSnapshot;
  }

  /** The threads with a run in flight right now, fresh from the run frames, not from a listing. */
  getRunningThreads(): string[] {
    return this.runningSnapshot;
  }

  getPage(threadId: string): HistoryPage {
    return this.pages.get(threadId) ?? NO_PAGE;
  }

  /** Records where the newest page left off, so scrolling up knows what to ask for. */
  setPage(threadId: string, page: { nextBefore: number; hasMore: boolean; oldestId?: string | null }): void {
    const held = this.threads.get(threadId);
    const oldestId = page.oldestId !== undefined ? page.oldestId : (held?.[0]?.id ?? null);
    this.pages.set(threadId, { ...page, oldestId, loading: false });
    this.emit();
  }

  /**
   * The thread's oldest held item, if any. When it changes (a page prepended, the oldest items
   * trimmed), the paging cursor must follow, or the next request would repeat or skip entries.
   */
  private firstItemId(threadId: string): string | null {
    return this.threads.get(threadId)?.[0]?.id ?? null;
  }

  /** Latched before the request leaves, cleared when its page lands or the send fails. */
  setPageLoading(threadId: string, loading: boolean): void {
    const current = this.pages.get(threadId) ?? NO_PAGE;
    if (current.loading === loading) return;
    this.pages.set(threadId, { ...current, loading });
    this.emit();
  }

  /**
   * Whether the thread's oldest items may be dropped. True only while the reader is at the
   * newest message (offset 0 of the inverted list): dropping is invisible to them, and the
   * cursor follows (see `pageCursorFollows`).
   */
  setTrimAllowed(threadId: string, allowed: boolean): void {
    if (this.trimAllowed.get(threadId) === allowed) return;
    this.trimAllowed.set(threadId, allowed);
    if (allowed) {
      // A trim may have been waiting: apply and let the list breathe.
      this.threads.set(threadId, this.trimToCap(threadId, this.threads.get(threadId) ?? EMPTY_ITEMS, true));
      this.pageCursorFollows(threadId);
      this.emit();
    }
  }

  /**
   * Gives memory back, when the reader is not looking at what goes -- docs/run-hydration.md.
   *
   * Two steps, cheapest first. **Dehydrating** puts a hydrated group back to the one row the
   * server sent for it: hundreds of items become one, nothing leaves the thread, and reopening
   * the group fetches them again. **Dropping** is the fallback for what cannot be folded (a run
   * that streamed in live, free bubbles) and it does lose content, so it is paid for by telling
   * the pager there is older work again.
   *
   * That last part is the whole trap. A live conversation that grows past the cap started as a
   * page the server had nothing older than, so `hasMore` is false. Drop the oldest items without
   * touching it and the reader who scrolls up asks for nothing and is served nothing: the
   * beginning of their own conversation is gone until they switch threads and back.
   */
  private trimToCap(threadId: string, items: ChatItem[], force = false): ChatItem[] {
    if (items.length <= MAX_HELD_ITEMS) return items;
    if (!force && this.trimAllowed.get(threadId) !== true) return items;
    const folded = this.dehydrateHeld(threadId, items);
    if (folded.length <= MAX_HELD_ITEMS) return folded;
    this.forgetHydrated(threadId, folded.slice(0, folded.length - TRIM_TO_ITEMS));
    // Content is leaving the thread: whatever the page said before, there is older work now.
    const page = this.pages.get(threadId);
    if (page && !page.hasMore) this.pages.set(threadId, { ...page, hasMore: true });
    return folded.slice(folded.length - TRIM_TO_ITEMS);
  }

  /**
   * Every hydrated group put back to its row, oldest first, until the thread is under the cap.
   *
   * The rows are the ones the server sent, kept verbatim rather than rebuilt: a row carries the
   * exact entry ids of the range it stands for, and a tool card holds `t-<callId>` rather than
   * the id of its entry -- rebuilding a range from what is on screen is how the wrong ids would
   * get sent back, which is the bug this paging code has already shipped once.
   */
  private dehydrateHeld(threadId: string, items: ChatItem[]): ChatItem[] {
    const memo = this.hydrated.get(threadId);
    if (!memo || memo.size === 0) return items;
    const held = new Set(items.map(item => item.id));
    const rowAt = new Map<string, RunSummaryItem>();
    const swallowed = new Set<string>();
    let freed = 0;
    for (const { row, itemIds } of memo.values()) {
      const first = itemIds[0];
      // A range whose head was already dropped cannot be folded back: the row would have nowhere
      // to stand, and swallowing the tail would delete it outright.
      if (first === undefined || !held.has(first)) continue;
      rowAt.set(first, row);
      for (const id of itemIds) if (held.has(id)) swallowed.add(id);
      freed += itemIds.length - 1;
      // Enough is enough: folding back a group the reader just opened, when the thread is already
      // under the cap without it, would collapse their work under them for nothing.
      if (items.length - freed <= TRIM_TO_ITEMS) break;
    }
    if (rowAt.size === 0) return items;
    const out: ChatItem[] = [];
    for (const item of items) {
      const row = rowAt.get(item.id);
      if (row) out.push({ ...row, hydration: 'idle' });
      if (swallowed.has(item.id)) continue;
      out.push(item);
    }
    for (const id of rowAt.keys()) memo.delete(`run-${id}`);
    return out;
  }

  /** Ranges whose items are being dropped: the row can no longer stand for what is not there. */
  private forgetHydrated(threadId: string, dropped: readonly ChatItem[]): void {
    const memo = this.hydrated.get(threadId);
    if (!memo || memo.size === 0) return;
    const gone = new Set(dropped.map(item => item.id));
    for (const [rowId, { itemIds }] of memo) {
      if (itemIds.some(id => gone.has(id))) memo.delete(rowId);
    }
  }

  /** The paging cursor names the oldest held item: keep it exact through prepends and trims. */
  private pageCursorFollows(threadId: string): void {
    const page = this.pages.get(threadId);
    if (!page) return;
    this.pages.set(threadId, { ...page, oldestId: this.firstItemId(threadId) });
  }

  hasThread(threadId: string): boolean {
    return this.threads.has(threadId);
  }

  isUnread(threadId: string): boolean {
    return this.unread.has(threadId);
  }

  /** A run is answering on this thread right now, streaming or between tool calls. */
  hasActiveRun(threadId: string): boolean {
    return this.activeRuns.has(threadId);
  }

  /**
   * Claims the thread's stop for the caller: one stop per cycle.
   *
   * True means the caller may send its stop -- against a run, or against the compaction a stop
   * can also abort. False means one is already in flight: the server answers nothing to a second
   * request while the abort of the cycle travels ("stopping"), so the only thing a second frame
   * could produce is a second bubble for the one stop. Nothing is sent then, and the session
   * menu entry says "Stopping…" instead of "Stop" by reading `isStopping` -- the union, so a
   * stop taken on another surface refuses here exactly like one taken on this one.
   *
   * The mark is armed only while a cycle is actually in flight. A stop sent when nothing runs is
   * answered "Nothing running." at once, and there is no run end or compaction end to lift a mark
   * it set -- it would silence the next stop, the one that matters. The doors that lift it are
   * every witness that the cycle is over: `endRun` (a stopped run ends `aborted`), the end of the
   * compaction, a session list or a page that no longer holds the run, a page that replaces the
   * thread, and the thread going away. `liftStops` is the one place they all go through, so the
   * local mark and the server's can never disagree about whether the cycle is over.
   *
   * A question waiting on the thread is the other case with nothing to wait for: the server reads
   * a stop as "cancel the question" and leaves the run alone, so the request may go and no mark is
   * armed -- the next press is the real stop, and a mark set here would swallow it until the run
   * ended on its own.
   */
  claimStop(threadId: string): boolean {
    if (questionStore.forThread(threadId).length > 0) return true;
    if (this.isStopping(threadId)) return false;
    if (this.activeRuns.has(threadId) || this.openRuns.has(threadId) || this.compacting.has(threadId)) {
      this.stopping.add(threadId);
      this.emit();
    }
    return true;
  }

  /**
   * A stop is in flight for this thread: the menu entry reads "Stopping…" and sends nothing.
   *
   * The union of the two marks. The local one is armed by this device's press, so it can answer
   * the instant the finger lifts; the server's arrives on `chat.run.stopping`, which is what
   * shows a stop taken on the web over here and what a window that reloaded mid-stop is replayed.
   */
  isStopping(threadId: string): boolean {
    return this.stopping.has(threadId) || this.serverStopping.has(threadId);
  }

  /**
   * The server says a stop was claimed on this thread and the work it aborts has not departed.
   *
   * One frame per cycle, replayed to a window that syncs while it holds, so it is kept even when
   * no local press happened. Recorded only while a cycle is known here -- the same condition that
   * arms the local mark. A frame that outlived its cycle (the end travelled first, a late replay)
   * is dropped rather than resurrected: nothing would ever lift it again, and the thread would
   * read "Stopping…" for good.
   */
  markStopping(threadId: string): void {
    if (this.serverStopping.has(threadId)) return;
    if (!this.activeRuns.has(threadId) && !this.openRuns.has(threadId) && !this.compacting.has(threadId)) return;
    this.serverStopping.add(threadId);
    this.emit();
  }

  /**
   * Lifts the marks without a run end.
   *
   * The one stop that aborts nothing is the one answered by canceling a pending question: the run
   * carries on, no `chat.run.end` is coming for that stop, and a mark left through it would
   * swallow the next stop -- the one meant to abort. The router calls this on the server's
   * `question.resolved` (reason `canceled`), which is also how the race closes: a stop sent before
   * the ask reached this device armed a mark the question's own cancellation lifts.
   */
  liftStop(threadId: string): void {
    if (this.liftStops(threadId)) this.emit();
  }

  /**
   * Every door that says the cycle is over goes through here: the two marks are one state read
   * through `isStopping`, so they are lifted together or the display depends on which one the
   * door remembered.
   */
  private liftStops(threadId: string): boolean {
    const local = this.stopping.delete(threadId);
    const server = this.serverStopping.delete(threadId);
    return local || server;
  }

  /** The run live frames of a thread belong to, if any. */
  private liveRun(threadId: string): RunInfo | undefined {
    return this.openRuns.get(threadId)?.info;
  }

  /**
   * The run a live item the agent produced belongs to, opened if none is. A stream or a tool card
   * arriving with no run open means the start frame was missed, or an older server ended the run
   * early (once per message folded into it): the work is in flight all the same. Without a run the
   * item stood alone for good, a lone expanded card between two folded groups of the same run. A
   * synthetic run is what `chat.run.start` would have opened, and the next page renames it.
   */
  private runForLiveItem(threadId: string): RunInfo {
    const open = this.openRuns.get(threadId);
    if (open) return open.info;
    this.syntheticSeq += 1;
    const info: RunInfo = { id: `live-${this.syntheticSeq}`, status: 'running', startTs: Date.now() };
    this.openRuns.set(threadId, { info, synthetic: true });
    this.activeRuns.add(threadId);
    this.refreshRunning();
    return info;
  }

  startRun(threadId: string, runId?: string): void {
    if (this.activeRuns.has(threadId)) return;
    this.activeRuns.add(threadId);
    this.refreshRunning();
    // The frame arrives before any entry does (the trigger turn is written inside the run), so
    // live-created items need a run to belong to right away. The name is the one the frame
    // carries when it does: since server 0.6.3 the run's marker stores the same id, so the page
    // confirms it rather than renaming it. It stays renameable all the same, for a server whose
    // pages still name a run after its marker's entry.
    if (!this.openRuns.has(threadId)) {
      this.syntheticSeq += 1;
      this.openRuns.set(threadId, {
        info: { id: runId ?? `live-${this.syntheticSeq}`, status: 'running', startTs: Date.now() },
        synthetic: true,
      });
    } else {
      this.openRuns.get(threadId)!.info.status = 'running';
    }
    this.emit();
  }

  /** Closes the run of a thread. False when there was none to close: the end said nothing new. */
  endRun(threadId: string, reason: RunStatus = 'done'): boolean {
    // A compaction runs inside its run (a gate at the start, an overflow retry in the middle) and
    // does not outlive it: a Stop that aborted the summarizer ends both.
    this.compacting.delete(threadId);
    // The stop in flight is over, whatever the motive of the end -- a stopped run ends `aborted`.
    this.liftStops(threadId);
    // And a command placeholder still waiting across the end of the run is resolved here. The one
    // command the server deliberately leaves unanswered is a stop whose abort is already
    // travelling: the web stopped the same thread a moment before, this device sent its own
    // request and no frame is coming for it. Left alone, the "Running /stop…" the server drew
    // would spin for good -- nothing else in the app ever answers it. No text is invented for the
    // resolution: the placeholder is dropped, the way an answer that moved on drops it, and a
    // result that still lands afterwards re-materialises under the same id.
    this.clearCommandPending(threadId);
    if (!this.activeRuns.delete(threadId) && !this.openRuns.has(threadId)) return false;
    this.refreshRunning();
    const open = this.openRuns.get(threadId);
    this.openRuns.delete(threadId);
    if (open) {
      // Everything the run painted closes at once: the header the renderer builds reads the
      // status off the items, so patching them is what folds the run under one collapsed row.
      const endTs = Date.now();
      this.sealRun(threadId, open.info.id, reason, endTs);
      this.signTrigger(threadId, { ...open.info, status: reason, endTs });
    }
    this.emit();
    return true;
  }

  /**
   * A run that drew nothing signs the message that triggered it, as the server's pages do
   * (`runFold`). Stopped right after the send, or failed on its first call, it had no item to
   * carry it: no signature, and no Continue to pick the message back up (2026-10-02).
   *
   * The trigger is the owner's newest message, provided no run claims it already (a message folded
   * into a run belongs to that run) and it is not still waiting to be taken up.
   */
  private signTrigger(threadId: string, run: RunInfo): void {
    const items = this.threads.get(threadId);
    if (!items || items.some(item => item.run?.id === run.id && !hasNothingToShow(item))) return;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]!;
      if (!isOwnerMessage(item) || item.kind !== 'text') continue;
      if (item.run || item.queuedSince !== undefined) return;
      const next = [...items];
      next[index] = { ...item, run };
      this.threads.set(threadId, next);
      return;
    }
  }

  /**
   * Cards of a run that ended while they were still in flight.
   *
   * Their result frame is never coming: the run died on an API error, a Stop cut it, or its end
   * was lost and the server's own view closed it. Left running, the spinner spins for good and
   * `RunningFor` keeps measuring from `ts` against the current clock -- a call the server had
   * settled in 25 s read "220m 25s" on the phone three hours later. The duration is frozen here,
   * at the run's end, which is the last instant the call is known to have been alive, and no
   * terminal card ever counts from the current clock again.
   *
   * Sub-agent cards are left alone: their lifecycle is the spawn state machine's (`startSpawn`,
   * `settleSpawn`, `reconcileSpawnRoster`, whose guards exist to survive delayed frames), they
   * draw no counter, and the router refetches the roster at every run end.
   */
  private interruptInFlightTools(threadId: string, runId: string, endTs: number): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    let changed = false;
    const next = items.map(item => {
      if (item.kind !== 'tool' || item.running !== true) return item;
      if (item.run?.id !== runId || isSubAgentTool(item.name, item.args)) return item;
      changed = true;
      return {
        ...item,
        running: false,
        interrupted: true,
        durationMs: item.durationMs ?? Math.max(0, endTs - item.ts),
      };
    });
    if (!changed) return;
    this.threads.set(threadId, next);
    this.emitSoon();
  }

  /** Marks every item of a run with its terminal state. */
  private sealRun(threadId: string, runId: string, status: RunStatus, endTs: number): void {
    // A run reaching a terminal state is the only thing that says a card in flight will never
    // settle, and every door that closes a run comes through here: the end frame, a page the
    // server serves with no active run, and the session list no longer holding the thread.
    if (status !== 'running') this.interruptInFlightTools(threadId, runId, endTs);
    const items = this.threads.get(threadId);
    if (!items) return;
    let changed = false;
    const closed: string[] = [];
    this.threads.set(
      threadId,
      items.map(item => {
        if (item.run?.id !== runId) return item;
        // A finished run streams nothing: a bubble it left open never gets its done frame (a Stop
        // cut the call, the socket dropped it, the abort named another streamer), and its
        // reasoning counter kept measuring against the clock. The span freezes at the run's end,
        // the last instant it is known to have run, and the text is whatever had arrived.
        const stillStreaming = status !== 'running' && item.kind === 'text' && item.streaming;
        if (item.run.status === status && !stillStreaming) return item;
        changed = true;
        const run = { ...item.run, status, endTs };
        if (!stillStreaming || item.kind !== 'text') return { ...item, run };
        closed.push(item.id);
        const frozen =
          item.reasoningMs === undefined && item.reasoningStartedAt !== undefined
            ? { reasoningMs: Math.max(0, endTs - item.reasoningStartedAt) }
            : {};
        return { ...item, run, streaming: false, text: this.streams.get(item.id) ?? item.text, ...frozen };
      }),
    );
    // And the stream tables let go of them, so a frame that still turns up cannot reopen a bubble
    // of a run that is over.
    for (const id of closed) {
      this.streams.delete(id);
      this.reasoning.delete(id);
      this.reasoningStart.delete(id);
    }
    if (changed) this.emitSoon();
  }

  /**
   * Reconciles the open-run bookkeeping with a page of entries from the server.
   *
   * Two jobs. When the entries carry the real run id of the turn in flight, the synthetic run
   * live frames created under is renamed to it, so one run never renders as two groups. And when
   * the server says no run is active, a trailing run whose end was lost (disconnect, crash)
   * settles as done instead of spinning forever as an open group.
   */
  private reconcileRuns(threadId: string, entries: HistoryEntry[], activeRun?: boolean): void {
    const open = this.openRuns.get(threadId);
    if (activeRun === true) {
      // The last running run among the incoming entries is the one in flight. Prefer the real id
      // when one exists; a page that predates the run (or a run so fresh its entries are not
      // written) keeps what the live frames established.
      const incoming = [...entries].reverse().find(entry => entry.run?.status === 'running');
      if (incoming?.run) {
        const real = runInfoOf(incoming.run);
        if (open) {
          if (open.synthetic && open.info.id !== real.id) {
            this.renameRun(threadId, open.info.id, real);
          }
          this.openRuns.set(threadId, { info: real, synthetic: false });
        } else {
          this.openRuns.set(threadId, { info: real, synthetic: false });
        }
      } else if (!open) {
        // activeRun said yes but nothing carries the run yet: the frame-to-entry gap. Open a
        // synthetic run so frames keep attaching, exactly like chat.run.start does.
        this.syntheticSeq += 1;
        this.openRuns.set(threadId, {
          info: { id: `live-${this.syntheticSeq}`, status: 'running', startTs: Date.now() },
          synthetic: true,
        });
      }
    } else if (activeRun === false) {
      this.openRuns.delete(threadId);
      // The server says no run is answering on the thread: a stop in flight is over too, whether
      // or not its end frame ever arrives.
      this.liftStops(threadId);
      // No run is in flight, so whatever the live frames painted under a synthetic id is the work
      // of the run this page closes: it takes that run's id, status and end. Renaming only while
      // the run was still running left a page that arrived after its end with two ids for one
      // run, the cards under the synthetic one (and a stale start, when an earlier end had been
      // missed), the phases under the server's -- three groups and a wrong duration for one turn.
      const latest = [...entries].reverse().find(entry => entry.run)?.run;
      if (open?.synthetic && latest) this.renameRun(threadId, open.info.id, runInfoOf(latest));
      // A trailing run still marked running is dead (its end frame or marker was lost): settle it
      // as done so the group closes instead of rendering as an eternal open run. Only the last
      // run can be running, so the search goes from the end.
      const items = this.threads.get(threadId) ?? EMPTY_ITEMS;
      const running = [...items].reverse().find(item => item.run?.status === 'running');
      if (running?.run) {
        // At its last own item, the same verdict the server's page gives a dead run (`runFold`):
        // the clock at the moment the thread is opened made its span a function of when the owner
        // looked -- "run · 1 h 41 min" for a run that lived 47 (2026-09-22).
        const runId = running.run.id;
        const last = items.reduce((ts, item) => (item.run?.id === runId ? Math.max(ts, item.ts) : ts), running.run.startTs);
        this.sealRun(threadId, runId, 'done', running.run.endTs ?? last);
      }
      // And the cards of that run, whether or not the seal above had anything to do: the rename
      // may have carried the page's terminal status onto them already, which leaves no run marked
      // running for the search to find while a card of it is still in flight. The server says no
      // run is answering, so that card never reported and never will.
      const settled = this.threads.get(threadId) ?? EMPTY_ITEMS;
      const trailing = [...settled].reverse().find(item => item.run)?.run;
      if (trailing) this.interruptInFlightTools(threadId, trailing.id, trailing.endTs ?? Date.now());
    }
  }

  /** Re-keys the items of one run under the server's id. */
  private renameRun(threadId: string, fromId: string, into: RunInfo): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    const matched = items.filter(item => item.run?.id === fromId).length;
    if (matched === 0) return;
    this.threads.set(
      threadId,
      items.map(item => (item.run?.id === fromId ? { ...item, run: into } : item)),
    );
    this.emitSoon();
  }

  /**
   * Syncs the run flags with the server's own view (session list). Replaces, not merges: a
   * run the server no longer lists is over, even if its end frame was lost to a disconnect.
   */
  seedRuns(threadIds: string[]): void {
    const next = new Set(threadIds);
    const removed = [...this.activeRuns].filter(id => !next.has(id));
    if (next.size === this.activeRuns.size && removed.length === 0) {
      if ([...next].every(id => this.activeRuns.has(id))) return;
    }
    // A run the server no longer lists is over even if its end frame was lost: settle the open
    // run of those threads the way endRun would -- the stop in flight goes with it.
    for (const threadId of removed) {
      const open = this.openRuns.get(threadId);
      if (open) this.sealRun(threadId, open.info.id, 'done', Date.now());
      this.openRuns.delete(threadId);
      this.liftStops(threadId);
    }
    this.activeRuns = next;
    this.refreshRunning();
    this.emit();
  }

  markUnread(threadId: string): void {
    if (this.unread.has(threadId)) return;
    this.unread.add(threadId);
    this.refreshUnread();
  }

  markRead(threadId: string): void {
    if (!this.unread.delete(threadId)) return;
    this.refreshUnread();
  }

  /**
   * Handles a `session.sync.result` from the server.
   *
   * Four cases:
   * - A delta (no `reset`, no paging cursor): entries are appended, existing items with matching
   *   ids are replaced in place (a tool card that was live is now settled).
   * - A **window** (`nextBefore` present, which the server sends for the newest page and only
   *   for it): authoritative for the range it covers, so it replaces that range instead of
   *   piling onto it -- see `applyWindow`.
   * - `"unknown-cursor"`: the cursor was not found, entries is a fresh page. Replaces the thread.
   * - `"branch-switch"`: the server's leaf diverged from the client's. Replaces the thread. This
   *   is the case that `/branches`, `/fork`, `/undo` will exercise in lots 7 and 8.
   *
   * In both reset cases, only genuinely local items survive: bubbles still being streamed into.
   * Everything else defers to the server's snapshot, which is now the source of truth.
   *
   * When `truncated` is true, the server cut at its limit and there is more to fetch.
   */
  handleSyncResult(
    threadId: string,
    entries: HistoryEntry[],
    head: string | null,
    leaf: string | null,
    activeRun?: boolean,
    reset?: 'unknown-cursor' | 'branch-switch',
    truncated?: boolean,
    hasMore?: boolean,
    nextBefore?: number,
  ): void {
    if (activeRun === true) this.activeRuns.add(threadId);
    else if (activeRun === false) this.activeRuns.delete(threadId);
    this.refreshRunning();

    if (reset) {
      // Reset: replace the thread. Only streaming items survive, because they exist only locally.
      this.resetThread(threadId, entries, activeRun);
    } else if (nextBefore !== undefined) {
      // The newest page of the branch, asked for with a null cursor: what the thread *is* over
      // the range it covers, not something to add to it.
      this.applyWindow(threadId, entries, activeRun);
    } else {
      // Delta: append entries, replacing any with matching ids (live tool cards settling).
      this.appendSyncEntries(threadId, entries);
    }

    // The run bookkeeping follows the entries: adopt the server's run id for the turn in flight,
    // or settle a trailing run whose end never arrived. After the page is applied, so the
    // settle sees the entries it is the verdict on.
    this.reconcileRuns(threadId, entries, activeRun);

    // Update sync cursors: head is the last entry in the file, leaf is the branch tip.
    // If truncated, we don't have head yet -- keep asking until we do.
    this.setSyncState(threadId, truncated ? this.getSyncState(threadId).since : head, leaf, truncated);

    // A fresh page (open or reset) replaces the held thread, so the paging cursor is whatever
    // the server serves with it: that is what tells the client there is older work and where
    // to ask. Without the fields (old server, or a delta), the held cursor stands -- except on
    // a reset, where the old window is gone and a stale cursor would page from the wrong place.
    if (nextBefore !== undefined) {
      this.setPage(threadId, { nextBefore, hasMore: hasMore === true });
    } else if (reset) {
      this.pages.delete(threadId);
    }
    this.emit();
  }

  /**
   * Reset (replace) a thread with server entries. Only streaming items survive.
   * Called on unknown-cursor or branch-switch.
   */
  private resetThread(threadId: string, entries: HistoryEntry[], activeRun?: boolean): void {
    // A fresh page post-dates whatever compaction this window last heard of. One still in flight
    // is replayed right after the page (docs/live-turn-replay.md), which sets the state again; one
    // that has settled is not, which is the point. The stop in flight follows the same rule for
    // the same reason: the page is the truth over its range, and the replayed `chat.run.stopping`
    // is what re-raises the state if the abort has not departed yet.
    this.compacting.delete(threadId);
    this.liftStops(threadId);
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const base = this.itemsOfWithSpawnReconcile(threadId, entries);
    const known = new Set(base.map(item => item.id));

    // Only genuinely local items survive a reset: bubbles still being streamed into.
    // These exist only in memory, the server cannot have them -- and none exist once the server
    // says no run is answering (`survivesPage`).
    const live = existing.filter(item => !known.has(item.id) && survivesPage(item, activeRun, false));

    this.threads.set(threadId, [...base, ...live]);
    this.spawnCards.delete(threadId);
  }

  /**
   * A fresh window: the newest page of the branch, which is the truth over the range it covers.
   *
   * `resume` asks with a null cursor on every reconnect, and the thread it answers is rarely
   * empty, so this used to run through `appendSyncEntries`: an entry the window draws under an id
   * the live run never used counted as new and landed at the end, under the answer. Two of them
   * do that every time. A run that died before its first token is a bubble the window invented
   * locally from the stream id while the server journalled a `failure` of its own, and a finished
   * run comes back folded into one header row standing for cards the window holds one by one.
   * That is the "same error twice, same run twice, both below the answer" of session 37e36291.
   *
   * What the window does not cover is kept: the pages the reader walked back to sit above it, or
   * a reconnect would yank them out from under a reader who had scrolled up. Everything inside
   * the range defers to the window, except what only this device holds (a bubble being streamed
   * into, a card still running, a send still parked), which belongs after it.
   */
  private applyWindow(threadId: string, entries: HistoryEntry[], activeRun?: boolean): void {
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const base = this.itemsOfWithSpawnReconcile(threadId, entries);
    if (base.length === 0) return;
    const known = new Set(base.map(item => item.id));
    const from = base[0]!.ts;
    // What the page carries folded. A run that travelled as a header is one whose entries this
    // page deliberately does not hold, so an item of that run still marked live can never be
    // reconciled against it: it was re-appended after the page, which put a card after the
    // answer and made `buildRows` swallow the answer into the run's own group.
    const foldedRuns = new Set(entries.flatMap(entry => (entry.role === 'run' ? [entry.run.id] : [])));

    // The cut: the first held item the window has a say about. An item older than the window's
    // oldest and under an id the window does not carry is above it, and stays.
    let cut = existing.length;
    for (let i = 0; i < existing.length; i++) {
      const item = existing[i]!;
      if (item.ts < from && !known.has(item.id)) continue;
      cut = i;
      break;
    }
    const above = existing.slice(0, cut);
    const live = existing
      .slice(cut)
      .filter(item => {
        if (known.has(item.id) || !windowLacks(item, activeRun)) return false;
        return !(item.run && foldedRuns.has(item.run.id));
      });

    this.threads.set(threadId, this.trimToCap(threadId, [...above, ...base, ...live]));
    this.pageCursorFollows(threadId);
    this.spawnCards.delete(threadId);
  }

  /**
   * Append sync delta entries to a thread. Entries with matching ids replace existing ones
   * (a live tool card now has its result).
   */
  private appendSyncEntries(threadId: string, entries: HistoryEntry[]): void {
    if (entries.length === 0) return;
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const incoming = this.itemsOfWithSpawnReconcile(threadId, entries);
    const byId = new Map(incoming.map(item => [item.id, item]));

    // An id the thread already holds is **patched where it sits**, never moved. Dropping it and
    // re-appending is what turned a page the client already had into a reordering: a racing
    // session.sync leaves with a null cursor and re-delivers the opening exchange, and the first
    // question landed under the answer to the second. Same fault settles a tool card at the end of
    // the thread rather than in the turn that called it.
    const patched = existing.map(item => byId.get(item.id) ?? item);
    const seen = new Set(existing.map(item => item.id));
    const fresh = incoming.filter(item => !seen.has(item.id));
    // A delta is newer than what is persisted, but NOT newer than the turn in flight: the live
    // items belong to a run the server has not written yet. Appending blind hoists a running tool
    // card above the user bubble it answers.
    const persisted = patched.filter(item => !isLocalLive(item));
    const live = patched.filter(isLocalLive);
    this.threads.set(threadId, this.trimToCap(threadId, [...this.insertByTs(persisted, fresh), ...live]));
    this.pageCursorFollows(threadId);
    this.spawnCards.delete(threadId);
  }

  /**
   * The delta's entries, each in its place among what the thread already holds.
   *
   * Appending them was the rule, on the grounds that a delta is newer than what is persisted. One
   * entry breaks it: a folded run header. Its id is one the thread can never hold beforehand -- it
   * names a range, not an entry -- and its place is where the run began, not where the delta
   * started. Appended, it landed *after* the answer it stands behind: the reader got the collapsed
   * group below the message it belongs to, which is what "the last message was inside the group"
   * looked like on 2026-09-10 (docs/run-hydration.md).
   *
   * The scan walks back from the end and stops at the first entry that is older, so the order the
   * thread already had is never rearranged and a plain fresh frame, the common case, still lands
   * last.
   */
  private insertByTs(existing: ChatItem[], incoming: ChatItem[]): ChatItem[] {
    if (incoming.length === 0) return existing;
    const out = [...existing];
    for (const item of incoming) {
      let at = out.length;
      while (at > 0 && out[at - 1]!.ts > item.ts) at -= 1;
      out.splice(at, 0, item);
    }
    return out;
  }

  /**
   * Convert history entries to ChatItems, reconciling spawn state.
   * Shared by both reset and delta paths.
   */
  private itemsOfWithSpawnReconcile(threadId: string, entries: HistoryEntry[]): ChatItem[] {
    return itemsOf(entries).map(item => {
      if (item.kind !== 'tool' || !isSubAgentTool(item.name, item.args)) return item;
      const live = this.spawnState(threadId, item.id);
      const history = item.spawn;
      // A terminal history state beats a stale live running bit.
      const selected = history && history.status !== 'running' ? history : live ?? history;
      if (selected) {
        this.setSpawnState(threadId, item.id, selected);
        return {
          ...item,
          spawn: selected,
          ...(selected.status === 'running' ? { running: true } : { running: false }),
        };
      }
      return item;
    });
  }

  /**
   * Handles the newest page of a thread via `chat.history` (no `before`).
   * Pagination (older pages with `before`) goes through `prependHistory`.
   */
  seedHistory(threadId: string, entries: HistoryEntry[], activeRun?: boolean): void {
    if (entries.length === 0) return;
    if (activeRun === true) this.activeRuns.add(threadId);
    else if (activeRun === false) this.activeRuns.delete(threadId);
    this.refreshRunning();
    
    // The newest page replaces the thread, same as a sync reset.
    this.resetThread(threadId, entries, activeRun);

    // Same reconciliation as a sync result, after the page is in: a history page opened mid-run
    // must adopt the real run id immediately, or the frames that follow would paint under a
    // second, synthetic run.
    this.reconcileRuns(threadId, entries, activeRun);
    
    // Update sync state from the entries we received.
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      this.setSyncState(threadId, lastEntry.id, null);
    }
    this.emit();
  }

  /**
   * An older page, put in front of what is already there. Ids are checked because a page can
   * overlap the one before it: the newest page is taken from the tail of a session that keeps
   * growing, so a turn that arrived between two requests would otherwise be replayed twice.
   */
  prependHistory(threadId: string, entries: HistoryEntry[]): void {
    if (entries.length === 0) return;
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const known = new Set(existing.map(item => item.id));
    const older = itemsOf(entries).filter(item => !known.has(item.id));
    if (older.length === 0) return;
    this.threads.set(threadId, this.trimToCap(threadId, [...older, ...existing]));
    this.pageCursorFollows(threadId);
    this.emit();
  }

  /**
   * The work a folded row stood for, spliced in where the row was -- docs/run-hydration.md.
   *
   * In place, and not appended: the row holds a position in the thread, and the items belong at
   * that position. Ids already held are dropped, the same way `prependHistory` guards against a
   * page overlapping the one before it -- a second tap while the first answer was in flight would
   * otherwise double the whole group.
   */
  hydrateRun(threadId: string, rowId: string, entries: HistoryEntry[]): void {
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const at = existing.findIndex(item => item.id === rowId);
    const row = at < 0 ? undefined : existing[at];
    if (!row || row.kind !== 'run') return;
    const known = new Set(existing.map(item => item.id));
    known.delete(rowId);
    // `foldOf` names the row these items replace: the group that takes its place reads it as its
    // own key, so the state the reader set on the row survives the swap.
    const items = itemsOf(entries)
      .filter(item => !known.has(item.id))
      .map(item => ({ ...item, foldOf: rowId }));
    if (items.length === 0) {
      // Nothing to show and nothing to blame: the row would sit there claiming work that never
      // arrives, so it says it failed rather than spinning for good.
      this.setRunHydration(threadId, rowId, 'failed');
      return;
    }
    this.threads.set(threadId, [...existing.slice(0, at), ...items, ...existing.slice(at + 1)]);
    // Kept so the trim can put this group back to its row instead of dropping its items.
    const memo = this.hydrated.get(threadId) ?? new Map<string, { row: RunSummaryItem; itemIds: string[] }>();
    memo.set(rowId, { row, itemIds: items.map(item => item.id) });
    this.hydrated.set(threadId, memo);
    // The row may have been the oldest item held: the paging cursor now names the first item it
    // stood for, or scrolling up would ask for a row that no longer exists.
    this.pageCursorFollows(threadId);
    this.emit();
  }

  /**
   * Every ask for a row's work still in flight is forgotten: the socket it left on is gone, and
   * nothing will answer it. A row left `loading` kept its skeleton for good, because the guard
   * against a second ask read the state as "an answer is coming". Back to `idle`, the open group
   * asks again through the path it already has when the link returns.
   */
  dropInflightHydration(): void {
    let changed = false;
    for (const [threadId, items] of this.threads) {
      if (!items.some(item => item.kind === 'run' && item.hydration === 'loading')) continue;
      changed = true;
      this.threads.set(
        threadId,
        items.map(item => (item.kind === 'run' && item.hydration === 'loading' ? { ...item, hydration: 'idle' } : item)),
      );
    }
    if (changed) this.emit();
  }

  /** Where a row is in its round trip: latched before the ask leaves, cleared by the splice. */
  setRunHydration(threadId: string, rowId: string, hydration: RunSummaryItem['hydration']): void {
    const existing = this.threads.get(threadId);
    if (!existing) return;
    const at = existing.findIndex(item => item.id === rowId);
    const row = at < 0 ? undefined : existing[at];
    if (!row || row.kind !== 'run' || row.hydration === hydration) return;
    const next = existing.slice();
    next[at] = { ...row, hydration };
    this.threads.set(threadId, next);
    this.emit();
  }

  addUserMessage(
    threadId: string,
    id: string,
    text: string,
    attachments: AttachmentMeta[] = [],
    location?: LocationData,
  ): void {
    // Born with the wait it is about to have. A compaction rewrites the history this send's run
    // would resume, so the server parks it -- and the thread has to say so on the first frame it
    // draws. Born without the mark, the bubble was ordered as an ordinary message and then jumped
    // under the rule the instant the server's ack landed: the owner saw the message land before
    // the compaction and settle after it (2026-09-20). The mark is the same one `markQueued`
    // would set, so that ack stays the no-op it should be.
    const held = this.compacting.has(threadId);
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'user',
      text,
      attachments,
      streaming: false,
      ...(held ? { queuedSince: Date.now(), queuedReason: 'compaction' as const } : {}),
      ...(location ? { location } : {}),
      ts: Date.now(),
    });
  }

  /**
   * A prompt sent from another window of the same owner. Keyed by the id the sending device
   * generated, so that device recognises its own bubble and does nothing: the echo reaches every
   * socket, and dropping it here is what keeps one message one bubble.
   */
  echoUserMessage(
    threadId: string,
    id: string,
    text: string,
    attachments: AttachmentMeta[] = [],
    location?: LocationData,
  ): void {
    if (this.getItems(threadId).some(item => item.id === id)) return;
    this.addUserMessage(threadId, id, text, attachments, location);
  }

  /**
   * The boundary a compaction just wrote, drawn while the run that caused it is still going.
   *
   * Idempotent on the server's entry id, exactly like `echoUserMessage`: the same cut arrives
   * twice on a device that drew it live and then reloaded the thread, and two rules for one cut
   * is the failure that matters here.
   *
   * `role: 'user'` because that is the role the server keeps the summary in, and `summaryOf` is
   * the field that stops it being drawn as a bubble the owner wrote -- ChatScreen routes to
   * CompactionBoundary on it alone.
   */
  addCompactionBoundary(threadId: string, id: string, summary: string, count: number, archive?: string): void {
    // The compaction that wrote this rule is over, whether or not its end frame made it here.
    this.compacting.delete(threadId);
    if (this.getItems(threadId).some(item => item.id === id)) {
      this.emit();
      return;
    }
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'user',
      text: summary,
      attachments: [],
      streaming: false,
      // Zero would be falsy and the rule would render as a wall of summary in the owner's own
      // voice, which is the one thing CompactionBoundary exists to prevent. The server never
      // sends 0 (a plan with an empty middle is refused), so the clamp keeps the invariant local.
      summaryOf: Math.max(1, count),
      ...(archive ? { archive } : {}),
      ts: Date.now(),
    });
  }

  setLocation(threadId: string, id: string, location: LocationData): void {
    this.patch(threadId, id, { location });
  }

  /**
   * Lands the transcript on the bubble that carried the recording. Ignored when the bubble is
   * gone (thread cleared, app restarted mid-run): the words belong to that turn or to nothing.
   */
  setTranscripts(threadId: string, id: string, items: Array<{ id: string; text: string }>): void {
    const current = this.getItems(threadId).find(item => item.id === id);
    if (!current || current.kind !== 'text') return;
    const transcripts = { ...current.transcripts };
    for (const item of items) transcripts[item.id] = item.text;
    this.patch(threadId, id, { transcripts });
  }

  /**
   * The send never made it out: the socket refused the frame, or it called itself open and no
   * receipt came. The bubble says it is waiting rather than failed.
   *
   * A verdict the owner had to clear by hand read as a message he had lost, and it was wrong: the
   * app retries the same id on its own, so the bubble belongs with the sends that wait their turn.
   * The first failure is what the elapsed time counts from, and a retry does not restart it.
   */
  markUndelivered(threadId: string, id: string): void {
    this.stopWaiting(id);
    const item = this.getItems(threadId).find(entry => entry.id === id);
    if (!item || item.kind !== 'text' || item.queuedReason === 'undelivered') return;
    this.patch(threadId, id, {
      pending: false,
      error: undefined,
      queuedSince: Date.now(),
      queuedReason: 'undelivered',
    });
  }

  /**
   * The send went out on a socket that claimed to be open: wait for the server's receipt. Past
   * `timeoutMs` without one the bubble is marked undelivered, and the owner can send it again
   * under the same id (the server takes a repeated id once). Arming again clears a verdict.
   */
  expectReceipt(threadId: string, id: string, timeoutMs: number): void {
    this.stopWaiting(id);
    const item = this.getItems(threadId).find(entry => entry.id === id);
    if (!item || item.kind !== 'text') return;
    this.patch(threadId, id, { pending: true, error: undefined });
    const timer = setTimeout(() => {
      this.awaitingReceipt.delete(id);
      this.markUndelivered(threadId, id);
    }, timeoutMs);
    this.awaitingReceipt.set(id, timer);
  }

  setServerReceipts(enabled: boolean): void {
    this.receipts = enabled;
  }

  serverReceipts(): boolean {
    return this.receipts;
  }

  /**
   * The server has the send: whatever the socket claimed, this one arrived.
   *
   * A receipt also settles a bubble the app had given up on: the first try may have reached the
   * server after all, and a resend would then land on the same id. There is no timer left to stop
   * in that case, which is why the mark is what this looks at.
   */
  markDelivered(threadId: string, id: string): void {
    const waited = this.stopWaiting(id);
    const item = this.getItems(threadId).find(entry => entry.id === id);
    if (!item || item.kind !== 'text') return;
    if (!waited && item.queuedReason !== 'undelivered') return;
    this.clearQueued(threadId, id, ['undelivered']);
    this.patch(threadId, id, { pending: false, error: undefined });
  }

  private stopWaiting(id: string): boolean {
    const timer = this.awaitingReceipt.get(id);
    if (timer === undefined) return false;
    clearTimeout(timer);
    this.awaitingReceipt.delete(id);
    return true;
  }

  /**
   * A command is taking its time (`/compact` runs for minutes on a full session). The bubble is
   * a placeholder: the result replaces it in place, so the chat never shows both.
   */
  addCommandPending(threadId: string, replyToId: string, text: string): void {
    // The compaction rule already says what this notice would call "Running /compact", and a
    // successful /compact answers with no bubble: a notice drawn now would have nothing to close it.
    if (this.compacting.has(threadId)) return;
    const existing = this.pendingCommands.get(threadId);
    if (existing) this.patch(threadId, existing, { text });
    else {
      const parent = this.getItems(threadId).find(item => item.id === replyToId);
      // The id the answer will keep, and the one the server replays the journalled answer under:
      // derived from the send so the bubble is the same one whether it was placeheld or not.
      const id = `cmd-${replyToId}`;
      this.pendingCommands.set(threadId, id);
      this.append(threadId, {
        kind: 'text',
        id,
        role: 'agent',
        text,
        attachments: [],
        streaming: true,
        command: true,
        ...(this.liveRun(threadId) ? { run: this.liveRun(threadId) } : {}),
        ts: parent ? parent.ts + 1 : Date.now(),
      });
    }
  }

  /**
   * A compaction is running on this thread, or has stopped (`since` absent).
   *
   * Driven by a state frame rather than by the command, so a window that opens or reloads while
   * the summarizer runs learns of it from the replay instead of showing a thread doing nothing.
   * `since` is the server's start instant, so the counter reads the true elapsed on a window that
   * arrives late instead of restarting from zero. The end frame is one way for it to stop; the
   * boundary it wrote, the end of its run, a stream opening and a fresh page are the others, so
   * an end lost with the socket cannot leave the rule up for good.
   *
   * `text` is the summary as it is written, when the server streams one. A replayed frame carries
   * everything written so far; the live ones are fragments the client appends.
   */
  setCompacting(threadId: string, since: number | undefined, text = '', reasoning = ''): void {
    if (since === undefined) {
      const ended = this.compacting.delete(threadId);
      // A compaction was the cycle a stop was aimed at (the one case with no run behind it): its
      // end lifts the mark the same way a run end does, or the next stop would be silenced.
      const lifted = this.liftStops(threadId);
      if (ended || lifted) this.emit();
      return;
    }
    this.compacting.set(threadId, { since, text, reasoning });
    // The notice of the /compact that started it, when it won the race (the server sends it after
    // 400ms, the compaction announces itself once the session log is loaded): one sign of the
    // operation, and a successful /compact answers with no bubble, so nothing would close it.
    this.clearCommandPending(threadId);
    this.emit();
  }

  /**
   * One fragment of the summary being written.
   *
   * A no-op when no compaction is known on the thread: a fragment for an operation the client was
   * never told about would create the rule from a partial state, with no start instant to count
   * from.
   */
  appendCompactionText(threadId: string, text: string): void {
    const current = this.compacting.get(threadId);
    if (!current || !text) return;
    this.compacting.set(threadId, { ...current, text: current.text + text });
    this.emit();
  }

  /** One fragment of the thinking that precedes the summary. Same rule: no rule, no fragment. */
  appendCompactionReasoning(threadId: string, reasoning: string): void {
    const current = this.compacting.get(threadId);
    if (!current || !reasoning) return;
    this.compacting.set(threadId, { ...current, reasoning: current.reasoning + reasoning });
    this.emit();
  }

  /** The compaction running on the thread, if one is. */
  getCompacting(threadId: string): CompactionRun | undefined {
    return this.compacting.get(threadId);
  }

  /**
   * Drops a placeholder that will never be answered: the agent replied instead (a command the
   * server does not know is a question like any other) or the conversation moved on.
   */
  clearCommandPending(threadId: string): void {
    const id = this.pendingCommands.get(threadId);
    if (!id) return;
    this.pendingCommands.delete(threadId);
    this.removeItem(threadId, id);
  }

  /**
   * The server parked this send: a compaction is rewriting the history its run would resume, or a
   *  run is active and the message waits in its mailbox for the next turn boundary. The mark goes
   *  on the bubble the owner already sees rather than on a new one, because nothing new happened,
   *  the message simply has not started yet. */
  markQueued(threadId: string, id: string, reason: 'compaction' | 'injection'): void {
    const item = (this.threads.get(threadId) ?? EMPTY_ITEMS).find(entry => entry.id === id);
    if (!item || item.kind !== 'text' || item.queuedSince) return;
    this.patch(threadId, id, { queuedSince: Date.now(), queuedReason: reason });
  }

  /**
   * The wait is over. Every mark in the thread goes, not one remembered id: a compaction holds
   * *all* the sends typed while it rewrites the history, and a per-thread slot kept only the last
   * of them, so the bubbles before it stayed under a badge nothing was ever going to clear.
   *
   * `only` is what keeps the waits apart, and they are not the same wait at all.
   *
   * A compaction holds the send with nothing on the wire, so any sign of life means it is over:
   * a stream, an answer, the end of a run, all three, so a lost frame cannot strand the mark. An
   * `undelivered` send is never in that list: the run ending says nothing about whether the frame
   * ever reached the server, and only the receipt settles it.
   *
   * An injection waits for the *next turn boundary* of a run that is talking the whole time. The
   * streamer seals a segment and opens another at every reasoning block and after every tool
   * round, so those same signs of life fire repeatedly while the message is still parked in the
   * mailbox. Clearing on them read as accepted a message the run had not yet looked at. Only the
   * ack for that id (fired at the drain) and the end of the run lift it -- the run may also die
   * without ever acking.
   */
  clearQueued(threadId: string, id?: string, only?: readonly QueuedReason[]): void {
    const items = this.threads.get(threadId);
    const matches = (item: ChatItem): item is TextItem =>
      item.kind === 'text' &&
      item.queuedSince !== undefined &&
      (id === undefined || item.id === id) &&
      (only === undefined || (item.queuedReason !== undefined && only.includes(item.queuedReason)));
    if (!items?.some(matches)) return;
    this.threads.set(
      threadId,
      items.map(item => {
        if (!matches(item)) return item;
        const rest = { ...item };
        delete rest.queuedSince;
        delete rest.queuedReason;
        return rest;
      }),
    );
    this.emit();
  }

  /**
   * Output of a command the server executed. Rendered as its own bubble so `/status` never
   * masquerades as an agent answer: the agent is not the author of it.
   */
  addCommandResult(threadId: string, id: string, text: string, replyToId?: string, details?: string): void {
    const pending = this.pendingCommands.get(threadId);
    this.pendingCommands.delete(threadId);
    // In place, keeping the placeholder's position: the answer belongs where the wait was. A
    // placeholder the thread no longer holds (history replaced under it) falls through to a
    // fresh bubble rather than patching an id that is gone, which would drop the answer.
    if (pending && this.getItems(threadId).some(item => item.id === pending)) {
      this.patch(threadId, pending, { text, streaming: false, ...(details ? { details } : {}) });
      return;
    }
    // A duplicated result frame is harmless for tools because their path is upserted, but command
    // results are text items. Treat the derived id as an idempotency key as well.
    const existing = this.getItems(threadId).find(item => item.id === id);
    if (existing?.kind === 'text' && existing.command) {
      this.patch(threadId, id, { text, streaming: false, ...(details ? { details } : {}) });
      return;
    }
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'agent',
      text,
      attachments: [],
      streaming: false,
      command: true,
      ...(details ? { details } : {}),
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  /** A run is streaming into this thread right now (drives the Stop button). */
  isStreaming(threadId: string): boolean {
    return this.getItems(threadId).some(item => item.kind === 'text' && item.streaming);
  }

  startStream(threadId: string, id: string, replyToId?: string): void {
    if (this.streams.has(id)) return;
    // The summarizer never streams, so an answer opening on the thread means the compaction that
    // was holding the run is behind us, whatever became of its end frame.
    this.compacting.delete(threadId);
    this.streams.set(id, '');
    this.lastStream.set(threadId, id);
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'agent',
      text: '',
      attachments: [],
      streaming: true,
      run: this.runForLiveItem(threadId),
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  /**
   * One more chunk of a bubble, or -- on a replay -- the whole bubble at once.
   *
   * `replay` is what a `session.sync` sends for a turn still in flight, and it has to replace:
   * the window asking for the sync is usually the one that was already watching, so appending
   * the turn to itself is how the answer ended up on screen twice after any blip.
   */
  appendDelta(threadId: string, id: string, text: string, replay = false): void {
    const current = this.streams.get(id);
    if (current === undefined) return;
    // The first token of the answer is what ends the thinking: past it the counter has to hold a
    // number instead of climbing, or it would keep counting the writing as thinking.
    this.sealReasoning(threadId, id);
    this.endWaiting(threadId, id);
    const next = replay ? text : current + text;
    this.streams.set(id, next);
    this.patch(threadId, id, { text: next }, true);
  }

  /**
   * Reasoning accumulates on the bubble it belongs to. Keyed off `streams` like the text is, so a
   * frame arriving for a closed bubble is dropped instead of resurrecting it.
   */
  appendReasoning(threadId: string, id: string, text: string, replay = false, since?: string): void {
    if (!this.streams.has(id)) return;
    // Unthrottled, unlike the body below: this is what puts the counter on screen, and it must
    // not wait for the next batched delta to appear.
    this.openReasoningSpan(threadId, id, since);
    this.endWaiting(threadId, id);
    const current = this.reasoning.get(id) ?? '';
    const next = replay ? text : current + text;
    this.reasoning.set(id, next);
    this.patch(threadId, id, { reasoning: next }, true);
  }

  /**
   * The bubble `id` was opened by a model call that has produced nothing yet: it draws the wait
   * until the first thing the turn writes into it. A frame for a closed bubble is dropped, like
   * every other frame of a stream, and the same instant twice does not redraw it.
   */
  markWaiting(threadId: string, id: string, since: number): void {
    if (!this.streams.has(id) || !Number.isFinite(since)) return;
    const item = this.getItems(threadId).find(entry => entry.id === id);
    if (item?.kind !== 'text' || item.waitingSince === since) return;
    this.patch(threadId, id, { waitingSince: since });
  }

  /** The turn wrote something into the bubble: the wait is over. Costs nothing once it is. */
  private endWaiting(threadId: string, id: string): void {
    const item = this.getItems(threadId).find(entry => entry.id === id);
    if (item?.kind === 'text' && item.waitingSince !== undefined) this.patch(threadId, id, { waitingSince: undefined });
  }

  /** Latest estimate from a redacted engine; the server sends a running total, so it replaces. */
  setReasoningTokens(threadId: string, id: string, tokens: number, since?: string): void {
    if (!this.streams.has(id)) return;
    this.openReasoningSpan(threadId, id, since);
    this.endWaiting(threadId, id);
    this.patch(threadId, id, { reasoningTokens: tokens });
  }

  /**
   * When this thinking phase began: the server's instant when the frame carries one, the local
   * clock otherwise.
   *
   * The server dates the frame that opens a phase (`since`), which is the only way a window that
   * reloads mid-thought can resume the counter rather than start a new one from its own arrival --
   * and the replayed frame carries that same instant. A server that predates the field sends none,
   * and so does every frame inside an open phase, which is why the local start is kept then: it is
   * the one already running.
   *
   * An unparseable instant is treated as absent rather than written: `NaN` on the item would draw
   * a counter of `NaN` for as long as the bubble lives.
   */
  private openReasoningSpan(threadId: string, id: string, since?: string): void {
    const reported = since === undefined ? undefined : Date.parse(since);
    const startedAt =
      reported !== undefined && Number.isFinite(reported)
        ? reported
        : this.reasoningStart.has(id)
          ? undefined
          : Date.now();
    if (startedAt === undefined || this.reasoningStart.get(id) === startedAt) return;
    this.reasoningStart.set(id, startedAt);
    this.patch(threadId, id, { reasoningStartedAt: startedAt });
  }

  /**
   * Turns the running span into a fixed duration on the item. Idempotent: it is called on every
   * text delta and returns at once when there is nothing open to seal.
   */
  private sealReasoning(threadId: string, id: string): void {
    const startedAt = this.reasoningStart.get(id);
    if (startedAt === undefined) return;
    this.reasoningStart.delete(id);
    const span = Date.now() - startedAt;
    // A span that does not measure as positive is not a span: it is the same tick, or a device
    // running ahead of the server whose instant opened it. The server applies the same rule to the
    // duration it stores, so a thought too short to time reads the same live and replayed.
    if (span > 0) this.patch(threadId, id, { reasoningMs: span });
  }

  endStream(threadId: string, id: string): void {
    if (!this.streams.has(id)) return;
    // A bubble that thought and then said nothing still has a duration to show.
    this.sealReasoning(threadId, id);
    const finalText = this.streams.get(id) ?? '';
    const thought = this.reasoning.get(id) ?? '';
    this.streams.delete(id);
    this.reasoning.delete(id);
    this.reasoningStart.delete(id);
    // A bubble carrying only reasoning is not empty: it explains a tool call that produced no
    // prose, which is exactly what the owner asked to be able to read.
    if (!finalText.trim() && !thought.trim() && !this.hasReasoningTokens(threadId, id)) {
      this.removeItem(threadId, id);
      return;
    }
    this.patch(threadId, id, { text: finalText, streaming: false });
  }

  private hasReasoningTokens(threadId: string, id: string): boolean {
    const item = this.getItems(threadId).find(entry => entry.id === id);
    return item?.kind === 'text' && (item.reasoningTokens ?? 0) > 0;
  }

  abortStream(threadId: string, id: string, error?: string): void {
    if (!this.streams.has(id)) {
      // A bubble is invented here, and only for a run that died before its first token: the error
      // has nowhere else to go, and a thread that ends on nothing explains nothing. With no error
      // there is nothing to invent it for -- a stop settles bubbles it never opened (one streamer
      // per message folded into the run), and each of those used to leave an empty bubble behind.
      if (!error) return;
      this.append(threadId, {
        kind: 'text',
        id,
        role: 'agent',
        text: '',
        attachments: [],
        streaming: false,
        error,
        ts: Date.now(),
      });
      return;
    }
    this.streams.delete(id);
    this.reasoning.delete(id);
    // An interrupted turn keeps whatever thinking it had done: seal before dropping the start,
    // or a stopped run loses the duration it had already earned.
    this.sealReasoning(threadId, id);
    this.reasoningStart.delete(id);
    // A bubble opened for a wait and stopped before it said anything is not a message: with no
    // error to carry it would be left behind as an empty bubble.
    const item = this.getItems(threadId).find(entry => entry.id === id);
    const empty = item?.kind === 'text' && !item.text.trim() && !item.reasoning?.trim() && !(item.reasoningTokens ?? 0);
    if (empty && !error) {
      this.removeItem(threadId, id);
      return;
    }
    this.patch(threadId, id, { streaming: false, error, waitingSince: undefined });
  }

  addAgentMessage(
    threadId: string,
    id: string,
    text: string,
    attachments: AttachmentMeta[],
    replyToId?: string,
    notice?: boolean,
  ): void {
    // The server streams the answer, then delivers the media as a message of its own with no
    // text. As its own bubble, the image would sit apart from the words that go with it;
    // it belongs under the text that was just streamed.
    if (!text.trim() && attachments.length > 0) {
      const streamId = this.lastStream.get(threadId);
      if (streamId && this.getItems(threadId).some(item => item.kind === 'text' && item.id === streamId)) {
        this.patch(threadId, streamId, { attachments });
        return;
      }
    }
    const parent = replyToId ? this.getItems(threadId).find(item => item.id === replyToId) : undefined;
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'agent',
      text,
      attachments,
      streaming: false,
      ...(notice ? { notice: true } : {}),
      ...(this.liveRun(threadId) ? { run: this.liveRun(threadId) } : {}),
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  addToolCall(threadId: string, input: ToolCallPayload): void {
    // Normalised at the door, once, rather than defended against in every card that reads it.
    // `parseServerFrame` only validates the frame's `type`, so a tool frame that arrived without
    // its args or its output is a shape the whole render path below would have to survive.
    const payload: ToolCallPayload = {
      ...input,
      args: input.args && typeof input.args === 'object' ? input.args : {},
      ...(input.output === undefined || input.output === null ? {} : { output: String(input.output) }),
    };
    // Upsert: a `chat.tool.start` may have opened this card already. The end frame reuses the
    // same id, so we patch it in place (fill output, drop the spinner) instead of stacking a
    // second card.
    const existing = this.getItems(threadId).find(item => item.id === payload.id);
    if (existing?.kind === 'tool') {
      const terminalSpawn = existing.spawn && existing.spawn.status !== 'running' ? existing.spawn : undefined;
      this.patchTool(threadId, payload.id, {
        ...payload,
        ...(terminalSpawn ? { spawn: terminalSpawn } : {}),
        running: false,
        // A settled call from the server beats anything the client wrote on the card when the run
        // ended without one: output, duration and outcome are the server's, so the local
        // "interrupted" mark goes with them. Left set, the card the history brings back complete
        // would still read interrupted, with a duration this device measured.
        interrupted: false,
      });
      return;
    }
    this.append(threadId, { kind: 'tool', ...payload, running: false, run: this.runForLiveItem(threadId), ts: Date.now() });
  }

  /** A tool started executing: open the card with a spinner and empty output, pending the
   *  matching `chat.tool` frame that fills it. */
  startToolCall(threadId: string, id: string, name: string, rawArgs: Record<string, unknown>): void {
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    if (this.findIndex(threadId, id) >= 0) return;
    this.append(threadId, {
      kind: 'tool',
      id,
      name,
      args,
      output: '',
      ok: false,
      truncated: false,
      running: true,
      run: this.runForLiveItem(threadId),
      ts: Date.now(),
    });
  }

  /** Live output from a running tool (bash): append the chunk to the card the start frame opened.
   *  Coalesced so a fast command does not re-render on every byte. The `chat.tool` frame settles
   *  it and replaces the streamed text with the final output. */
  appendToolOutput(threadId: string, id: string, chunk: { stdout?: string; stderr?: string; clipped?: boolean; replay?: boolean }): void {
    const item = (this.threads.get(threadId) ?? EMPTY_ITEMS).find(entry => entry.id === id && entry.kind === 'tool') as ToolItem | undefined;
    if (!item || (!item.running && !(isSubAgentTool(item.name, item.args) && item.spawn && item.spawn.status !== 'running'))) return;
    const base = chunk.replay ? '' : item.output;
    const append = (base ? (base.endsWith('\n') ? '' : '\n') : '') +
      (chunk.stdout ?? '') +
      (chunk.stderr ? `${chunk.stdout ? '\n' : ''}STDERR: ${chunk.stderr}` : '');
    // `clipped` only ever arrives on a replay: the head of this output was dropped by the
    // server's live turn journal, so the card says truncated and offers the round-trip that
    // fetches the whole thing once the call settles.
    //
    // `replay` carries the card's whole output rather than a chunk, and replaces for the same
    // reason the bubbles do: the card was already on screen when the sync was asked for.
    this.patchTool(threadId, id, { output: base + append, ...(chunk.clipped ? { truncated: true } : {}) }, true);
  }

  /**
   * Replaces a card's clipped output with the whole thing, in answer to `chat.tool.full`.
   *
   * `truncated` is cleared with it: the flag is what offers the round-trip, and leaving it set
   * would offer it again on text that is already complete.
   */
  setToolOutput(threadId: string, id: string, output: string): void {
    const item = (this.threads.get(threadId) ?? EMPTY_ITEMS).find(entry => entry.id === id && entry.kind === 'tool') as ToolItem | undefined;
    if (!item) return;
    this.patchTool(threadId, id, { output, truncated: false });
  }

  clearThread(threadId: string): void {
    this.threads.delete(threadId);
    this.hydrated.delete(threadId);
    this.compacting.delete(threadId);
    this.spawnCards.delete(threadId);
    this.spawnStatus.delete(threadId);
    this.syncState.delete(threadId);
    this.activeRuns.delete(threadId);
    this.refreshRunning();
    this.openRuns.delete(threadId);
    this.liftStops(threadId);
    this.lastStream.delete(threadId);
    this.pendingCommands.delete(threadId);
    if (this.unread.delete(threadId)) this.refreshUnread();
    this.emit();
  }

  clearAll(): void {
    this.threads.clear();
    this.hydrated.clear();
    this.compacting.clear();
    // Paging state belongs to the threads that just went: a cursor left behind names an item no
    // thread holds any more, and a stale `trimAllowed` decides for the next reader whether their
    // oldest messages may be dropped.
    this.pages.clear();
    this.trimAllowed.clear();
    this.spawnCards.clear();
    this.spawnStatus.clear();
    this.syncState.clear();
    this.streams.clear();
    this.reasoning.clear();
    this.reasoningStart.clear();
    this.lastStream.clear();
    this.activeRuns.clear();
    this.runningSnapshot = EMPTY_THREADS;
    this.openRuns.clear();
    this.stopping.clear();
    this.serverStopping.clear();
    this.pendingCommands.clear();
    this.unread.clear();
    this.unreadSnapshot = EMPTY_THREADS;
    this.emit();
  }

  private refreshUnread(): void {
    this.unreadSnapshot = this.unread.size === 0 ? EMPTY_THREADS : [...this.unread];
    this.emit();
  }

  /** Rebuilt at every write, like the unread snapshot: a list compares these by identity. */
  private refreshRunning(): void {
    this.runningSnapshot = this.activeRuns.size === 0 ? EMPTY_THREADS : [...this.activeRuns];
  }

  /**
   * Where a new item goes when the owner has already typed the next message.
   *
   * A parked send sits at the end of the thread under its badge, and everything the server emits
   * meanwhile belongs to the turn *before* it: the run it interrupted is still calling tools. In
   * arrival order those cards landed under a message that had not started, which reads as the
   * message having been sent mid-run, and it cut the run's own cards into two groups around it.
   *
   * So a parked send holds the bottom until it drains. Only that trailing block of parked bubbles
   * is stepped over, never a bubble already under way -- and never by the owner's own next
   * message, which is by definition the newest thing in the thread.
   */
  private insertionIndex(items: readonly ChatItem[], incoming: ChatItem): number {
    // A compaction boundary is stored under `role: 'user'` (the role the prompt needs the summary
    // in), but it is not something the owner sent: it belongs to the run that is still going, like
    // that run's own cards, so it must not step over a send parked behind it.
    const ownMessage = incoming.kind === 'text' && incoming.role === 'user' && incoming.summaryOf === undefined;
    if (ownMessage) return items.length;
    let index = items.length;
    while (index > 0) {
      const previous = items[index - 1];
      if (previous?.kind !== 'text' || previous.queuedSince === undefined) break;
      index -= 1;
    }
    return index;
  }

  private append(threadId: string, item: ChatItem): void {
    const items = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const at = this.insertionIndex(items, item);
    const next = at === items.length ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
    // The live path is the one that grows without ever asking the server for anything: a long run
    // streams bubbles and cards in for hours, and the sync deltas that used to be the only trim
    // point never come while the socket stays up. Cheap when there is nothing to do -- it is a
    // length test -- and it is what makes a conversation left open all day clean itself.
    const trimmed = this.trimToCap(threadId, next);
    this.threads.set(threadId, trimmed);
    if (trimmed.length !== items.length + 1) this.pageCursorFollows(threadId);
    this.emit();
  }

  private patch(threadId: string, id: string, patch: Partial<TextItem>, coalesce = false): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    this.threads.set(
      threadId,
      items.map(item => (item.id === id && item.kind === 'text' ? { ...item, ...patch } : item)),
    );
    if (coalesce) this.emitSoon();
    else this.emit();
  }

  private patchTool(threadId: string, id: string, patch: Partial<ToolItem>, coalesce = false): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    this.threads.set(
      threadId,
      items.map(item => (item.id === id && item.kind === 'tool' ? { ...item, ...patch } : item)),
    );
    if (coalesce) this.emitSoon();
    else this.emit();
  }

  private findIndex(threadId: string, id: string): number {
    const items = this.threads.get(threadId) ?? EMPTY_ITEMS;
    return items.findIndex(item => item.id === id);
  }

  private removeItem(threadId: string, id: string): void {
    const items = this.threads.get(threadId);
    if (!items) return;
    this.threads.set(
      threadId,
      items.filter(item => item.id !== id),
    );
    this.emit();
  }

  /**
   * Drops one bubble outright (a quiet command's optimistic input). Public because the router
   * decides it from the result frame, not the send: the input was never shown on any surface.
   */
  dropBubble(threadId: string, id: string): void {
    this.removeItem(threadId, id);
  }

  /**
   * A token is not a frame.
   *
   * A fast model delivers hundreds of deltas a second, and each one used to notify every reader
   * at once: the whole shell re-rendered, the thread was walked four times over, and the markdown
   * of the growing bubble was parsed again from the start. The typing went choppy on a long
   * answer for no gain, since a screen cannot show more than one state per frame anyway.
   *
   * The state is written immediately either way. Only the notification waits, and any other
   * mutation flushes it, so nothing can be read stale or out of order.
   */
  private emitSoon(): void {
    if (this.frame !== null) return;
    this.frame = setTimeout(() => {
      this.frame = null;
      this.emit();
    }, FRAME_MS);
  }

  private emit(): void {
    if (this.frame !== null) {
      clearTimeout(this.frame);
      this.frame = null;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const chatStore = new ChatStoreImpl();

const subscribeToChat = (listener: Listener): (() => void) => chatStore.subscribe(listener);

export function useChatItems(threadId: string | null): ChatItem[] {
  const snapshot = useCallback(() => (threadId ? chatStore.getItems(threadId) : EMPTY_ITEMS), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

/**
 * How many rows the conversation has, for a reader that only needs the count.
 *
 * A growing bubble does not change it, so a shell subscribed to this bails out on every frame of
 * a stream instead of re-rendering, which is the whole point of not handing it the list.
 */
export function useChatItemCount(threadId: string | null): number {
  const snapshot = useCallback(() => (threadId ? chatStore.getItems(threadId).length : 0), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

/**
 * The sends still waiting to get out, as a key that changes only when the set does.
 *
 * The retry loop lives in the shell, and a shell handed the items re-renders for every streamed
 * token. What it watches is this key; the store's own list is read inside the loop, at the moment
 * it is time to try, so nothing needs to be captured (2026-09-16).
 */
export function useWaitingSendsKey(threadId: string | null): string {
  const snapshot = useCallback(() => {
    if (!threadId) return '';
    return chatStore
      .getItems(threadId)
      .filter((item): item is TextItem => item.kind === 'text' && item.queuedReason === 'undelivered')
      .map(item => `${item.id}:${item.queuedSince ?? 0}`)
      .join(',');
  }, [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

/** The `spawn` cards of a conversation, same identity as long as none of them changed. */
export function useSpawnCards(threadId: string | null): SpawnCard[] {
  const snapshot = useCallback(() => (threadId ? chatStore.spawnCardsOf(threadId) : EMPTY_SPAWN_CARDS), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

export function useHistoryPage(threadId: string | null): HistoryPage {
  const snapshot = useCallback(() => (threadId ? chatStore.getPage(threadId) : NO_PAGE), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

export function useActiveRun(threadId: string | null): boolean {
  const snapshot = useCallback(() => (threadId ? chatStore.hasActiveRun(threadId) : false), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

/** A stop is in flight on the thread: the session menu entry reads "Stopping…" instead of "Stop". */
export function useStopping(threadId: string | null): boolean {
  const snapshot = useCallback(() => (threadId ? chatStore.isStopping(threadId) : false), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

/** When the compaction running on the thread started (server time), or undefined when none is. */
export function useCompacting(threadId: string | null): CompactionRun | undefined {
  const snapshot = useCallback(() => (threadId ? chatStore.getCompacting(threadId) : undefined), [threadId]);
  return useSyncExternalStore(subscribeToChat, snapshot);
}

export function useUnreadThreads(): string[] {
  return useSyncExternalStore(subscribeToChat, () => chatStore.getUnreadThreads());
}

export function useRunningThreads(): string[] {
  return useSyncExternalStore(subscribeToChat, () => chatStore.getRunningThreads());
}
