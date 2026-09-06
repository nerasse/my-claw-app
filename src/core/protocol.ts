export type LocationAddressLevel = 'building' | 'street' | 'locality' | 'city' | 'country';

export interface LocationAddress {
  formatted: string;
  level: LocationAddressLevel;
  provider: 'geoapify';
  street?: string;
  houseNumber?: string;
  city?: string;
  postcode?: string;
  country?: string;
  confidence?: number;
  /** Rewritten by the owner before sending: display text, never a provider claim. */
  edited?: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  altitudeMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
  address?: LocationAddress;
}

export type LocationInput = Omit<LocationData, 'address'> & {
  /**
   * Owner decision about the display address, sent with chat.send: an empty string means
   * "coordinates only", a non-empty string is shown as-is and flagged edited. Absent means the
   * server derives the address from the provider.
   */
  addressOverride?: { formatted: string };
};

export interface AttachmentMeta {
  id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  mimeType?: string;
  filename?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  audioAsVoice?: boolean;
  /** Local file preview for attachments that have not left the phone yet. */
  uri?: string;
  /** Replayed turn whose file was deleted since: named, but there is nothing to open. */
  deleted?: boolean;
}

export interface AttachmentRef {
  id: string;
  type: AttachmentMeta['type'];
}

export interface ChatSendPayload {
  type: 'chat.send';
  id: string;
  text: string;
  threadId: string;
  attachments?: AttachmentRef[];
  location?: LocationInput;
}

export interface ChatMessageFrame {
  type: 'chat.message';
  id: string;
  text: string;
  threadId: string;
  attachments: AttachmentMeta[];
  replyToId?: string;
  ts?: string;
  /** Correlation id of the run that produced this reply: quote it to pull its logs. */
  run?: string;
  /**
   * A statement of the system, not a reply from the agent: a model fallback, a warning about a
   * failed voice take. Drawn apart, because a warning wearing the agent's clothes reads as content.
   */
  notice?: boolean;
}

export interface LocationCapabilitiesFrame {
  type: 'location.capabilities';
  enabled: boolean;
  address: boolean;
  provider: 'geoapify';
}

/** Server-confirmed location for the optimistic user bubble identified by `replyToId`. */
export interface ChatLocationFrame {
  type: 'chat.location';
  threadId: string;
  replyToId: string;
  location: LocationData;
}

/** Geocoded preview for a staged location: nothing is persisted. */
export interface LocationPreviewResultFrame {
  type: 'location.preview.result';
  id: string;
  location: LocationData;
}

/** A run started answering on a thread: the Stop button stays until the matching end. */
export interface RunStartFrame {
  type: 'chat.run.start';
  threadId: string;
  run?: string;
}

/** A run finished on a thread. `aborted` is a Stop from any surface; `error` is a failed run. */
export interface RunEndFrame {
  type: 'chat.run.end';
  threadId: string;
  reason: 'done' | 'aborted' | 'error';
  run?: string;
}

export interface StreamStartFrame {
  type: 'chat.stream.start';
  id: string;
  threadId: string;
  replyToId?: string;
  ts?: string;
  run?: string;
}

export interface StreamDeltaFrame {
  type: 'chat.stream.delta';
  id: string;
  threadId: string;
  text: string;
  /**
   * Set only on the replay of a run in flight, where `text` is the bubble's whole text rather
   * than one more chunk: the window that asks for a sync is usually the one that was already
   * watching, so appending would paint the turn onto itself.
   */
  replay?: boolean;
}

/** Incremental reasoning for the bubble `id`, from an engine that exposes the text. */
export interface ReasoningDeltaFrame {
  type: 'chat.reasoning.delta';
  id: string;
  threadId: string;
  text: string;
  /** Whole text rather than a chunk. See StreamDeltaFrame.replay. */
  replay?: boolean;
}

/**
 * Running token estimate while a redacted engine thinks (the Claude bridge never sends the text).
 * No reasoning text will follow, so the bubble shows a count and opens nothing.
 */
export interface ReasoningTokensFrame {
  type: 'chat.reasoning.tokens';
  id: string;
  threadId: string;
  tokens: number;
}

export interface StreamDoneFrame {
  type: 'chat.stream.done';
  id: string;
  threadId: string;
}

export interface StreamAbortFrame {
  type: 'chat.stream.abort';
  id: string;
  threadId: string;
  error?: string;
}

export interface ToolCallPayload {
  id: string;
  name: string;
  args: Record<string, unknown>;
  durationMs?: number;
  ok: boolean;
  output: string;
  truncated: boolean;
  /** True between the start frame and the result frame, so the card can show a spinner. */
  running?: boolean;
  /** Persisted state of the sub-agent behind a `spawn` card. */
  spawn?: SpawnLifecycleState;
}

export interface ToolCallFrame extends ToolCallPayload {
  type: 'chat.tool';
  threadId: string;
  turnId: string;
  ts: string;
}

/** Display-only lifecycle state persisted on a `spawn` tool card, so history can replay the
 * exact running/terminal state without waiting for a live lifecycle frame. */
export type SpawnAction = 'spawn' | 'send';

