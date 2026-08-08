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
}

export interface ToolCallFrame extends ToolCallPayload {
  type: 'chat.tool';
  threadId: string;
  turnId: string;
  ts: string;
}

export type HistoryEntry =
  | {
      id: string;
      role: 'user' | 'assistant';
      text: string;
      ts: string;
      attachments?: AttachmentMeta[];
      /** Words per recording id, so each replayed bubble matches the live one. */
      transcripts?: Record<string, string>;
    }
  | ({ role: 'tool'; ts: string } & ToolCallPayload);

export interface ChatHistoryFrame {
  type: 'chat.history';
  threadId: string;
  messages: HistoryEntry[];
}

export interface SessionSummary {
  threadId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  lastActiveAt: string;
  /** Filed away by the owner: shown in the archived list instead of the drawer, never deleted. */
  archived?: boolean;
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

export interface ApprovalRequestFrame {
  type: 'approval.request';
  id: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  replyToId?: string;
  expiresAt: number;
}

export interface DiagSnapshotResultFrame {
  type: 'diag.snapshot.result';
  text: string;
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

export interface ModelOption {
  id: string;
  label: string;
  /** "/"-separated menu path; the picker renders groups the way the server's /model does. */
  group?: string;
  /** Provider key this model belongs to, so the app can group models by provider. */
  provider?: string;
}

export interface EffortState {
  /** The level in effect ("" when the model discards effort). */
  level: string;
  /** Levels the active model accepts; empty means no choice is offered. */
  levels: string[];
  supported: boolean;
}

export interface ModelListResultFrame {
  type: 'model.list.result';
  models: ModelOption[];
  defaultModel: string;
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
  /** The model that will run on this thread: override or the configured default. */
  model: string;
  defaultModel: string;
  effort: EffortState;
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
    current: string;
    /** The agent's configured default, present when the session overrides it. */
    configDefault?: string;
    effort?: string;
    selfHosted: boolean;
    contextLimit: number;
    /** Why the window is what it is ("declared", "capped from …", …). */
    contextNotes: string[];
  };
  context: {
    /** The provider's count on the last call; undefined until a call is recorded. */
    measured?: { tokens: number; pctOfLimit: number };
    estimated: number;
    /** What actually drives auto-compaction. */
    occupied: number;
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
    sdkSessionId?: string;
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

/** The thread's history is gone server-side; the app drops its copy. */
export interface ChatClearedFrame {
  type: 'chat.cleared';
  threadId: string;
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
  | 'status';

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

/** A configured provider, for display only: never a secret, only whether its env key is set. */
export interface ProviderInfo {
  key: string;
  type: string;
  group?: string;
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
  providers: ProviderInfo[];
  agents: AgentInfo[];
}

/** Where the content of a prompt file comes from. See docs/instructions-page.md on the server. */
export type InstructionOrigin = 'own' | 'inherited' | 'fallback';

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
  /** The editable names, so the app never hardcodes the list the server enforces. */
  files: string[];
  maxBytes: number;
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

export type ServerFrame =
  | ChatMessageFrame
  | StreamStartFrame
  | StreamDeltaFrame
  | StreamDoneFrame
  | StreamAbortFrame
  | ToolCallFrame
  | ChatHistoryFrame
  | SessionListResultFrame
  | CommandsListResultFrame
  | FilesListResultFrame
  | DiagSnapshotResultFrame
  | LogsTailResultFrame
  | VoiceModeResultFrame
  | ModelListResultFrame
  | SkillsListResultFrame
  | ToolsListResultFrame
  | WorkspacesListResultFrame
  | ModelResultFrame
  | CommandResultFrame
  | ChatClearedFrame
  | TranscriptFrame
  | ApprovalRequestFrame
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
  | ErrorFrame;

const FRAME_TYPES = new Set([
  'chat.message',
  'chat.stream.start',
  'chat.stream.delta',
  'chat.stream.done',
  'chat.stream.abort',
  'chat.tool',
  'chat.history',
  'chat.command.result',
  'chat.cleared',
  'session.list.result',
  'commands.list.result',
  'files.list.result',
  'diag.snapshot.result',
  'logs.tail.result',
  'voice.mode.result',
  'model.list.result',
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
  'chat.transcript',
  'approval.request',
  'error',
]);

export function parseServerFrame(raw: string): ServerFrame | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    if (!FRAME_TYPES.has(parsed.type)) {
      return null;
    }
    return parsed as ServerFrame;
  } catch {
    return null;
  }
}

export function encodeChatSend(id: string, text: string, threadId: string, attachments?: AttachmentRef[]): string {
  return JSON.stringify(attachments?.length
    ? { type: 'chat.send', id, text, threadId, attachments }
    : { type: 'chat.send', id, text, threadId });
}

export type VoiceMode = 'cloud' | 'local' | 'auto';

/** Mirrors the server cap, so the field cannot accept a name that would come back truncated. */
export const MAX_TITLE_LENGTH = 60;

export function encodeSessionRename(threadId: string, title: string): string {
  return JSON.stringify({ type: 'session.rename', threadId, title });
}

export function encodeVoiceModeGet(): string {
  return JSON.stringify({ type: 'voice.mode.get' });
}

export function encodeVoiceModeSet(mode: VoiceMode): string {
  return JSON.stringify({ type: 'voice.mode.set', mode });
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

export function encodeSessionHistory(threadId: string, limit = 50): string {
  return JSON.stringify({ type: 'session.history', threadId, limit });
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

export function encodeApprovalResponse(id: string, accepted: boolean): string {
  return JSON.stringify({ type: 'approval.response', id, accepted });
}

export function encodeModelList(): string {
  return JSON.stringify({ type: 'model.list' });
}

export function encodeSkillsList(): string {
  return JSON.stringify({ type: 'skills.list' });
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

export function encodeAgentsConfigGet(): string {
  return JSON.stringify({ type: 'agents.config.get' });
}

export function encodeInstructionsList(): string {
  return JSON.stringify({ type: 'instructions.list' });
}

export function encodeInstructionsGet(workspace: string, file: string): string {
  return JSON.stringify({ type: 'instructions.get', workspace, file });
}

export function encodeInstructionsGetNested(workspace: string, nested: string): string {
  return JSON.stringify({ type: 'instructions.get', workspace, nested });
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

export function encodeAgentsModelSet(agent: string, model: string): string {
  return JSON.stringify({ type: 'agents.model.set', agent, model });
}

export function encodeAgentsModelClear(agent: string): string {
  return JSON.stringify({ type: 'agents.model.clear', agent });
}

/** Empty level removes the global effort so model/provider defaults apply again. */
export function encodeAgentsEffortSet(level: string): string {
  return JSON.stringify({ type: 'agents.effort.set', level });
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

