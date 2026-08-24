import { useCallback, useSyncExternalStore } from 'react';
import type { AttachmentMeta, HistoryEntry, LocationData, SpawnLifecycleState, SubAgentEntry, ToolCallPayload } from './protocol';
import { agentOfCard, indexRoster } from './subagents';

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
  queuedReason?: 'compaction' | 'injection';
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
  ts: number;
}

export interface ToolItem extends ToolCallPayload {
  kind: 'tool';
  ts: number;
}

export type ChatItem = TextItem | ToolItem;

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
  return entry.role === 'tool' ? '' : entry.text;
}

/**
 * How far back a thread has been read. `loading` is held here rather than in the screen so a
 * remount mid-request cannot fire a second one for the same page.
 */
export interface HistoryPage {
  nextBefore: number;
  hasMore: boolean;
  loading: boolean;
}

const NO_PAGE: HistoryPage = { nextBefore: 0, hasMore: false, loading: false };
Object.freeze(NO_PAGE);

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
      ...(entry.command ? { command: true } : {}),
      ...(entry.details ? { details: entry.details } : {}),
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.summaryOf ? { summaryOf: entry.summaryOf } : {}),
      ts,
    };
  });
}

/**
 * How long a sent bubble the page does not carry is taken to be a turn still on its way in. Long
 * enough for preprocessing, gates and a prompt build; short enough that a bubble the server is
 * never going to mirror does not outlive the screen it was typed on.
 */
const UNMIRRORED_SEND_WINDOW_MS = 30_000;