export interface SpawnLifecycleState {
  subagentId: string;
  displayName: string;
  agentType: string;
  mode: string;
  /** Which tool opened the card. Same lifecycle either way, only the wording differs. */
  action: SpawnAction;
  status: 'running' | 'complete' | 'error' | 'aborted';
  resultLength?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/** A tool started executing: the card renders a spinner until the matching `chat.tool` frame
 *  arrives with the same id and upserts the result. */
export interface ToolStartFrame {
  type: 'chat.tool.start';
  id: string;
  threadId: string;
  turnId: string;
  name: string;
  args: Record<string, unknown>;
  ts: string;
}

/** Live output from a running tool (bash), appended to the card the start frame opened. Streamed
 *  in throttled chunks; the `chat.tool` frame that follows settles it. */
export interface ToolDeltaFrame {
  type: 'chat.tool.delta';
  /** Same id as the start/end pair. */
  id: string;
  threadId: string;
  stdout: string;
  stderr: string;
  ts: string;
  /**
   * Set only on a replay of a run that was in flight: the output before this chunk was dropped
   * from the server's live turn journal to hold its budget. The card is marked truncated, which is
   * the state that offers `chat.tool.full` once the call settles -- a card silently missing its
   * head would read as a short, complete output.
   */
  clipped?: boolean;
  /** Whole output rather than a chunk. See StreamDeltaFrame.replay. */
  replay?: boolean;
}

/**
 * A tool output, whole, in answer to `chat.tool.full`.
 *
 * A card is pushed with its output clipped (the server's TOOL_OUTPUT_LIMIT) so a reconnect does
 * not replay every byte every tool ever printed. `found` false is a call the session no longer
 * holds: the card keeps the clipped text it has rather than blanking the block.
 */
export interface ToolFullFrame {
  type: 'chat.tool.full.result';
  threadId: string;
  id: string;
  output: string;
  found: boolean;
}

/**
 * The work a folded run row stood for -- docs/run-hydration.md.
 *
 * `found` false is a range the current branch no longer holds (a compaction dropped the turn, a
 * rewind changed branch): the group says so and stays collapsed rather than emptying itself.
 */
export interface RunItemsFrame {
  type: 'chat.run.items';
  threadId: string;
  /** Echo of the row id asked for: what the client replaces with these items. */
  fromId: string;
  messages: HistoryEntry[];
  found: boolean;
}

/** A sub-agent spawned mid-run. Annotates the `spawn` tool card (by id) with its sub-agent
 *  identity and a running state, or opens a standalone spawn card for a programmatic spawn. */
export interface SpawnStartFrame {
  type: 'chat.spawn.start';
  /** The tool-start card id when spawned from a tool, else the sub-agent id. */
  id: string;
  subagentId: string;
  threadId: string;
  turnId: string;
  displayName: string;
  agentType: string;
  mode: string;
  action: SpawnAction;
  ts: string;
}

/** Settles a spawn card: the sub-agent finished (complete), errored, or was aborted. */
export interface SpawnEndFrame {
  type: 'chat.spawn.end';
  /** Same id as the start. */
  id: string;
  subagentId: string;
  threadId: string;
  turnId: string;
  status: 'complete' | 'error' | 'aborted';
  resultLength?: number;
  error?: string;
  ts: string;
}

/** The run an entry belongs to -- the server folds `run_start`/`run_end` markers (docs/run-grouping.md). */
export interface RunMeta {
  /** The id of the run's `run_start` entry: the grouping key. */
  id: string;
  status: 'running' | 'done' | 'aborted' | 'error';
  startTs: string;
  endTs?: string;
}

/**
 * A finished run's work, standing in for the items it folds -- docs/run-hydration.md.
 *
 * Sent in place of those items, at the position the first of them held, and only because this
 * client asked for it (`fold` on the request). Everything the collapsed header draws is here and
 * nothing else: the work itself is fetched with `session.run.items` when the reader opens the
 * group. On a real session this turns the page a thread opens on from 594 KB into 86 KB.
 */
export interface RunSummaryEntry {
  /** `run-<first folded entry id>`: the row id, and a paging cursor like any other row's. */
  id: string;
  role: 'run';
  ts: string;
  run: RunMeta;
  /** Tool calls the row stands for: the header counts them without holding a card. */
  toolCount: number;
  firstTool?: string;
  /** Rows the fold hides, so the group can draw a skeleton the size of what is coming. */
  itemCount: number;
  /** The last entry the row stands for: with `id`, the exact range hydration asks for. */
  lastId: string;
}

export type HistoryEntry =
  | RunSummaryEntry
  | {
      id: string;
      role: 'user' | 'assistant';
      text: string;
      ts: string;
      attachments?: AttachmentMeta[];
      location?: LocationData;
      /** Words per recording id, so each replayed bubble matches the live one. */
      transcripts?: Record<string, string>;
      /** What the model thought before this reply, replayed collapsed. */
      reasoning?: string;
      /** How much it thought, when the engine redacts the text and only counts it. */
      reasoningTokens?: number;
      /** A replayed command answer: same bubble the live `chat.command.result` drew. */
      command?: boolean;
      /** The aside folded under that answer (a compaction summary). */
      details?: string;
      /**
       * Why the run this bubble stands for died. The live error came in on `chat.stream.abort` and
       * nowhere else, so a reopened thread showed the question with nothing under it.
       */
      error?: string;
      /**
       * A compaction boundary, and how many turns above it the summary covers. The server stores
       * the summary in a `user` turn because that is the role the prompt needs it in; drawn as one
       * it was a wall of `[Prior context summarized]` in the owner's own voice. `text` is the
       * summary alone, and the turns it stands for are still replayed above it in full.
       */
      summaryOf?: number;
      /** The run this entry belongs to, when it sits inside one. */
      run?: RunMeta;
    }
  | ({ role: 'tool'; ts: string } & ToolCallPayload & { run?: RunMeta });

/**
 * A prompt sent from one of the owner's other windows.
 *
 * The sending device drew the bubble itself and carries the same id, so it drops the echo; every
 * other window gains the question its incoming answer replies to. Before this, a second window
 * showed the answer hanging under nothing until the thread was reloaded.
 */
export interface ChatUserFrame {
  type: 'chat.user';
  threadId: string;
  id: string;
  text: string;
  ts?: string;
  attachments?: AttachmentMeta[];
  location?: LocationData;
}

/**
 * A compaction cut the prompt, drawn while the owner is looking at the run that caused it.
 *
 * `/compact` answers with a command bubble of its own; the automatic gates answered with nothing,
 * so the rule existed in the server's log and only surfaced at the next history load, which read
 * as a thread that had lost its middle for no stated reason.
 *
 * `id` is the server's `compaction` entry id, the one a replayed history draws it under, so a
 * device holding both keeps one rule and not two. The turns it stands for are still in the thread,
 * above the rule: `count` only says how many the prompt no longer carries.
 */
export interface ChatCompactionFrame {
  type: 'chat.compaction';
  threadId: string;
  id: string;
  summary: string;
  count: number;
  ts?: string;
}

/**
 * A compaction is running on this thread, or has just stopped.
 *
 * The state, not the event that ends it: the server broadcasts it when it flips and replays it to
 * a window that opens or reloads mid-operation, which is why it carries the instant it began.
 * Before it, the minute or two the summarizer takes was visible only as the placeholder bubble
 * `/compact` draws locally -- so a reload during a compaction showed a thread doing nothing, and
 * the owner typed `/compact` again to be told one was already running.
 *
 * `since` absent means it is over. Silent by design: no ring, no tray entry -- a compaction is
 * not something the owner has to be told about (docs/notifications.md).
 */
export interface ChatCompactingFrame {
  type: 'chat.compacting';
  threadId: string;
  /** ISO instant the operation began. Absent means it is over. */
  since?: string;
}

export interface ChatHistoryFrame {
  type: 'chat.history';
  threadId: string;
  messages: HistoryEntry[];
  /** Echo of the request cursor: absent means the newest page, which replaces the thread. */
  before?: number;
  /** Whether anything remains before this page, so the list stops asking at the top. */
  hasMore?: boolean;
  /** What to send as `before` to reach the page just older than this one. */
  nextBefore?: number;
  /** The conversation's unsent draft, on the newest page only. Absent means there is none. */
  draft?: string;
  /**
   * A run is in flight for this conversation, as of this page. Read instead of the store's own
   * run flags, which are seeded by `session.list`: that is a separate round trip, and when it
   * lost the race every sealed bubble of the turn in progress was dropped as stale.
   */
  activeRun?: boolean;
}

/**
 * A draft changed on another of the owner's devices. Applied only when the local composer is empty
 * or unfocused: replacing text being typed loses characters and throws the caret to the end.
 */
export interface DraftChangedFrame {
  type: 'draft.changed';
  threadId: string;
  text: string;
  /** The server's clock, so two devices order their writes the same way. */
  ts: number;
}

export interface SessionSummary {
  threadId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  lastActiveAt: string;
  /** Filed away by the owner: shown in the archived list instead of the drawer, never deleted. */
  archived?: boolean;
  /**
   * Where the conversation sits in the owner's pinned list, absent when it is not pinned. The
   * server owns it, so the phone and the browser show the same pins in the same order. Dense,
   * from 0.
   */
  pinRank?: number;
  /** A run is answering on this thread right now: the app keeps the Stop button visible. */
  activeRun?: boolean;
  /** Workspace key the conversation runs in: 'default' or a config.workspaces key. */
  workspace?: string;
  /** The conversation holds text typed and not sent. One bit: the text itself rides on chat.history. */
  hasDraft?: boolean;
}

export interface CommandsListResultFrame {
  type: 'commands.list.result';
  commands: Array<{ name: string; description: string }>;
}

export interface SessionFileMeta {
  id: string;
  filename: string;
  type: 'image' | 'audio' | 'video' | 'file';
  mimeType: string;
  sizeBytes: number;
  ts: string;
}

export interface FilesListResultFrame {
  type: 'files.list.result';
  threadId: string;
  files: SessionFileMeta[];
  totalBytes: number;
}

export interface SessionListResultFrame {
  type: 'session.list.result';
  sessions: SessionSummary[];
}

/** Answer to session.workspace.set: the key the server stored, not the one the app hoped for. */
export interface SessionWorkspaceSetResultFrame {
  type: 'session.workspace.set.result';
  threadId: string;
  workspace: string;
}

export type ApprovalDecision = 'allow-once' | 'allow-session' | 'deny';

export type ApprovalOutcome = ApprovalDecision | 'expired' | 'cancelled';

export interface ApprovalRequestFrame {
  type: 'approval.request';
  id: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  replyToId?: string;
  expiresAt: number;
  /**
   * Whether "always allow in this conversation" is on offer. False for the per-invocation tools
   * (bash, memory): the server refuses a session grant for them anyway, so offering it would be
   * a button that lies.
   */
  allowSessionOffered?: boolean;
}

/** One pending approval, as `approval.pending` carries it: a request without the frame envelope. */
export type ApprovalPendingEntry = Omit<ApprovalRequestFrame, 'type'>;

/**
 * Every approval still waiting for an answer, sent when the socket opens.
 *
 * Authoritative: the whole pending set is replaced by `entries`, empty included. A sheet is
 * broadcast once and the server only replays it to a sync of the thread it belongs to, so an
 * approval raised on another thread or while the device slept was never asked again and the tool
 * was denied on timeout without the owner seeing it. The empty list clears a sheet left behind by
 * a server that restarted while holding one.
 */
export interface ApprovalPendingFrame {
  type: 'approval.pending';
  entries: ApprovalPendingEntry[];
}

/** The prompt is over and nobody here answered it: timed out, cancelled, or another window won. */
export interface ApprovalResolvedFrame {
  type: 'approval.resolved';
  id: string;
  threadId: string;
  reason: 'expired' | 'cancelled' | 'answered-elsewhere';
}

export interface QuestionOptionFrame {
  label: string;
  description?: string;
}

export interface QuestionInfoFrame {
  header: string;
  question: string;
  options: QuestionOptionFrame[];
  multiple?: boolean;
  custom?: boolean;
}

/** A `question` tool call asking the owner: N questions on one card, answered as a batch. */
export interface QuestionAskFrame {
  type: 'question.ask';
  id: string;
  threadId: string;
  questions: QuestionInfoFrame[];
  /** The running tool card the form is drawn inside, already the card id (`t-<callId>`). */
  replyToId?: string;
  ts: string;
}

/**
 * Every question of this owner still waiting, sent at connect.
 *
 * Authoritative: the whole pending set is replaced with `entries`. Nothing pushed while a socket
 * was down is replayed, so this is what a reopened app is told; and an empty list is meaningful,
 * it clears a card kept from a server that died holding the question.
 */
export interface QuestionPendingFrame {
  type: 'question.pending';
  entries: Omit<QuestionAskFrame, 'type'>[];
}

/** The owner answered: one array of selected labels per question, in order. */
export interface QuestionReplyFrame {
  type: 'question.reply';
  id: string;
  answers: string[][];
}

/** The question is closed without an answer: stopped, or a message typed instead. */
export interface QuestionResolvedFrame {
  type: 'question.resolved';
  id: string;
  threadId: string;
  reason: 'answered' | 'canceled';
}

/** A `/undo` without an argument: the server asks which mode instead of guessing. */
export interface UndoPromptFrame {
  type: 'undo.prompt';
  id: string;
  threadId: string;
  turnPreview: string;
  /** Precomputed file diff, per depot. Empty = nothing to restore. */
  diff: Array<{ root: string; additions: number; deletions: number }>;
  ts: string;
}

/** The owner picked a mode in the undo sheet. */
export interface UndoChooseFrame {
  type: 'undo.choose';
  id: string;
  mode: 'soft' | 'hard';
}

/** The owner dismissed the undo sheet: the prompt resolves as canceled, nothing happens. */
export interface UndoCancelFrame {
  type: 'undo.cancel';
  id: string;
}

/** The undo sheet was dismissed, or the pending request expired. */
export interface UndoResolvedFrame {
  type: 'undo.resolved';
  id: string;
  threadId: string;
  reason: 'chosen' | 'canceled';
}

export interface ApprovalHistoryEntry {
  id: string;
  threadId: string;
  toolName: string;
  args: string;
  outcome: ApprovalOutcome;
  requestedAt: string;
  decidedAt: string;
  durationMs: number;
  /** Granted by an earlier "always allow" instead of a prompt: nothing was shown to anyone. */
  auto: boolean;
}

export interface ApprovalHistoryResultFrame {
  type: 'approval.history.result';
  threadId?: string;
  entries: ApprovalHistoryEntry[];
  stats: { total: number; allowed: number; denied: number; expired: number };
}

export interface DiagSnapshotResultFrame {
  type: 'diag.snapshot.result';
  text: string;
}

/** Ack for a `diag.report`: only an acknowledged report is dropped from the device's store. */
export interface DiagReportResultFrame {
  type: 'diag.report.result';
  accepted: number;
}

export interface LogsTailResultFrame {
  type: 'logs.tail.result';
  text: string;
  lines: number;
  query: { scope?: string; level?: string; run?: string; contains?: string; limit?: number };
}

export interface TranscriptFrame {
  type: 'chat.transcript';
  threadId: string;
  /** The id this device generated for the chat.send that carried the recordings. */
  replyToId: string;
  /** One entry per recording: a message can carry several, each with its own words. */
  items: Array<{ id: string; text: string }>;
}

export interface VoiceModeResultFrame {
  type: 'voice.mode.result';
  mode: 'cloud' | 'local' | 'auto';
  /** What "auto" resolves to right now, so the screen never has to guess. */
  resolved: 'cloud' | 'local';
  /** False when the server has no cloud credentials: the choice would fail. */
  cloudAvailable: boolean;
}

export interface UiPrefsResultFrame {
  type: 'uiPrefs.result';
  /** Keep tool cards expanded after their run settles (default false -> folded). */
  expandTools: boolean;
  /** Keep the reasoning block expanded after the turn settles (default false -> folded). */
  expandReasoning: boolean;
}

/**
 * The server's answer to a manual update request.
 *
 * Sent before the swap window can stop the service, so `started: true` is a promise that the
 * socket is about to drop, not a report that anything was installed. `version` is what is running
 * at the moment of the answer: compare it with the `hello` after reconnecting to know whether the
 * registry actually had something newer.
 */
export interface UpdateResultFrame {
  type: 'update.result';
  started: boolean;
  version: string;
  /** busy: a run is in flight. denied: the service user cannot start the unit. failed: systemd. */
  reason?: 'busy' | 'denied' | 'failed';
  detail?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  /** "/"-separated menu path; the picker renders groups the way the server's /model does. */
  group?: string;
  /** Provider key this model belongs to, so the app can group models by provider. */
  provider?: string;
  /**
   * Effort levels this model accepts; absent or empty means it discards effort, and the picker
   * skips that step. Per model, so the step describes the model being staged rather than the one
   * currently in force.
   */
  effortLevels?: string[];
  /** The model's own full context window: the ceiling list is built under it, never above. */
  context?: number;
  /**
   * Milliseconds this model declares it may go without a byte back, absent when it declares
   * nothing and the server's transport default applies. `0` is a declaration too: no timer, the
   * Stop button is the only wall. The edit form shows it so the field is not blank over a setting.
   */
  timeoutMs?: number;
  /** For a tag entry: the effort the tag pins, so a config flow can name what applies. */
  effort?: string;
  /** Whether the model accepts image input; the fallback picker only offers vision-capable ones. */
  vision?: boolean;
  /**
   * The model is served by several providers and one of them can be pinned, so the picker offers
   * a routing step and asks `model.endpoints` for the routes. Absent means a single route.
   */
  routes?: boolean;
  /** A `llm.models` entry contributes this model: custom when alone, an override when discovery
   *  serves the id too. */
  declared?: boolean;
  /** Discovery also serves this id, so deleting a declaration resets it instead of removing it. */
  discovered?: boolean;
}

/**
 * A model that exists and cannot run. Never offered by a picker, always listed by the management
 * view: a filtered list cannot say what it removed, which is how a declaration can survive its own
 * deletion from a gateway unnoticed.
 */
export interface UnavailableModel {
  id: string;
  label: string;
  provider?: string;
  declared?: boolean;
  discovered?: boolean;
  /** The server's availability verdict. */
  state: 'stale' | 'no-key' | 'no-auth';
  /** Ready to print: "litellm no longer lists it", "LITELLM_API_KEY is not set". */
  reason: string;
}

/** One route of a routable model: what pinning it costs, and whether it is healthy right now. */
export interface ModelEndpoint {
  /** The reference to select to pin this route: the model, then `@`, then the endpoint tag. */
  id: string;
  /** The provider behind the route, spelled the way its own catalogue spells it. */
  label: string;
  /** USD per million tokens. */
  promptUsd?: number;
  completionUsd?: number;
  context?: number;
  /**
   * The output ceiling of this route, which is the limit that actually refuses a call: showing the
   * context alone reads as if a 1M-context route accepts a 1M-token answer, and it does not.
   */
  maxOutput?: number;
  /** Degraded or down on the provider's own health flag: worth showing, not worth hiding. */
  degraded?: boolean;
  uptime30m?: number;
}

/**
 * How a route list is ordered. Price is the default because pinning is usually a price decision;
 * the others exist because the cheapest route is regularly not the one worth having. The server
 * sorts, so every surface presents one model's providers in the same order.
 */
export type RouteSort = 'price' | 'context' | 'output' | 'uptime';

export const ROUTE_SORTS: readonly RouteSort[] = ['price', 'context', 'output', 'uptime'];

export const ROUTE_SORT_LABELS: Record<RouteSort, string> = {
  price: 'price',
  context: 'context',
  output: 'output',
  uptime: 'uptime',
};

/**
 * The routes of one model, cheapest first. An empty list means the model has a single route,
 * which is every provider but OpenRouter, and the picker then skips the step.
 */
export interface ModelEndpointsResultFrame {
  type: 'model.endpoints.result';
  model: string;
  /**
   * The ordering this list is in, echoed back by the server. Routes are cached per model and per
   * order, and the answer carries no request id: without this a reorder would have to be guessed
   * from the pending asks, and would read as the order before it.
   */
  sort?: RouteSort;
  endpoints: ModelEndpoint[];
}

export interface EffortState {
  /** The level in effect ("" when the model discards effort). */
  level: string;
  /** Levels the active model accepts; empty means no choice is offered. */
  levels: string[];
  supported: boolean;
}

/**
 * What window this thread may use and what it may be lowered to. The ceiling list is built in
 * the app from these numbers (see core/context.ts), the same way the server builds it for the
 * other channels.
 */
export interface ContextState {
  /** The model's full window. */
  raw: number;
  /** What the run may use once this conversation's choice and the standing cap are applied. */
  effective: number;
  /** The standing agent/global cap, when one is set below the full window. */
  cap?: number;
  /** This conversation's own choice: a ceiling, 'full', or absent when it follows policy. */
  choice?: number | 'full';
  /**
   * How much of `effective` the conversation already holds, in the units the provider bills.
   * Absent on a thread with no session yet, and on a server that predates the field: the header
   * then shows no share rather than a confident 0%.
   */
  used?: number;
}

export interface ModelListResultFrame {
  type: 'model.list.result';
  /** What may run. Every picker reads this and only this. */
  models: ModelOption[];
  defaultModel: string;
  /** Known and not runnable, with the reason. Absent on a server that predates the field. */
  unavailable?: UnavailableModel[];
}

/**
 * How a hand-fired discovery went. The catalogue itself arrives as `model.list.result` just
 * before, so this frame is only the report: how many models are known now, and which providers
 * kept their previous ones because they did not answer.
 */
export interface ModelRefreshResultFrame {
  type: 'model.refresh.result';
  models: number;
  /** Providers that opt into discovery and did not answer in full, by config key. */
  failed: string[];
  /** False when no provider opts into discovery at all: a refresh then changes nothing. */
  enabled: boolean;
}

/** One skill of the server catalog. `path` is display-only: where to edit it on the server. */
export interface SkillEntry {
  name: string;
  description: string;
  version?: string;
  source: 'built-in' | 'custom' | 'workspace';
  path: string;
  /** Key of the workspace this skill belongs to, when it is a secondary workspace's. */
  workspace?: string;
  /** Workspaces holding their own skill of that name, so this global entry is masked there. */
  overriddenIn?: string[];
  /** The global tier this workspace skill masks, absent when the name exists nowhere else. */
  overrides?: 'custom' | 'built-in';
}

/** Where a skill transfer lands. Never built-in: the server refuses it, that tier is resynced
 *  from the release at every boot. */
export interface SkillTarget {
  source: 'custom' | 'workspace';
  /** Workspace key when the tier is `workspace`; absent means the default workspace. */
  workspace?: string;
}

export interface SkillsListResultFrame {
  type: 'skills.list.result';
  skills: SkillEntry[];
}

/** One tool of the server catalog. `source` tells where it comes from; MCP tools carry their
 *  server name so the page can group them. `disabled` mirrors the global tools.disabled
 *  denylist, so a tool that is off shows as off instead of looking broken. */
export interface ToolEntry {
  name: string;
  description: string;
  source: 'built-in' | 'plugin' | 'mcp';
  /** Present for source "mcp": the config key under `mcp`, also the namespace prefix. */
  server?: string;
  disabled: boolean;
}

export interface ToolsListResultFrame {
  type: 'tools.list.result';
  tools: ToolEntry[];
  /** Names in tools.disabled that no tool carries anymore. Rendered red so the denylist can be
   *  cleaned: an entry like that does nothing, so it has to be visible to be removed. */
  missing: string[];
}

/** One declared MCP server, with the wiring the app may show and edit (minus secrets). */
export interface McpEntry {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  state: 'connected' | 'disabled' | 'failed';
  toolCount: number;
  lastError?: string;
  lastAttemptAt?: string;
  /** Declared mcp.<name>.enabled. Absent is enabled; the toggle writes this key. */
  enabled?: boolean;
  command?: string;
  args?: string[];
  url?: string;
}

export interface McpListResultFrame {
  type: 'mcp.list.result';
  servers: McpEntry[];
}

/** One workspace of the server, for display only: where its files and skills live. */
export interface WorkspaceEntry {
  key: string;
  path: string;
  /** The configured default workspace. */
  default: boolean;
}

export interface WorkspacesListResultFrame {
  type: 'workspaces.list.result';
  workspaces: WorkspaceEntry[];
}

/**
 * Answer to model.get / model.set / model.effort.set: the state the server actually stored,
 * never an optimistic echo of what the picker hoped for.
 */
export interface ModelResultFrame {
  type: 'model.result';
  threadId: string;
  /** The model that will run on this thread: this chat's pick, an agent pin, or the default. */
  model: string;
  defaultModel: string;
  /**
   * Which of the three it is. "agent" means this chat inherits a pin from the server config: the
   * row says so, because a model shown without its source cannot explain why picking the global
   * default changes nothing. Absent on a server that predates the field.
   */
  source?: 'session' | 'agent' | 'agent-file' | 'global';
  effort: EffortState;
  /** Absent on a server that predates the context step: the picker then skips it. */
  context?: ContextState;
}

/**
 * A command the server is still running. Sent only past a short delay, so a fast command never
 * flickers a placeholder; the matching result replaces this bubble.
 */
export interface CommandPendingFrame {
  type: 'chat.command.pending';
  threadId: string;
  /** The chat.send id that carried the command: the result carries it as replyToId. */
  replyToId: string;
  text: string;
}

/** Output of a command the server executed; rendered as a distinct bubble, not an agent reply. */
export interface CommandResultFrame {
  type: 'chat.command.result';
  threadId: string;
  /** The chat.send id that carried the command, when one did. */
  replyToId?: string;
  text: string;
  /** A `/status` result also travels structured, so the app draws a page instead of a bubble. */
  status?: StatusPayload;
  /** An aside too long for the bubble (a compaction summary), folded away like reasoning. */
  details?: string;
  /** The server's leaf diverged from the client's (branch switch, undo, retry): refresh the thread. */
  reset?: 'branch-switch';
  /** Text to prefill in the composer (the retried/undone user message). */
  compose?: string;
  /** The command's input bubble is noise (undo, retry, branches): drop the optimistic one. */
  dropInput?: boolean;
}

/**
 * The send is parked: a compaction is rewriting the history its run would resume, so the router
 * holds it until that finishes (a minute or two); or a run is already active and the message was
 * queued in its mailbox for the next turn boundary. Lifted by `chat.send.acked` (an injection
 * drained) or by the stream that follows (a compaction released). Without this the bubble sits
 * there with nothing behind it and the app looks dropped.
 */
export interface SendQueuedFrame {
  type: 'chat.send.queued';
  threadId: string;
  /** The chat.send id being held: the mark belongs to that bubble, not to the thread. */
  replyToId: string;
  reason: 'compaction' | 'injection';
}

/**
 * A queued injection was drained into the run at a turn boundary. Lifts the "queued for the
 * next turn" mark on the bubble that carried it.
 */
export interface SendAckedFrame {
  type: 'chat.send.acked';
  threadId: string;
  /** The chat.send id that was queued and is now drained into the run. */
  replyToId: string;
}

/**
 * Structured `/status` report for the fullscreen diagnostics page. The text form stays the
 * canonical rendering on the chat channels; this is the same report shaped as fields.
 */
export interface StatusPayload {
  /** Null when this thread has no session yet: nothing has ever been asked here. */
  session: {
    id: string;
    platform: string;
    chatType: string;
    createdAt: string;
    lastActiveAt: string;
    messages: number;
    subAgent?: {
      displayName: string;
      type: string;
      visibility: string;
      parentSessionId: string;
    };
  } | null;
  model: {
    /** The model the API actually receives: a `tag:` reference is resolved to its leaf. */
    current: string;
    /** Set when the current model is a `tag:` reference, naming the tag. */
    tag?: string;
    /** The agent's configured default, present when the session overrides it. */
    configDefault?: string;
    effort?: string;
    selfHosted: boolean;
    contextLimit: number;
    /** Why the window is what it is ("declared", "capped from …", …). */
    contextNotes: string[];
    /**
     * How long one request may go silent before the server cuts it, with where the number comes
     * from: `120s (default)`, `900s (model)`, `none (Stop only)`. Spelled by the server, since the
     * transport defaults are its constants. Absent on a server that predates the field.
     */
    timeout?: string;
  };
  context: {
    /** The provider's count on the last call; undefined until a call is recorded. */
    measured?: { tokens: number; pctOfLimit: number };
    estimated: number;
    /** What actually drives auto-compaction. */
    occupied: number;
    /**
     * The engine owns the history and the server's copy is only a log of it (claude-sdk), so
     * `estimated` covers turns the model already summarised away. Absent on the home loop, where
     * that copy is the prompt.
     */
    mirrorIsTranscript?: boolean;
    autoCompactOn: boolean;
    autoCompactThresholdPct: number;
    autoCompactThresholdTokens: number;
    /** A context handed to another model (engine switch) is reported here. */
    carried?: { model: string; messages: number; tokens: number; dropped: number };
  };
  /** Session-counter figures since /new; null when no call has been made. */
  conversation: {
    calls: number;
    promptTokens: number;
    cacheReadTokens: number;
    completionTokens: number;
  } | null;
  /** The 90-day analytics for this session's own calls; null while there are none. */
  analytics: {
    calls: number;
    errors: number;
    durationMs?: number;
    billedUsd: number;
    referenceUsd: number;
    unpriced: number;
    rows: Array<{
      model: string;
      calls: number;
      promptTokens: number;
      cacheReadTokens: number;
      completionTokens: number;
      /** Absent when the model has no price on record. */
      costUsd?: number;
      costBilled: boolean;
      costApproximate: boolean;
    }>;
  } | null;
  /** Work driven by this session but run elsewhere (sub-agents, browser); null when there is none. */
  delegated: {
    calls: number;
    tokens: number;
    billedUsd: number;
    referenceUsd: number;
  } | null;
  runtime: {
    activeRun: string;
    verbose: boolean;
    approvedTools: string[];
  };
}

/** The fullscreen status report of a conversation, asked by the page the menu opened. */
export interface StatusGetFrame {
  type: 'status.get';
  threadId: string;
}

export interface StatusResultFrame {
  type: 'status.result';
  threadId: string;
  /** The same report as text, for clients that only show plain output. */
  text: string;
  status: StatusPayload;
}

/**
 * One layer of the system prompt a conversation runs on, as the server composes it. The four
 * prompt files carry an origin and an `edit` target; the derived layers carry neither.
 */
export interface SessionInstructionLayer {
  /** CORE, SOUL, AGENTS, USER, agent, skills, tools, platform, runtime, suggested. */
  id: string;
  label: string;
  bytes: number;
  text: string;
  origin?: InstructionOrigin;
  /** Workspace the content comes from, empty for a shipped template. */
  from?: string;
  /** Present when the layer is editable: what to open the instructions editor on. */
  edit?: { workspace: string; file: string };
}

/** A nested AGENTS.md this conversation's runs injected. Addressed back by its absolute path. */
export interface SessionInstructionNested {
  path: string;
  /** Relative to the workspace when it sits inside it, absolute otherwise. */
  label: string;
  bytes: number;
  /** Runs that injected it: the collector dedups per run, not per session. */
  count: number;
  firstAt: string;
  lastAt: string;
  missing: boolean;
  /** This session turned the file off: it is never injected, and the page greys it. */
  disabled?: boolean;
  /** This session unloaded the record: shown until the next lazy reload. */
  unloaded?: boolean;
}

export interface SessionInstructionsPayload {
  agent: string;
  workspace: string;
  workspaceDir: string;
  model: string;
  backend: string;
  platform: string;
  totalBytes: number;
  layers: SessionInstructionLayer[];
  nested: SessionInstructionNested[];
  /** Layer ids the session turned off (agent, skills, tools, platform, runtime, suggested). */
  layersOff: string[];
  /** Skill names the session filtered out of the catalog. */
  skillsOff: string[];
  /** Every skill in scope, with the ones the session turned off flagged. Lets the page toggle more. */
  skills: Array<{ name: string; description: string; off: boolean }>;
  /** Long-term memory recall off for this session. */
  memoryRecallOff: boolean;
  /** What the report cannot show, stated by the server rather than guessed here. */
  notes: string[];
}

/** What one conversation is loaded with. See docs/session-instructions.md on the server. */
export interface SessionInstructionsGetFrame {
  type: 'session.instructions.get';
  threadId: string;
}

export interface SessionInstructionsResultFrame {
  type: 'session.instructions.result';
  threadId: string;
  instructions: SessionInstructionsPayload;
}

/** One per-session instruction control the app applies; the server answers with a fresh report. */
export interface SessionInstructionPatch {
  kind: 'nested.toggle' | 'nested.unload' | 'layer.toggle' | 'skill.toggle' | 'memory.toggle';
  path?: string;
  layer?: string;
  skill?: string;
  on?: boolean;
}

export interface SessionInstructionsSetFrame {
  type: 'session.instructions.set';
  threadId: string;
  patch: SessionInstructionPatch;
}

/** The thread's history is gone server-side; the app drops its copy. */
export interface ChatClearedFrame {
  type: 'chat.cleared';
  threadId: string;
}

/** A job's scope override in the app's editing vocabulary, mirroring the agent scope editor. */
export type JobScopeMode = 'inherit' | 'all' | 'list';

export interface JobScope {
  mode: JobScopeMode;
  names?: string[];
}

/** One scheduled task, as the server stores it plus the run-time unknowns painted red. */
export interface JobEntry {
  id: string;
  name: string;
  prompt: string;
  schedule: {
    kind: 'cron' | 'interval' | 'once';
    expr?: string;
    minutes?: number;
    runAt?: string;
    display: string;
  };
  enabled: boolean;
  /** Suppresses this job's push notifications, successes and failures alike. */
  silent: boolean;
  state: 'scheduled' | 'paused' | 'completed';
  pausedReason?: string;
  repeat: number | null;
  completedRuns: number;
  deliver: string;
  model?: string;
  /** The job's own effort pin, the sibling of `model`. */
  effort?: string;
  workspace?: string;
  skillsMode: JobScopeMode;
  skills?: string[];
  mcpMode: JobScopeMode;
  mcp?: string[];
  toolsMode: JobScopeMode;
  tools?: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  createdAt: string;
  unknownModel: boolean;
  unknownWorkspace: boolean;
  unknownSkills: string[];
  unknownMcp: string[];
  unknownTools: string[];
}

export interface JobsListResultFrame {
  type: 'jobs.list.result';
  jobs: JobEntry[];
}

export interface BrowserServiceEntry {
  unit: string;
  active: boolean;
}

export interface BrowserTabEntry {
  id: string;
  title: string;
  url: string;
}

/** What a human needs to drive the browser by hand: where to connect, with what password, and
 *  whether anything is running behind it. See docs/browser-page.md in the server repo. */
export interface BrowserInfoResultFrame {
  type: 'browser.info.result';
  enabled: boolean;
  webUrl?: string;
  vncHost?: string;
  vncPort: number;
  /** Absent when x11vnc runs without one. The page says so rather than showing a blank. */
  password?: string;
  services: BrowserServiceEntry[];
  tabs: BrowserTabEntry[];
  tabsError?: string;
}

/** One run of a job, listed as a thread the app can reopen and chat on. */
export interface JobRunEntry {
  threadId: string;
  runAt: number;
  messageCount: number;
  title: string;
}

export interface JobsRunsResultFrame {
  type: 'jobs.runs.result';
  jobId: string;
  runs: JobRunEntry[];
}

/**
 * One live sub-agent of a conversation. `threadId` is an opaque handle the server issues, and the
 * only way to address it: the app never builds one. `id` is what the roster shows, because
 * `displayName` is picked by the model and two agents can share it.
 */
export interface SubAgentEntry {
  threadId: string;
  id: string;
  displayName: string;
  type: string;
  messageCount: number;
  status: 'idle' | 'running';
  visibility: 'global' | 'workspace' | 'private';
  /** Which workspace a `workspace`-visible agent is scoped to; absent means the default one. */
  workspaceKey?: string;
  /**
   * The directory the agent's tools work in, which `workspaceKey` does not name: that one is the
   * orchestrator it belongs to. Absent on an agent spawned before the server carried the field.
   */
  workspaceDir?: string;
  model?: string;
  createdAt: string;
}

/** One paired client, as the server lists them -- docs/web-pairing.md in the my-claw repo. */
export interface DeviceRecord {
  deviceId: string;
  name: string;
  kind: 'app' | 'web';
  owner: string;
  enabled: boolean;
  createdAt?: string;
  lastSeenAt?: string;
  /** True for this device: the UI refuses to let it revoke the credential it is talking on. */
  self?: boolean;
}

export interface DeviceListResultFrame {
  type: 'device.list.result';
  devices: DeviceRecord[];
}

export interface DeviceRevokeResultFrame {
  type: 'device.revoke.result';
  ok: boolean;
  deviceId: string;
  error?: string;
}

/** What a pairing code stands for, shown before the owner approves. Carries no credential. */
export interface DevicePairInfoFrame {
  type: 'device.pair.info';
  code: string;
  /** Three digits that must match what the waiting browser shows. */
  verification: string;
  origin?: string;
  ip?: string;
  userAgent?: string;
  expiresAt: number;
}

export interface DevicePairResultFrame {
  type: 'device.pair.result';
  ok: boolean;
  deviceId?: string;
  error?: string;
}

export interface SubAgentsListResultFrame {
  type: 'subagents.list.result';
  /** The parent conversation the roster belongs to. */
  threadId: string;
  agents: SubAgentEntry[];
}

/**
 * One conversation a sub-agent has worked for, offered when handing an answer back.
 *
 * `parentSessionId` names the creator and the last driver is overwritten by every run, so neither
 * answers which conversations the agent is working for -- this list does. `unreachable` is set
 * instead of the entry being dropped: a caller whose conversation is gone reads as unavailable
 * rather than silently missing.
 */
export interface SubAgentCaller {
  sessionId: string;
  /** The thread to open, absent when that conversation can no longer be addressed. */
  threadId?: string;
  creator: boolean;
  firstAt: string;
  lastAt: string;
  runs: number;
  title?: string;
  unreachable?: 'gone';
}

export interface SubAgentsCallersResultFrame {
  type: 'subagents.callers.result';
  /** The sub-agent thread the list belongs to. */
  threadId: string;
  callers: SubAgentCaller[];
}

/** Per target, since one target being gone must not hide the ones that landed. */
export interface SubAgentHandoffOutcome {
  sessionId: string;
  threadId?: string;
  ok: boolean;
  error?: string;
}

export interface SubAgentsHandoffResultFrame {
  type: 'subagents.handoff.result';
  threadId: string;
  delivered: SubAgentHandoffOutcome[];
}

/** Which request was refused. The screen that asked is the one that shows it. */
export type ErrorScope =
  | 'chat'
  | 'files'
  | 'session'
  | 'diag'
  | 'logs'
  | 'voice'
  | 'model'
  | 'skills'
  | 'agents'
  | 'mcp'
  | 'tools'
  | 'instructions'
  | 'config'
  | 'workspaces'
  | 'status'
  | 'jobs'
  | 'tags'
  // Sent by the server for every subagents.* refusal, kill and reset included. It was missing
  // here, so those refusals fell through to the generic branch and were drawn as an agent message
  // in whatever conversation happened to be open.
  | 'subagents'
  | 'providers'
  | 'browser';

export interface ErrorFrame {
  type: 'error';
  message: string;
  scope?: ErrorScope;
}

/**
 * One agent, as it resolves right now: its own pin when it has one, otherwise what it inherits.
 * `skills`/`mcp`/`workspace`/`contextCap`/`maxIterations` are the raw config entry; null means
 * absent (and inherited), [] is a deliberate "nothing".
 */
export interface AgentInfo {
  /** The config key, e.g. "orchestrator". The app renders whatever the server sends. */
  key: string;
  label: string;
  description: string;
  /** The model that runs for this agent: own pin or inherited. */
  model: string;
  provider?: string;
  /** There is an entry in `agents.<key>.llm`. */
  pinned: boolean;
  /** The agent's own effort pin, absent when it has none (then the global applies). */
  effort?: string;
  /** Where the effective default comes from: "global", "orchestrator", or the key itself. */
  inheritsFrom: string;
  skills?: string[] | null;
  mcp?: string[] | null;
  workspace?: string | null;
  contextCap?: number | null;
  maxIterations?: number | null;
  /**
   * Scope entries (config override or the agent file) that match nothing in the live catalogs:
   * a skill that was removed, an MCP server undeclared, a workspace key gone. Rendered red: the
   * entry still exists in config, so it must stay visible to be cleaned up.
   */
  unknownSkills?: string[];
  unknownMcp?: string[];
  unknownWorkspace?: boolean;
  /**
   * Set only for file-defined agents. Absent marks one of the two reserved roles, which exist
   * without a file and so have no tier or path to show.
   */
  source?: string;
  path?: string;
  /** The tool baseline the agent narrows from: "general" or "research". */
  base?: string;
  /** Workspace layer the file was found in. Distinct from `workspace`, which is where it runs. */
  layer?: string;
}

/** A configured provider, for display only: never a secret, only whether its env key is set.
 *  The editable fields ride along so the edit page can seed its form from the snapshot. */
export interface ProviderInfo {
  key: string;
  type: string;
  group?: string;
  baseUrl?: string;
  promptCache?: boolean;
  reasoningReplay?: boolean;
  pricingProvider?: string;
  fallbackModel?: string;
  discover: boolean;
  /** Models currently known to belong to this provider. */
  models: number;
  keyEnv?: string;
  keyPresent: boolean;
}

/**
 * Answer to agents.config.get and to every agents.* mutation: the state the server stored. The
 * payload is one whole snapshot, so the app never stitches fields from separate answers.
 */
export interface AgentsConfigResultFrame {
  type: 'agents.config.result';
  defaultModel: string;
  defaultProvider?: string;
  /** "" when no global effort is set. */
  defaultEffort: string;
  /** Levels on offer for the global effort, in canonical order. */
  effortLevels: string[];
  /** The vision fallback model ("" when none): what image runs reroute to when the model can't take them. */
  fallback: string;
  providers: ProviderInfo[];
  agents: AgentInfo[];
}

/** One tag: a named alias for a model/effort/context-cap combo (docs/tags.md on the server).
 *  `model` is "" for the virtual Default tag, which always tracks the current default model. */
export interface TagRouteCandidate {
  model: string;
  effort?: string;
  contextCap?: number;
}

export interface TagInfo {
  name: string;
  model?: string;
  effort?: string;
  contextCap?: number;
  route?: TagRouteCandidate[];
  fallbackToGlobalDefault?: boolean;
}

/** Answer to tags.list and to every tags.* mutation. */
export interface TagsResultFrame {
  type: 'tags.result';
  tags: TagInfo[];
}

/**
 * The environment variable names the server knows, and which provider reads each. Names only:
 * the values live in .env on the server and never cross the wire. The creation form reads it to
 * propose a free name, or to reuse one that is already set.
 */
export interface ProvidersEnvResultFrame {
  type: 'providers.env.result';
  names: string[];
  /** Names present in the process env: the .env ones plus the shell/systemd ones. */
  present: string[];
  /** provider key -> the env name it reads. */
  usedBy: Record<string, string>;
}

/** The one editable provider shape: everything `providers.upsert` accepts. Empty strings on an
 *  edit clear the field; `providerType` is the engine, renamed so it cannot collide with the
 *  frame's own `type`. */
export interface ProviderPatch {
  type: 'providers.upsert';
  key: string;
  providerType?: 'openai' | 'codex' | 'anthropic';
  baseUrl?: string;
  apiKeyEnv?: string;
  group?: string;
  discover?: boolean;
  promptCache?: boolean;
  reasoningReplay?: boolean;
  pricingProvider?: string;
  fallbackModel?: string;
}

/** Where the content of a prompt file comes from. See docs/instructions-page.md on the server. */
export type InstructionOrigin = 'own' | 'inherited' | 'fallback' | 'off';

/**
 * One prompt file in one workspace. There is never a "missing" entry: a workspace without the
 * file inherits the default one's copy, and that is what the agent reads.
 */
export interface InstructionEntry {
  workspace: string;
  file: string;
  origin: InstructionOrigin;
  /** Workspace the content comes from, empty for `fallback`. */
  from: string;
  bytes: number;
  /** sha of the content that applies; a save echoes it back to prove it is not stale. */
  sha: string;
  /** The workspace's effective policy, always present on a current server. Absent: the server
   *  predates the layer controls, which the app then hides entirely. */
  inherit?: string;
  off?: boolean;
  /** The layer resolves to nothing on purpose: `off`, `inherit: "none"`, or a source that is cut
   *  and owns no file. The row cannot work the last case out on its own, and without it would
   *  promise a shipped template that is never read. */
  empty?: boolean;
}

/** A nested AGENTS.md found under a workspace. Read-only: it reaches tool results, not the prompt. */
export interface NestedInstruction {
  workspace: string;
  path: string;
  bytes: number;
}

export interface InstructionsListResultFrame {
  type: 'instructions.list.result';
  entries: InstructionEntry[];
  nested: NestedInstruction[];
  /** Workspaces whose nested list the server had to cut at its cap: the page says the list is
   *  incomplete instead of implying the workspace holds nothing more. Absent on older servers,
   *  which capped the whole scan at once and could empty a workspace's list without saying so. */
  nestedTruncated?: string[];
  /** The editable names, so the app never hardcodes the list the server enforces. */
  files: string[];
  maxBytes: number;
  /** File-defined agents and the prompt layers each declares. Absent: the section is skipped. */
  agentLayers?: Array<{ agent: string; layers: string[] }>;
}

export interface InstructionsFileFrame {
  type: 'instructions.file';
  workspace: string;
  file: string;
  content: string;
  origin: InstructionOrigin | 'nested';
  from: string;
  sha: string;
  editable: boolean;
}

/** Answer to every instructions.set, refusals included. `conflict` is the one the editor must
 *  handle on its own: the file changed on the server, so it has to reload before saving again. */
export interface InstructionsSavedFrame {
  type: 'instructions.saved';
  workspace: string;
  file: string;
  ok: boolean;
  sha: string;
  conflict: boolean;
  error?: string;
}

/** The config scope modes of `agents.<key>.skills|mcp`: inherit, everything, or a picked list. */
export type AgentScopeMode = 'inherit' | 'all' | 'list';
/** The file frontmatter modes, where "absent" means the file carries no key at all. */
export type FileScopeMode = 'absent' | 'all' | 'list';

/**
 * One file-defined agent as structured fields, never raw markdown: the app edits fields, the
 * server serializes the flat frontmatter. `editable` is false for the built-in tier; the app
 * offers a fork instead. `sha` is the file's current content hash, echoed back on save.
 */
export interface AgentFileResultFrame {
  type: 'agents.file.result';
  name: string;
  source: 'built-in' | 'custom' | 'workspace';
  path: string;
  editable: boolean;
  sha: string;
  description: string;
  base?: 'general' | 'research';
  tools?: string[];
  skillsMode: FileScopeMode;
  skills?: string[];
  mcpMode: FileScopeMode;
  mcp?: string[];
  model?: string;
  workspace?: string;
  maxIterations?: number;
  contextCap?: number;
  instructions?: string[];
  prompt: string;
  /** The names the tools picker may offer: this agent's baseline, narrowed to what exists. */
  toolOptions: string[];
  /** tools: entries outside the baseline. They are dropped at run time, so they are flagged. */
  unknownTools: string[];
}

export interface AgentFileSavedFrame {
  type: 'agents.file.saved';
  name: string;
  ok: boolean;
  sha: string;
  conflict: boolean;
  error?: string;
}

/** The raw config.json text and the sha the next write must echo. */
export interface ConfigResultFrame {
  type: 'config.result';
  content: string;
  sha: string;
  maxBytes: number;
}

export interface ConfigSavedFrame {
  type: 'config.saved';
  ok: boolean;
  sha: string;
  conflict: boolean;
  changed: string[];
  rebootRequired: string[];
  error?: string;
}

/**
 * The VAPID public key the device hands to its UnifiedPush distributor at registration.
 * Sent by the server as soon as the socket opens. See docs/notifications.md.
 */
export interface NotificationsInfoFrame {
  type: 'notifications.info';
  vapidPublicKey: string;
}

/**
 * The server's own version, sent once as the socket opens so the settings page can label
 * its "connected" state with the server it is talking to.
 */
export interface HelloFrame {
  type: 'hello';
  version: string;
}

export type ServerFrame =
  | BrowserInfoResultFrame
  | ChatMessageFrame
  | ChatUserFrame
  | ChatCompactionFrame
  | ChatCompactingFrame
  | LocationCapabilitiesFrame
  | ChatLocationFrame
  | LocationPreviewResultFrame
  | RunStartFrame
  | RunEndFrame
  | StreamStartFrame
  | StreamDeltaFrame
  | ReasoningDeltaFrame
  | ReasoningTokensFrame
  | StreamDoneFrame
  | StreamAbortFrame
  | ToolCallFrame
  | ToolStartFrame
  | ToolDeltaFrame
  | ToolFullFrame
  | RunItemsFrame
  | SpawnStartFrame
  | SpawnEndFrame
  | ChatHistoryFrame
  | SessionSyncResultFrame
  | DraftChangedFrame
  | SessionListResultFrame
  | SessionWorkspaceSetResultFrame
  | CommandsListResultFrame
  | FilesListResultFrame
  | DiagSnapshotResultFrame
  | DiagReportResultFrame
  | LogsTailResultFrame
  | VoiceModeResultFrame
  | UiPrefsResultFrame
  | ModelListResultFrame
  | ModelRefreshResultFrame
  | ModelEndpointsResultFrame
  | SkillsListResultFrame
  | ToolsListResultFrame
  | WorkspacesListResultFrame
  | ModelResultFrame
  | CommandPendingFrame
  | CommandResultFrame
  | SendQueuedFrame
  | SendAckedFrame
  | ChatClearedFrame
  | TranscriptFrame
  | ApprovalRequestFrame
  | ApprovalPendingFrame
  | ApprovalResolvedFrame
  | ApprovalHistoryResultFrame
  | QuestionAskFrame
  | QuestionPendingFrame
  | QuestionResolvedFrame
  | UndoPromptFrame
  | UndoResolvedFrame
  | AgentsConfigResultFrame
  | InstructionsListResultFrame
  | InstructionsFileFrame
  | InstructionsSavedFrame
  | McpListResultFrame
  | AgentFileResultFrame
  | AgentFileSavedFrame
  | ConfigResultFrame
  | ConfigSavedFrame
  | StatusResultFrame
  | SessionInstructionsResultFrame
  | JobsListResultFrame
  | JobsRunsResultFrame
  | SubAgentsListResultFrame
  | SubAgentsCallersResultFrame
  | SubAgentsHandoffResultFrame
  | DeviceListResultFrame
  | DeviceRevokeResultFrame
  | DevicePairInfoFrame
  | DevicePairResultFrame
  | TagsResultFrame
  | UpdateResultFrame
  | ProvidersEnvResultFrame
  | NotificationsInfoFrame
  | HelloFrame
  | ErrorFrame;

/**
 * Every frame the server can send. A `Record` keyed by the union, not a `Set` of strings: the
 * compiler refuses this object until it carries one entry per member, so a frame added to
 * `ServerFrame` cannot be half-shipped. A hand-kept set is what dropped the mirrored prompt on
 * every client while the server was sending it correctly.
 */
const FRAME_TYPES: Record<ServerFrame['type'], true> = objectOf([
  'device.list.result',
  'device.revoke.result',
  'device.pair.info',
  'device.pair.result',
  'chat.message',
  'chat.user',
  'chat.compaction',
  'chat.compacting',
  'location.capabilities',
  'chat.location',
  'location.preview.result',
  'chat.run.start',
  'chat.run.end',
  'chat.stream.start',
  'chat.stream.delta',
  'chat.reasoning.delta',
  'chat.reasoning.tokens',
  'chat.stream.done',
  'chat.stream.abort',
  'chat.tool',
  'chat.tool.start',
  'chat.tool.delta',
  'chat.tool.full.result',
  'chat.run.items',
  'chat.spawn.start',
  'chat.spawn.end',
  'chat.history',
  'session.sync.result',
  'draft.changed',
  'chat.command.pending',
  'chat.command.result',
  'chat.send.queued',
  'chat.send.acked',
  'chat.cleared',
  'session.list.result',
  'session.workspace.set.result',
  'commands.list.result',
  'files.list.result',
  'diag.snapshot.result',
  'diag.report.result',
  'logs.tail.result',
  'voice.mode.result',
  'uiPrefs.result',
  'update.result',
  'model.list.result',
  'model.refresh.result',
  'model.endpoints.result',
  'skills.list.result',
  'tools.list.result',
  'workspaces.list.result',
  'model.result',
  'agents.config.result',
  'instructions.list.result',
  'instructions.file',
  'instructions.saved',
  'mcp.list.result',
  'agents.file.result',
  'agents.file.saved',
  'config.result',
  'config.saved',
  'status.result',
  'session.instructions.result',
  'jobs.list.result',
  'browser.info.result',
  'jobs.runs.result',
  'subagents.list.result',
  'subagents.callers.result',
  'subagents.handoff.result',
  'notifications.info',
  'hello',
  'tags.result',
  'providers.env.result',
  'chat.transcript',
  'approval.request',
  'approval.pending',
  'approval.resolved',
  'approval.history.result',
  'question.ask',
  'question.pending',
  'question.resolved',
  'undo.prompt',
  'undo.resolved',
  'error',
]);

/** The list above as a lookup, written once so the type above is the only thing to read. */
function objectOf<T extends string>(names: T[]): Record<T, true> {
  return names.reduce((acc, name) => ({ ...acc, [name]: true }), {} as Record<T, true>);
}

export function parseServerFrame(raw: string): ServerFrame | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    // `hasOwnProperty`, never `in`: a frame announcing itself as "toString" would walk in.
    if (!Object.prototype.hasOwnProperty.call(FRAME_TYPES, parsed.type)) {
      return null;
    }
    return parsed as ServerFrame;
  } catch {
    return null;
  }
}

