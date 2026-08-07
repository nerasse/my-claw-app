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
  | 'instructions';

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

export function encodeWorkspacesList(): string {
  return JSON.stringify({ type: 'workspaces.list' });
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

export function encodeChatStop(threadId: string): string {
  return JSON.stringify({ type: 'chat.stop', threadId });
}