class ChatStoreImpl {
  private threads = new Map<string, ChatItem[]>();
  private streams = new Map<string, string>();
  /** Accumulated reasoning per open bubble, the counterpart of `streams` for the text. */
  private reasoning = new Map<string, string>();
  /** The id of the bubble a thread's answer is streaming into; the media delivery that ends
   *  the answer lands on it instead of opening a second bubble. */
  private lastStream = new Map<string, string>();
  /** Threads with a run in flight on the server: drives the Stop button across the whole run. */
  private activeRuns = new Set<string>();
  /** Placeholder bubble per thread while a slow command runs, keyed by thread -> bubble id. */
  private pendingCommands = new Map<string, string>();
  private unread = new Set<string>();
  private unreadSnapshot: string[] = EMPTY_THREADS;
  /** Where the next older page starts, per thread, and whether there is one at all. */
  private pages = new Map<string, HistoryPage>();
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
      (item): item is ToolItem => item.kind === 'tool' && item.name === 'spawn',
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
        name: 'spawn',
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
  startSpawn(threadId: string, cardId: string, info: { subagentId: string; displayName: string; type: string; mode: string }): void {
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
      ? { ...current, displayName: info.displayName, agentType: info.type, mode: info.mode }
      : {
          subagentId: info.subagentId,
          displayName: info.displayName,
          agentType: info.type,
          mode: info.mode,
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
      if (item.kind !== 'tool' || item.name !== 'spawn' || !item.running) continue;
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
        });
      }
    }
  }

  /** Settles a spawn card with a final status. Kept so a finished card still shows what happened. */
  settleSpawn(threadId: string, cardId: string, outcome: { subagentId?: string; status: 'complete' | 'error' | 'aborted'; resultLength?: number; error?: string }): void {
    const current = this.spawnState(threadId, cardId);
    const tool = this.getItems(threadId).find(item => item.id === cardId);
    const runningTool = tool?.kind === 'tool' && tool.name === 'spawn' && tool.running;
    const fallbackName = tool?.kind === 'tool' && typeof tool.args.name === 'string' ? tool.args.name : outcome.subagentId ?? cardId;
    const next: SpawnLifecycleState | undefined = current ?? (outcome.subagentId ? {
      subagentId: outcome.subagentId,
      displayName: fallbackName,
      agentType: tool?.kind === 'tool' && typeof tool.args.type === 'string' ? tool.args.type : 'unknown',
      mode: tool?.kind === 'tool' && typeof tool.args.mode === 'string' ? tool.args.mode : 'run',
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

  getPage(threadId: string): HistoryPage {
    return this.pages.get(threadId) ?? NO_PAGE;
  }

  /** Records where the newest page left off, so scrolling up knows what to ask for. */
  setPage(threadId: string, page: { nextBefore: number; hasMore: boolean }): void {
    this.pages.set(threadId, { ...page, loading: false });
    this.emit();
  }

  /** Latched before the request leaves, cleared when its page lands or the send fails. */
  setPageLoading(threadId: string, loading: boolean): void {
    const current = this.pages.get(threadId) ?? NO_PAGE;
    if (current.loading === loading) return;
    this.pages.set(threadId, { ...current, loading });
    this.emit();
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

  startRun(threadId: string): void {
    if (this.activeRuns.has(threadId)) return;
    this.activeRuns.add(threadId);
    this.emit();
  }

  endRun(threadId: string): void {
    if (!this.activeRuns.delete(threadId)) return;
    this.emit();
  }

  /**
   * Syncs the run flags with the server's own view (session list). Replaces, not merges: a
   * run the server no longer lists is over, even if its end frame was lost to a disconnect.
   */
  seedRuns(threadIds: string[]): void {
    const next = new Set(threadIds);
    if (next.size === this.activeRuns.size && [...next].every(id => this.activeRuns.has(id))) return;
    this.activeRuns = next;
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
   * Server history replaces what is on screen: a bubble rendered by an older build must not
   * survive a reopen. Local items win only while a run streams into the thread, or when the
   * server has nothing yet (turn not persisted).
   *
   * The server's page becomes the thread, plus whatever the page cannot know yet.
   *
   * The page is built from the live session, not from the file, so it already carries the run in
   * flight: its question, its finished bubbles, its tool cards. Refusing it while a run was active
   * (what this did before) meant a device that reloaded mid-run had only the frames broadcast since
   * it connected -- an answer streaming under no question, until the run ended and a later page was
   * finally accepted.
   *
   * Three things are genuinely local: the bubble still being written (never mirrored, so no page
   * can hold it), a send the server is holding behind a compaction (flagged, and the hold lasts
   * minutes) and a send delivered so recently that its turn has not been pushed yet. Everything
   * else defers to the page.
   *
   * The match is by id, which is why the server replays a mirrored user turn under the device's own
   * `chat.send` id and a command answer under `cmd-<send id>`: same bubble, same id, nothing
   * doubled. Cards, command answers, notices and errors are page-owned outright.
   *
   * The window is what keeps a bubble the server will never mirror (a `/status` typed at some
   * point, a message that never left) from sitting at the end of the thread for good. Local clock
   * on both sides of the subtraction, so there is no skew to reason about.
   */
  seedHistory(threadId: string, entries: HistoryEntry[]): void {
    if (entries.length === 0) return;
    const existing = this.threads.get(threadId) ?? EMPTY_ITEMS;
    const base = itemsOf(entries).map(item => {
      if (item.kind !== 'tool' || item.name !== 'spawn') return item;
      const live = this.spawnState(threadId, item.id);
      const history = item.spawn;
      // A fresh server snapshot is authoritative after a reload. In particular, a terminal
      // history state must beat a stale live `running` bit from the previous socket.
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
    const known = new Set(base.map(item => item.id));
    const now = Date.now();
    const carried = existing.filter(item => {
      if (item.kind !== 'text' || known.has(item.id)) return false;
      if (item.command || item.notice || item.error) return false;
      if (item.streaming) return true;
      return item.role === 'user' && (item.queuedSince !== undefined || now - item.ts < UNMIRRORED_SEND_WINDOW_MS);
    });
    this.threads.set(threadId, [...base, ...carried]);
    this.spawnCards.delete(threadId);
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
    this.threads.set(threadId, [...older, ...existing]);
    this.emit();
  }

  addUserMessage(
    threadId: string,
    id: string,
    text: string,
    attachments: AttachmentMeta[] = [],
    location?: LocationData,
  ): void {
    this.append(threadId, {
      kind: 'text',
      id,
      role: 'user',
      text,
      attachments,
      streaming: false,
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

  /** The native outbox could neither send nor queue the frame: say so on the bubble. */
  markSendFailed(threadId: string, id: string, error = 'not sent'): void {
    this.patch(threadId, id, { error });
  }

  /**
   * A command is taking its time (`/compact` runs for minutes on a full session). The bubble is
   * a placeholder: the result replaces it in place, so the chat never shows both.
   */
  addCommandPending(threadId: string, replyToId: string, text: string): void {
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
        ts: parent ? parent.ts + 1 : Date.now(),
      });
    }
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
   * The wait is over, whatever ended it: the run streams, answers, or dies. Called on all three
   * rather than on a dedicated frame, so a lost one cannot strand the mark on the bubble.
   *
   * Every mark in the thread goes, not one remembered id: a compaction holds *all* the sends
   * typed while it rewrites the history, and a per-thread slot kept only the last of them, so
   * the bubbles before it stayed under a badge nothing was ever going to clear.
   */
  clearQueued(threadId: string, id?: string): void {
    const items = this.threads.get(threadId);
    const matches = (item: ChatItem): item is TextItem =>
      item.kind === 'text' && item.queuedSince !== undefined && (id === undefined || item.id === id);
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
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  appendDelta(threadId: string, id: string, text: string): void {
    const current = this.streams.get(id);
    if (current === undefined) return;
    this.streams.set(id, current + text);
    this.patch(threadId, id, { text: current + text }, true);
  }

  /**
   * Reasoning accumulates on the bubble it belongs to. Keyed off `streams` like the text is, so a
   * frame arriving for a closed bubble is dropped instead of resurrecting it.
   */
  appendReasoning(threadId: string, id: string, text: string): void {
    if (!this.streams.has(id)) return;
    const current = this.reasoning.get(id) ?? '';
    const next = current + text;
    this.reasoning.set(id, next);
    this.patch(threadId, id, { reasoning: next }, true);
  }

  /** Latest estimate from a redacted engine; the server sends a running total, so it replaces. */
  setReasoningTokens(threadId: string, id: string, tokens: number): void {
    if (!this.streams.has(id)) return;
    this.patch(threadId, id, { reasoningTokens: tokens });
  }

  endStream(threadId: string, id: string): void {
    if (!this.streams.has(id)) return;
    const finalText = this.streams.get(id) ?? '';
    const thought = this.reasoning.get(id) ?? '';
    this.streams.delete(id);
    this.reasoning.delete(id);
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
      this.append(threadId, {
        kind: 'text',
        id,
        role: 'agent',
        text: '',
        attachments: [],
        streaming: false,
        error: error ?? 'interrupted',
        ts: Date.now(),
      });
      return;
    }
    this.streams.delete(id);
    this.reasoning.delete(id);
    this.patch(threadId, id, { streaming: false, error });
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
      ts: parent ? parent.ts + 1 : Date.now(),
    });
  }

  addToolCall(threadId: string, payload: ToolCallPayload): void {
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
      });
      return;
    }
    this.append(threadId, { kind: 'tool', ...payload, running: false, ts: Date.now() });
  }

  /** A tool started executing: open the card with a spinner and empty output, pending the
   *  matching `chat.tool` frame that fills it. */
  startToolCall(threadId: string, id: string, name: string, args: Record<string, unknown>): void {
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
      ts: Date.now(),
    });
  }

  /** Live output from a running tool (bash): append the chunk to the card the start frame opened.
   *  Coalesced so a fast command does not re-render on every byte. The `chat.tool` frame settles
   *  it and replaces the streamed text with the final output. */
  appendToolOutput(threadId: string, id: string, chunk: { stdout?: string; stderr?: string }): void {
    const item = (this.threads.get(threadId) ?? EMPTY_ITEMS).find(entry => entry.id === id && entry.kind === 'tool') as ToolItem | undefined;
    if (!item || (!item.running && !(item.name === 'spawn' && item.spawn && item.spawn.status !== 'running'))) return;
    const append = (item.output ? (item.output.endsWith('\n') || item.output === '' ? '' : '\n') : '') +
      (chunk.stdout ?? '') +
      (chunk.stderr ? `${chunk.stdout ? '\n' : ''}STDERR: ${chunk.stderr}` : '');
    this.patchTool(threadId, id, { output: item.output + append }, true);
  }

  clearThread(threadId: string): void {
    this.threads.delete(threadId);
    this.spawnCards.delete(threadId);
    this.spawnStatus.delete(threadId);
    this.activeRuns.delete(threadId);
    this.lastStream.delete(threadId);
    this.pendingCommands.delete(threadId);
    if (this.unread.delete(threadId)) this.refreshUnread();
    this.emit();
  }

  clearAll(): void {
    this.threads.clear();
    this.spawnCards.clear();
    this.spawnStatus.clear();
    this.streams.clear();
    this.reasoning.clear();
    this.lastStream.clear();
    this.activeRuns.clear();
    this.pendingCommands.clear();
    this.unread.clear();
    this.unreadSnapshot = EMPTY_THREADS;
    this.emit();
  }

  private refreshUnread(): void {
    this.unreadSnapshot = this.unread.size === 0 ? EMPTY_THREADS : [...this.unread];
    this.emit();
  }

  private append(threadId: string, item: ChatItem): void {
    const items = this.threads.get(threadId) ?? EMPTY_ITEMS;
    this.threads.set(threadId, [...items, item]);
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

export function useUnreadThreads(): string[] {
  return useSyncExternalStore(subscribeToChat, () => chatStore.getUnreadThreads());
}