/**
 * `parentThreadId` is only for a send addressed to a sub-agent handle: it names the conversation
 * the roster was read from, which the server matches against the sub-agent's recorded parent to
 * decide reachability. Omitted everywhere else.
 */
export function encodeChatSend(
  id: string,
  text: string,
  threadId: string,
  attachments?: AttachmentRef[],
  parentThreadId?: string,
  location?: LocationInput,
): string {
  return JSON.stringify({
    type: 'chat.send',
    id,
    text,
    threadId,
    ...(attachments?.length ? { attachments } : {}),
    ...(parentThreadId ? { parentThreadId } : {}),
    ...(location ? { location } : {}),
  });
}

/** Asks the server to geocode a staged location for the composer preview; nothing is persisted. */
export function encodeLocationPreview(id: string, location: LocationInput): string {
  return JSON.stringify({ type: 'location.preview', id, location });
}

export function encodeSubAgentsList(threadId: string): string {
  return JSON.stringify({ type: 'subagents.list', threadId });
}
export function encodeSubAgentKill(threadId: string, parentThreadId: string): string {
  return JSON.stringify({ type: 'subagents.kill', threadId, parentThreadId });
}

export function encodeSubAgentReset(threadId: string, parentThreadId: string): string {
  return JSON.stringify({ type: 'subagents.reset', threadId, parentThreadId });
}

/** Which conversations this sub-agent has worked for, as seen from `parentThreadId`. */
export function encodeSubAgentCallers(threadId: string, parentThreadId: string): string {
  return JSON.stringify({ type: 'subagents.callers', threadId, parentThreadId });
}

/**
 * Hands one of the sub-agent's answers back to conversations that called it.
 *
 * `targets` are session ids taken from `subagents.callers.result` and re-checked there server-side,
 * never free-form. `mode` decides whether each target runs on the text (`ask`) or merely files it
 * (`note`). An absent `messageId` means the sub-agent's last answer.
 */
export function encodeSubAgentHandoff(
  threadId: string,
  parentThreadId: string,
  targets: readonly string[],
  mode: 'ask' | 'note',
  messageId?: string,
  note?: string,
): string {
  return JSON.stringify({
    type: 'subagents.handoff',
    threadId,
    parentThreadId,
    targets,
    mode,
    ...(messageId ? { messageId } : {}),
    ...(note ? { note } : {}),
  });
}

export type VoiceMode = 'cloud' | 'local' | 'auto';

/** Mirrors the server cap, so the field cannot accept a name that would come back truncated. */
export const MAX_TITLE_LENGTH = 60;

export function encodeSessionRename(threadId: string, title: string): string {
  return JSON.stringify({ type: 'session.rename', threadId, title });
}

export function encodeSessionWorkspaceSet(threadId: string, workspace: string): string {
  return JSON.stringify({ type: 'session.workspace.set', threadId, workspace });
}

export function encodeVoiceModeGet(): string {
  return JSON.stringify({ type: 'voice.mode.get' });
}

export function encodeVoiceModeSet(mode: VoiceMode): string {
  return JSON.stringify({ type: 'voice.mode.set', mode });
}

export function encodeUiPrefsGet(): string {
  return JSON.stringify({ type: 'uiPrefs.get' });
}

export function encodeUiPrefsSet(prefs: { expandTools?: boolean; expandReasoning?: boolean }): string {
  return JSON.stringify({ type: 'uiPrefs.set', prefs });
}

/** Carries nothing: what to install is the registry's answer, not this device's opinion. */
export function encodeUpdateRun(): string {
  return JSON.stringify({ type: 'update.run' });
}

export function encodeSessionList(): string {
  return JSON.stringify({ type: 'session.list' });
}

export function encodeCommandsList(): string {
  return JSON.stringify({ type: 'commands.list' });
}

export function encodeFilesList(threadId: string): string {
  return JSON.stringify({ type: 'files.list', threadId });
}

export function encodeFileDelete(threadId: string, id: string): string {
  return JSON.stringify({ type: 'files.delete', threadId, id });
}

export function encodeDiagSnapshot(threadId: string): string {
  return JSON.stringify({ type: 'diag.snapshot', threadId });
}

export function encodeDiagReport(reports: DiagReport[]): string {
  return JSON.stringify({ type: 'diag.report', reports });
}

/** One post-mortem. `exit` entries come from Android, the others from the JS side. */
export interface DiagReport {
  kind: 'js' | 'render' | 'exit';
  at: number;
  message: string;
  stack?: string;
  appVersion?: string;
  reason?: string;
}

export interface LogsTailQuery {
  scope?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  run?: string;
  contains?: string;
  limit?: number;
}

export function encodeLogsTail(query: LogsTailQuery = {}): string {
  return JSON.stringify({ type: 'logs.tail', ...query });
}

/**
 * `before` is the server's count cursor, counted back from the newest message (0 = newest page);
 * `beforeId` is the id of the client's oldest held item, which the server prefers where
 * supported -- it survives growth and trimming (docs/session-log.md).
 */
export function encodeSessionHistory(threadId: string, limit = 50, before = 0, beforeId?: string): string {
  return JSON.stringify({
    type: 'session.history',
    threadId,
    limit,
    ...(before ? { before } : {}),
    ...(beforeId ? { beforeId } : {}),
    fold: FOLD_RUNS,
  });
}

/**
 * Whether this build accepts a finished run as a header instead of its work --
 * docs/run-hydration.md.
 *
 * Set on every page request rather than announced once, and set here rather than at the call
 * sites: understanding `role: 'run'` is a property of the bundle, not of the caller. Six places
 * ask for a sync and two for a history page, and one of them forgetting would quietly serve a
 * megabyte where the others serve tens of kilobytes. A server that predates the field ignores it.
 */
const FOLD_RUNS = true;

/**
 * Asks for the work a folded run row stands for -- docs/run-hydration.md.
 *
 * The range the row carries, not its run id: a run cut by a page boundary folds into one row per
 * page, and asking by run would splice back items this client already holds.
 */
export function encodeRunItems(threadId: string, fromId: string, untilId: string): string {
  return JSON.stringify({ type: 'session.run.items', threadId, fromId, untilId });
}

/**
 * Asks for one tool card's output in full. Sent when a reader opens a block the card is only
 * showing clipped, never on its own: the clip exists so a reconnect does not replay every byte
 * every tool ever printed.
 */
export function encodeToolFull(threadId: string, id: string): string {
  return JSON.stringify({ type: 'chat.tool.full', threadId, id });
}

export function encodeSessionArchive(threadId: string): string {
  return JSON.stringify({ type: 'session.archive', threadId });
}

export function encodeSessionUnarchive(threadId: string): string {
  return JSON.stringify({ type: 'session.unarchive', threadId });
}

export function encodeSessionDelete(threadId: string): string {
  return JSON.stringify({ type: 'session.delete', threadId });
}

/** Pins the conversation at the end of the pinned list, or unpins it. */
export function encodeSessionPin(threadId: string, pinned: boolean): string {
  return JSON.stringify({ type: 'session.pin', threadId, pinned });
}

/** The pinned list as the owner just dropped it. Ids absent from it keep their pin. */
export function encodeSessionPinOrder(threadIds: string[]): string {
  return JSON.stringify({ type: 'session.pin.order', threadIds });
}

/** What is typed and not sent, for the owner's other devices. Empty text clears it. */
export function encodeDraftSet(threadId: string, text: string): string {
  return JSON.stringify({ type: 'draft.set', threadId, text });
}

export function encodeApprovalResponse(id: string, decision: ApprovalDecision): string {
  return JSON.stringify({ type: 'approval.response', id, decision });
}

/** The owner answered a question card: one array of selections per question, in order. */
export function encodeQuestionReply(id: string, answers: string[][]): string {
  return JSON.stringify({ type: 'question.reply', id, answers });
}

/** The owner picked a mode in the undo sheet. */
export function encodeUndoChoose(id: string, mode: 'soft' | 'hard'): string {
  return JSON.stringify({ type: 'undo.choose', id, mode });
}

/** The owner dismissed the undo sheet. */
export function encodeUndoCancel(id: string): string {
  return JSON.stringify({ type: 'undo.cancel', id });
}

export function encodeApprovalHistory(options: { threadId?: string; limit?: number; before?: string } = {}): string {
  return JSON.stringify({ type: 'approval.history', ...options });
}

export function encodeModelList(): string {
  return JSON.stringify({ type: 'model.list' });
}

/** Asks the server to re-run provider discovery now, rather than at its next six-hour cycle. */
export function encodeModelRefresh(): string {
  return JSON.stringify({ type: 'model.refresh' });
}

/** Asks for the routes of one model. Sent when the picker enters the routing step, never before:
 *  the server calls OpenRouter for it, and a catalogue-wide prefetch would be hundreds of calls. */
export function encodeModelEndpoints(model: string, sort?: RouteSort): string {
  return JSON.stringify({ type: 'model.endpoints', model, ...(sort ? { sort } : {}) });
}

/** One declaration of `llm.models`. Only the fields that differ from discovery need to travel:
 *  the server merges an override field by field, so an absent one keeps following the provider. */
export interface ModelDeclaration {
  id: string;
  label?: string;
  apiId?: string;
  provider?: string;
  group?: string;
  family?: string;
  vision?: boolean;
  context?: number;
  output?: number;
  supportsEffort?: boolean;
  effortLevels?: string[];
  thinkingAdaptive?: boolean;
  thinkingEnabled?: boolean;
  /** How long a request may go silent, in milliseconds. `0` disarms the server's timer. */
  timeoutMs?: number;
}

export function encodeModelsUpsert(entry: ModelDeclaration): string {
  return JSON.stringify({ type: 'models.upsert', ...entry });
}

/** Deletes a declaration. For an id discovery also serves, this resets it to the provider's own
 *  answer rather than removing the model. */
export function encodeModelsRemove(id: string): string {
  return JSON.stringify({ type: 'models.remove', id });
}

export function encodeSkillsList(): string {
  return JSON.stringify({ type: 'skills.list' });
}

/**
 * Moves or copies one skill directory between tiers. The server refuses a name already taken in
 * the target unless `overwrite` is set, so the app asks before it sends that flag. Answered with
 * a fresh `skills.list.result`.
 */
export function encodeSkillsTransfer(
  mode: 'copy' | 'move',
  skill: { source: SkillEntry['source']; name: string; workspace?: string },
  target: SkillTarget,
  overwrite?: boolean,
): string {
  return JSON.stringify({
    type: mode === 'move' ? 'skills.move' : 'skills.copy',
    source: skill.source,
    name: skill.name,
    ...(skill.workspace ? { workspace: skill.workspace } : {}),
    target: {
      source: target.source,
      ...(target.workspace ? { workspace: target.workspace } : {}),
    },
    ...(overwrite ? { overwrite: true } : {}),
  });
}

export function encodeToolsList(): string {
  return JSON.stringify({ type: 'tools.list' });
}

export function encodeMcpList(): string {
  return JSON.stringify({ type: 'mcp.list' });
}

export function encodeWorkspacesList(): string {
  return JSON.stringify({ type: 'workspaces.list' });
}

export function encodeWorkspacesAdd(key: string, path: string): string {
  return JSON.stringify({ type: 'workspaces.add', key, path });
}

export function encodeWorkspacesRemove(key: string): string {
  return JSON.stringify({ type: 'workspaces.remove', key });
}

export function encodeWorkspacesRename(from: string, to: string): string {
  return JSON.stringify({ type: 'workspaces.rename', from, to });
}

export function encodeWorkspacesSetPath(key: string, path: string): string {
  return JSON.stringify({ type: 'workspaces.path.set', key, path });
}

export function encodeModelGet(threadId: string): string {
  return JSON.stringify({ type: 'model.get', threadId });
}

export function encodeModelSet(threadId: string, model: string): string {
  return JSON.stringify({ type: 'model.set', threadId, model });
}

export function encodeModelEffortSet(threadId: string, level: string): string {
  return JSON.stringify({ type: 'model.effort.set', threadId, level });
}

/** `'full'` hands the conversation back to the model's own window; a number is a ceiling. */
export function encodeModelContextSet(threadId: string, choice: number | 'full'): string {
  return JSON.stringify({ type: 'model.context.set', threadId, choice });
}

export function encodeAgentsConfigGet(): string {
  return JSON.stringify({ type: 'agents.config.get' });
}

export function encodeTagsList(): string {
  return JSON.stringify({ type: 'tags.list' });
}

/** `effort`/`contextCap` omitted reset the tag's pin on those axes. */
export function encodeTagsUpsert(
  name: string,
  model: string,
  effort: string | undefined,
  contextCap: number | undefined,
): string {
  return JSON.stringify({
    type: 'tags.upsert',
    name,
    model,
    ...(effort ? { effort } : {}),
    ...(contextCap === undefined ? {} : { contextCap }),
  });
}

export function encodeTagsRouteUpsert(
  name: string,
  route: TagRouteCandidate[],
  fallbackToGlobalDefault: boolean,
): string {
  return JSON.stringify({
    type: 'tags.upsert',
    name,
    route,
    ...(fallbackToGlobalDefault ? { fallbackToGlobalDefault: true } : {}),
  });
}

export function encodeTagsDelete(name: string): string {
  return JSON.stringify({ type: 'tags.delete', name });
}

export function encodeProvidersUpsert(
  key: string,
  patch: Omit<ProviderPatch, 'type' | 'key'>,
): string {
  return JSON.stringify({ type: 'providers.upsert', key, ...patch });
}

export function encodeProvidersRemove(key: string): string {
  return JSON.stringify({ type: 'providers.remove', key });
}

export function encodeProvidersRename(from: string, to: string): string {
  return JSON.stringify({ type: 'providers.rename', from, to });
}

/** The one frame that carries a secret value; it is never logged or echoed anywhere. */
export function encodeProvidersEnvSet(name: string, value: string): string {
  return JSON.stringify({ type: 'providers.env.set', name, value });
}

export function encodeProvidersEnvRename(from: string, to: string): string {
  return JSON.stringify({ type: 'providers.env.rename', from, to });
}

export function encodeProvidersEnvRemove(name: string): string {
  return JSON.stringify({ type: 'providers.env.remove', name });
}

export function encodeProvidersEnvList(): string {
  return JSON.stringify({ type: 'providers.env.list' });
}

export function encodeInstructionsList(): string {
  return JSON.stringify({ type: 'instructions.list' });
}

export function encodeInstructionsGet(workspace: string, file: string): string {
  return JSON.stringify({ type: 'instructions.get', workspace, file });
}

/**
 * A nested AGENTS.md. `threadId` is what authorises an absolute path: the server only accepts one
 * that the named conversation actually read, so the session's trace is the allowlist. A relative
 * path stays fenced by the workspace root and needs no thread.
 */
export function encodeInstructionsGetNested(workspace: string, nested: string, threadId?: string): string {
  return JSON.stringify(
    threadId === undefined
      ? { type: 'instructions.get', workspace, nested }
      : { type: 'instructions.get', workspace, nested, threadId },
  );
}

/** Same addressing as the read, and the sha is never omitted: a nested file is edited, not created. */
export function encodeInstructionsSetNested(
  workspace: string,
  nested: string,
  content: string,
  sha: string,
  threadId?: string,
): string {
  return JSON.stringify({
    type: 'instructions.set',
    workspace,
    file: '',
    nested,
    content,
    sha,
    ...(threadId === undefined ? {} : { threadId }),
  });
}

export function encodeSessionInstructionsGet(threadId: string): string {
  return JSON.stringify({ type: 'session.instructions.get', threadId });
}

export function encodeSessionInstructionsSet(threadId: string, patch: SessionInstructionPatch): string {
  return JSON.stringify({ type: 'session.instructions.set', threadId, patch });
}

/**
 * `sha` is the one the editor loaded. Omitting it means "create this override": the server
 * refuses if the file already exists, the same way it refuses a stale sha.
 */
export function encodeInstructionsSet(
  workspace: string,
  file: string,
  content: string,
  sha: string | undefined,
): string {
  return JSON.stringify(
    sha === undefined
      ? { type: 'instructions.set', workspace, file, content }
      : { type: 'instructions.set', workspace, file, content, sha },
  );
}

/**
 * The layer screen always sends explicit values: "default" and false are the no-op resets, and
 * the server answers with a fresh listing rather than an echo.
 */
export function encodeInstructionsLayerSet(
  workspace: string,
  file: string,
  inherit: string,
  off: boolean,
): string {
  return JSON.stringify({ type: 'instructions.layer.set', workspace, file, inherit, off });
}

/**
 * Pins the model (and optionally the effort) of an agent, or of the global default when
 * `agent` is "global". `effort` is "" to remove the pin, a level to set it, and absent to
 * leave the target's own value alone.
 */
export function encodeAgentsModelSet(agent: string, model: string, effort?: string): string {
  return JSON.stringify(
    effort === undefined
      ? { type: 'agents.model.set', agent, model }
      : { type: 'agents.model.set', agent, model, effort },
  );
}

export function encodeAgentsModelClear(agent: string): string {
  return JSON.stringify({ type: 'agents.model.clear', agent });
}

/** Pins the vision fallback model; "" removes the pin. */
export function encodeAgentsFallbackSet(model: string): string {
  return JSON.stringify({ type: 'agents.fallback.set', model });
}

export function encodeAgentsScopeSet(
  agent: string,
  field: 'skills' | 'mcp',
  mode: AgentScopeMode,
  names: string[],
): string {
  return JSON.stringify(
    mode === 'list'
      ? { type: 'agents.scope.set', agent, field, mode, names }
      : { type: 'agents.scope.set', agent, field, mode },
  );
}

export function encodeAgentsWorkspaceSet(agent: string, workspace: string | null): string {
  return JSON.stringify({ type: 'agents.workspace.set', agent, workspace });
}

export function encodeAgentsIterationsSet(agent: string, value: number | null): string {
  return JSON.stringify({ type: 'agents.iterations.set', agent, value });
}

export function encodeAgentsContextCapSet(agent: string, value: number | null): string {
  return JSON.stringify({ type: 'agents.contextcap.set', agent, value });
}

export function encodeAgentFileGet(agent: string): string {
  return JSON.stringify({ type: 'agents.file.get', agent });
}

export interface AgentFileFieldsOut {
  sha: string;
  description: string;
  base?: 'general' | 'research';
  tools?: string[];
  skillsMode: FileScopeMode;
  skills?: string[];
  mcpMode: FileScopeMode;
  mcp?: string[];
  model?: string;
  workspace?: string;
  maxIterations?: number;
  contextCap?: number;
  instructions?: string[];
  prompt: string;
}

export function encodeAgentFileSet(agent: string, fields: AgentFileFieldsOut): string {
  return JSON.stringify({ type: 'agents.file.set', agent, ...fields });
}

export function encodeAgentFileCreate(name: string, description: string): string {
  return JSON.stringify({ type: 'agents.file.create', name, description });
}

export function encodeAgentFileDelete(agent: string): string {
  return JSON.stringify({ type: 'agents.file.delete', agent });
}

export function encodeToolsToggle(name: string, disabled: boolean): string {
  return JSON.stringify({ type: 'tools.toggle', name, disabled });
}

export function encodeMcpAdd(
  name: string,
  transport: 'stdio' | 'sse' | 'http',
  spec: { command?: string; args?: string[]; url?: string },
): string {
  return JSON.stringify({
    type: 'mcp.add',
    name,
    transport,
    ...(spec.command ? { command: spec.command } : {}),
    ...(spec.args && spec.args.length > 0 ? { args: spec.args } : {}),
    ...(spec.url ? { url: spec.url } : {}),
  });
}

export function encodeMcpRemove(name: string): string {
  return JSON.stringify({ type: 'mcp.remove', name });
}

export function encodeMcpEnable(name: string, enabled: boolean): string {
  return JSON.stringify({ type: 'mcp.enable', name, enabled });
}

export function encodeConfigGet(): string {
  return JSON.stringify({ type: 'config.get' });
}

export function encodeConfigSet(sha: string, content: string): string {
  return JSON.stringify({ type: 'config.set', sha, content });
}

export function encodeChatStop(threadId: string): string {
  return JSON.stringify({ type: 'chat.stop', threadId });
}

/** The fullscreen status page of a conversation, asked when the menu opens it. */
export function encodeStatusGet(threadId: string): string {
  return JSON.stringify({ type: 'status.get', threadId });
}

export interface JobFieldsOut {
  id?: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  /** Suppresses this job's push notifications, successes and failures alike. */
  silent: boolean;
  model?: string;
  /** The job's own effort pin; "" clears it so the cron agent's setting applies. */
  effort?: string;
  workspace?: string;
  skills: JobScope;
  mcp: JobScope;
  tools: JobScope;
}

/** Lists the scheduled tasks; every mutation answers with the same fresh listing. */
export function encodeJobsList(): string {
  return JSON.stringify({ type: 'jobs.list' });
}

/** Asks for the browser's connection details and current state. Read-only, no arguments. */
export function encodeBrowserInfo(): string {
  return JSON.stringify({ type: 'browser.info' });
}

/** Creates (no id) or updates a job. The schedule is parsed server-side. */
export function encodeJobsSave(fields: JobFieldsOut): string {
  const frame: Record<string, unknown> = { type: 'jobs.save' };
  if (fields.id) frame.id = fields.id;
  frame.name = fields.name;
  frame.prompt = fields.prompt;
  frame.schedule = fields.schedule;
  frame.enabled = fields.enabled;
  frame.silent = fields.silent;
  if (fields.model) frame.model = fields.model;
  // An empty string is a deliberate clear on update, so it must reach the server.
  if (fields.effort !== undefined) frame.effort = fields.effort;
  if (fields.workspace) frame.workspace = fields.workspace;
  frame.skills = fields.skills;
  frame.mcp = fields.mcp;
  frame.tools = fields.tools;
  return JSON.stringify(frame);
}

export function encodeJobsDelete(id: string): string {
  return JSON.stringify({ type: 'jobs.delete', id });
}

/** Asks for the run sessions of one job, newest first. */
export function encodeJobsRuns(jobId: string): string {
  return JSON.stringify({ type: 'jobs.runs', jobId });
}

/**
 * Hands the device's UnifiedPush subscription to the server. An empty endpoint unregisters
 * the device, which is how a distributor change or a revoked registration is reported.
 */
export function encodeNotificationsRegister(subscription: {
  endpoint: string;
  pubKey?: string;
  auth?: string;
}): string {
  return JSON.stringify({
    type: 'notifications.register',
    endpoint: subscription.endpoint,
    ...(subscription.pubKey ? { pubKey: subscription.pubKey } : {}),
    ...(subscription.auth ? { auth: subscription.auth } : {}),
  });
}

/**
 * Reports whether the app is on screen and which thread it is showing, so the server can skip
 * the run-completion notification for a thread the user is already watching.
 */
export function encodeNotificationsState(state: { foreground: boolean; threadId?: string }): string {
  return JSON.stringify({
    type: 'notifications.state',
    foreground: state.foreground,
    ...(state.threadId ? { threadId: state.threadId } : {}),
  });
}

// --- Session sync (lot 4) ---

/**
 * Delta sync for a conversation. Replaces chat.history for the live path; history remains for
 * pagination backwards.
 *
 * Three response shapes:
 * - `reset` absent: delta to append, same branch
 * - `reset: "unknown-cursor"`: cursor not found, entries is a fresh page
 * - `reset: "branch-switch"`: server's leaf diverged from client's, entries is a fresh page
 */
export interface SessionSyncResultFrame {
  type: 'session.sync.result';
  threadId: string;
  entries: HistoryEntry[];
  /** The current leaf of the session (where the next append goes). */
  leaf: string | null;
  /** The id of the last entry in the file (may differ from leaf after a branch). */
  head: string | null;
  activeRun?: boolean;
  /** Why the delta was replaced by a full page. Absent means append. */
  reset?: 'unknown-cursor' | 'branch-switch';
  /** Whether entries were truncated by the limit. */
  truncated?: boolean;
  /** True when the served window was the newest page (fresh open or reset): older work exists. */
  hasMore?: boolean;
  /** Count of entries before that window; where the next older page starts. */
  nextBefore?: number;
}

/**
 * Asks for entries since `since`, on the branch ending at `leaf`.
 *
 * `since` is the last entry id the client has; null/absent for a fresh open.
 * `leaf` is what the client is showing; absent means "whatever the server has".
 */
export function encodeSessionSync(threadId: string, since?: string | null, leaf?: string): string {
  return JSON.stringify({
    type: 'session.sync',
    threadId,
    ...(since !== undefined ? { since } : {}),
    ...(leaf ? { leaf } : {}),
    // Only the window that replaces the thread is ever folded server-side; a delta is never.
    fold: FOLD_RUNS,
  });
}
