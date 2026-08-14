import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { connection } from '../core/connection';
import {
  chatStore,
  useChatItems,
  useActiveRun,
  useHistoryPage,
  useUnreadThreads,
  type TextItem,
} from '../core/chat';
import { subAgentStore, groupRoster, useSubAgents } from '../core/subagents';
import { sessionStore, useArchivedSessions, useSessions } from '../core/sessions';
import { pinnedStore, usePinnedOrder } from '../core/pinned';
import { commandStore, parseTagCommand } from '../core/commands';
import { prefs } from '../core/prefs';
import { acknowledgeDiagnostics, flushDiagnostics, loadDiagnostics } from '../core/diagnostics';
import {
  encodeApprovalResponse,
  encodeAgentsConfigGet,
  encodeInstructionsGet,
  encodeInstructionsGetNested,
  encodeInstructionsLayerSet,
  encodeInstructionsList,
  encodeInstructionsSet,
  encodeAgentsModelClear,
  encodeAgentsModelSet,
  encodeAgentsFallbackSet,
  encodeAgentsScopeSet,
  encodeAgentsWorkspaceSet,
  encodeAgentsIterationsSet,
  encodeAgentsContextCapSet,
  encodeAgentFileGet,
  encodeAgentFileSet,
  encodeAgentFileCreate,
  encodeAgentFileDelete,
  encodeChatSend,
  encodeChatStop,
  encodeStatusGet,
  encodeCommandsList,
  encodeConfigGet,
  encodeConfigSet,
  encodeDiagSnapshot,
  encodeFileDelete,
  encodeFilesList,
  encodeLogsTail,
  encodeMcpAdd,
  encodeMcpEnable,
  encodeMcpList,
  encodeMcpRemove,
  encodeModelGet,
  encodeModelList,
  encodeSessionArchive,
  encodeSessionDelete,
  encodeSessionHistory,
  encodeSessionList,
  encodeSessionRename,
  encodeSessionWorkspaceSet,
  encodeSessionUnarchive,
  encodeSkillsList,
  encodeSkillsTransfer,
  encodeToolsList,
  encodeToolsToggle,
  encodeWorkspacesList,
  encodeWorkspacesAdd,
  encodeWorkspacesRemove,
  encodeWorkspacesRename,
  encodeWorkspacesSetPath,
  encodeJobsList,
  encodeJobsSave,
  encodeJobsDelete,
  encodeJobsRuns,
  encodeVoiceModeGet,
  encodeVoiceModeSet,
  MAX_TITLE_LENGTH,
  type AgentFileFieldsOut,
  type ApprovalRequestFrame,
  type AgentsConfigResultFrame,
  type FileScopeMode,
  type JobEntry,
  type SubAgentEntry,
  type JobRunEntry,
  type JobFieldsOut,
  type LogsTailQuery,
  type McpEntry,
  type ModelOption,
  type SessionFileMeta,
  type SessionSummary,
  type SkillEntry,
  type SkillTarget,
  type ToolEntry,
  type VoiceMode,
  type VoiceModeResultFrame,
  type LocationInput,
  type WorkspaceEntry,
  encodeNotificationsRegister,
  encodeNotificationsState,
  encodeTagsDelete,
  encodeTagsList,
  encodeSubAgentsList,
  encodeSubAgentKill,
  encodeSubAgentReset,
  encodeTagsUpsert,
  encodeProvidersEnvList,
  encodeProvidersEnvRemove,
  encodeProvidersEnvRename,
  encodeProvidersEnvSet,
  encodeProvidersRemove,
  encodeProvidersRename,
  encodeProvidersUpsert,
} from '../core/protocol';
import {
  parseNotificationLink,
  pushSupported,
  registerForPush,
  resetPushRegistration,
  subscribeToPushRegistration,
} from '../core/notifications';
import { modelStore, useModelCatalog, useThreadModel } from '../core/model';
import { jobsStore } from '../core/jobs';
import { agentsStore, useAgentsConfig } from '../core/agents';
import { tagsStore, useTags } from '../core/tags';
import { agentsFileStore, useAgentsFile } from '../core/agentsFile';
import { instructionsStore, useInstructions } from '../core/instructions';
import { WorkspaceScreen } from './WorkspaceScreen';
import { layerOfFile } from '../core/layers';
import { InstructionLayerScreen } from './InstructionLayerScreen';
import { InstructionEditorScreen } from './InstructionEditorScreen';
import { skillUrl } from '../core/skills';
import { getDeviceInfo, type DeviceInfo } from '../core/device';
import { deviceBridge } from '../core/nativeBridge';
import type { OutgoingAttachment } from '../core/upload';
import type { WsStatusPayload } from '../core/types';
import { httpOrigin, uuid } from '../core/utils';
import { ChatScreen } from './ChatScreen';
import { SettingsScreen } from './SettingsScreen';
import { GeneralSettingsScreen } from './GeneralSettingsScreen';
import { OtherSettingsScreen } from './OtherSettingsScreen';
import { AgentsSettingsScreen } from './AgentsSettingsScreen';
import { TagsScreen } from './TagsScreen';
import { AgentDetailScreen } from './AgentDetailScreen';
import { AgentFileScreen } from './AgentFileScreen';
import { ScopeEditorScreen, type ScopeMode } from './ScopeEditorScreen';
import { WorkspacePickerScreen } from './WorkspacePickerScreen';
import { NumberEditorScreen } from './NumberEditorScreen';
import { NewAgentScreen } from './NewAgentScreen';
import { McpsScreen } from './McpsScreen';
import { ConfigScreen, type ConfigEditorState } from './ConfigScreen';
import { ProvidersScreen } from './ProvidersScreen';
import { ProviderScreen, type ProviderSearch } from './ProviderScreen';
import { ProviderEditScreen } from './ProviderEditScreen';
import { ProviderEnvScreen } from './ProviderEnvScreen';
import { providersEnvStore, useProvidersEnv } from '../core/providers';
import { locationPreview } from '../core/locationPreview';
import { EmptyCategoryScreen } from './EmptyCategoryScreen';
import { SkillsScreen } from './SkillsScreen';
import { ToolsScreen } from './ToolsScreen';
import { SkillViewer } from './SkillViewer';
import { WorkspacesScreen } from './WorkspacesScreen';
import { FilesScreen } from './FilesScreen';
import { ImageViewer } from './ImageViewer';
import { TextViewer } from './TextViewer';
import { VideoViewer } from './VideoViewer';
import { FileViewer } from './FileViewer';
import { DiagnosticsScreen } from './DiagnosticsScreen';
import { ArchivesScreen } from './ArchivesScreen';
import { AgentsScreen } from './AgentsScreen';
import { StatusScreen } from './StatusScreen';
import { JobsScreen } from './JobsScreen';
import { JobsEditorScreen } from './JobsEditorScreen';
import { JobSessionsScreen } from './JobSessionsScreen';
import { Drawer } from './Drawer';
import { PromptSheet } from '../components/PromptSheet';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import { ModelPickerPage, ModelSheet, pickerBack, pickerStart, type PickerState } from '../components/ModelSheet';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useThemeControl } from '../theme/ThemeProvider';
import { statusStore } from '../core/status';

/** One page of replayed history, not a ceiling: scrolling past the oldest asks for the next. */
const HISTORY_LIMIT = 50;

/**
 * A frozen empty for the model list this shell hands to the provider page. A fresh `[]` reads the
 * same but is a new identity every render, which silently defeats the memo of whatever gets it.
 */
const EMPTY_MODELS: ModelOption[] = [];
Object.freeze(EMPTY_MODELS);

/** The config scope shape ("["*"]" for all, absent for inherit) as the editor's mode union. */
function scopeModeOf(scope: string[] | null | undefined): ScopeMode {
  if (!Array.isArray(scope)) return 'inherit';
  if (scope.includes('*')) return 'all';
  return 'list';
}

function scopeModeOfFile(mode: FileScopeMode): ScopeMode {
  return mode === 'absent' ? 'absent' : mode;
}

/** Names in a list that the live catalog no longer carries: the red section of a scope editor. */
function unknownOfList(names: string[], catalog: Array<{ name: string }>): string[] {
  const known = new Set(catalog.map(item => item.name));
  return names.filter(name => !known.has(name));
}

/**
 * The pages that call a configured name "removed" when it is missing from the skills or MCP
 * catalog. Naming them once is the point: an unfetched catalog is not evidence that a name is
 * gone, so a page that paints that verdict red has to be a page that asks for the list.
 */
const CATALOG_JUDGING_PAGES: readonly string[] = ['agents', 'agent', 'file', 'scope'];

function judgesCatalogNames(page: string): boolean {
  return CATALOG_JUDGING_PAGES.includes(page);
}

/**
 * The pages fed by `agents.config.result`: the agents stack, the provider stack, and the index,
 * whose rows carry live counts from the same snapshot. Naming them once is the point -- the
 * request used to live on the Agents page alone, so reaching Providers straight from the index
 * (its own category since it left the Agents page) showed an empty list and a count of zero.
 */
const AGENTS_CONFIG_PAGES: readonly string[] = [
  'index',
  'agents',
  'agent',
  'providers',
  'provider',
  'provider-edit',
  'provider-env',
];

function readsAgentsConfig(page: string): boolean {
  return AGENTS_CONFIG_PAGES.includes(page);
}

/**
 * The pages fed by `instructions.list.result`. The workspaces list needs it for the per-row
 * prompt summary, the workspace page for its file rows, and the layer screen for the ladder it
 * resolves against -- a page that shows the listing without asking for it shows an empty one,
 * which is how Providers ended up reading "0 providers" when it was reached from the index.
 */
const READS_INSTRUCTIONS_PAGES: ReadonlySet<string> = new Set(['workspaces', 'workspace', 'instruction-layer']);

/**
 * The model picker pointed at the server config instead of a session: "global" edits
 * llm.defaultModel, "fallback" edits llm.visionFallback, an agent key edits agents.<key>.llm.
 * The root option hands an agent back to its inheritance (clear), which is the "Use default"
 * of the chat picker in reverse.
 *
 * An agent pins its effort next to its model, and a window too, so the flow is model then
 * effort then window then confirm. Both steps are skipped when the staged model is a tag: the
 * tag pins the effort and the ceiling itself, so either one set here would be dead config, and
 * the confirmation names the tag's pin instead. Picking the full window removes the agent's own
 * cap, which is how it returns to the standing policy.
 *
 * The fallback target is the reverse of the default: it exists so image runs have somewhere
 * to go when the resolved model cannot take images, so only vision-capable models are on
 * offer, and the root option removes the pin (image runs then stay on the resolved model).
 *
 * Rendered as a full settings page: the picker replaces the agents list entirely, and its own
 * back entry walks the flow before leaving the page, so no config ever peeks over the list.
 */
function AgentModelPickerPage({
  target,
  config,
  state,
  onStateChange,
  onBack,
}: {
  /** "global", "fallback" or an agent key. */
  target: string;
  config: AgentsConfigResultFrame | null;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  /** Leaves the page; the flow's own back entry walks the steps first. */
  onBack: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const isFallback = target === 'fallback';
  const agent = !isFallback && target !== 'global' ? (config?.agents.find(entry => entry.key === target) ?? null) : null;
  const activeId = agent ? agent.model : isFallback ? config?.fallback ?? '' : config?.defaultModel ?? '';
  const defaultLabel =
    catalog.models.find(model => model.id === config?.defaultModel)?.label ??
    config?.defaultModel ??
    'global default';
  const orchestratorLabel =
    config?.agents.find(entry => entry.key === 'orchestrator')?.model ?? defaultLabel;

  return (
    <ModelPickerPage
      title={agent ? `Model for ${agent.label}` : isFallback ? 'Fallback model' : 'Default model'}
      backLabel={agent ? 'Back to the agent' : 'Back to the agents list'}
      models={isFallback ? catalog.models.filter(model => model.vision === true) : catalog.models}
      activeId={activeId}
      state={state}
      onStateChange={onStateChange}
      onClose={onBack}
      onCommit={choice => {
        if (isFallback) {
          connection.send(encodeAgentsFallbackSet(choice.model)).catch(() => {});
          return;
        }
        // undefined keeps the target's effort, null clears it, a level pins it.
        const effort = choice.effort === undefined ? undefined : choice.effort ?? '';
        connection.send(encodeAgentsModelSet(target, choice.model, effort)).catch(() => {});
        if (agent && choice.context !== undefined) {
          connection
            .send(encodeAgentsContextCapSet(agent.key, choice.context === 'full' ? null : choice.context))
            .catch(() => {});
        }
      }}
      skipPinsOnTag
      rootOption={
        agent
          ? {
              label:
                agent.inheritsFrom === 'orchestrator'
                  ? `Inherit orchestrator (${orchestratorLabel})`
                  : `Follow global default (${defaultLabel})`,
              selected: !agent.pinned,
              onPress: () => {
                connection.send(encodeAgentsModelClear(agent.key)).catch(() => {});
                onBack();
              },
            }
          : isFallback
            ? {
                label: 'No fallback',
                selected: !config?.fallback,
                onPress: () => {
                  connection.send(encodeAgentsFallbackSet('')).catch(() => {});
                  onBack();
                },
              }
            : null
      }
      effort={isFallback ? null : { current: agent ? agent.effort ?? '' : config?.defaultEffort ?? '' }}
      context={
        agent
          ? {
              ...(agent.contextCap === null || agent.contextCap === undefined || agent.contextCap === 0
                ? {}
                : { current: agent.contextCap }),
            }
          : null
      }
    />
  );
}

/**
 * The tag editor page: one pass over the three things a tag pins (model, effort, context
 * ceiling), applied as a single upsert on the confirmation step. Leaving the flow early
 * changes nothing, and the cap row on the tags page stays for a value the graduations do
 * not offer. Like the agent picker, it is a full page: the tags list is replaced entirely.
 */
function TagEditorPage({
  name,
  state,
  onStateChange,
  onBack,
}: {
  name: string;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  /** Leaves the page; the flow's own back entry walks the steps first. */
  onBack: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const { tags } = useTags();
  const tag = tags?.find(entry => entry.name === name) ?? null;

  return (
    <ModelPickerPage
      title={`Tag ${name}`}
      backLabel="Back to the tags list"
      // No tag entries: a tag pinning a tag reference is how cycles are born (self-pins crash
      // the server's resolver). Real provider models only; agents may still pin tags elsewhere.
      models={catalog.models.filter(model => !model.id.startsWith('tag:'))}
      activeId={tag?.model ?? ''}
      state={state}
      onStateChange={onStateChange}
      onClose={onBack}
      onCommit={choice => {
        // undefined keeps the tag's own pin, null clears it, a level pins it. The upsert
        // replaces the whole entry, so an omitted effort key is how a tag returns to "default".
        const effort = choice.effort === undefined ? tag?.effort : (choice.effort ?? undefined);
        // "full" means the tag pins no ceiling of its own, which is an absent contextCap.
        const cap =
          choice.context === undefined
            ? tag?.contextCap
            : choice.context === 'full'
              ? undefined
              : choice.context;
        connection.send(encodeTagsUpsert(name, choice.model, effort, cap)).catch(() => {});
        // The Tags group of the picker catalog and the provider-list row follow the server state.
        connection.send(encodeModelList()).catch(() => {});
        connection.send(encodeAgentsConfigGet()).catch(() => {});
      }}
      skipPinsOnTag
      effort={{ current: tag?.effort ?? '' }}
      context={{ ...(tag?.contextCap === undefined ? {} : { current: tag.contextCap }) }}
    />
  );
}

/**
 * A sub-agent handle is a thread id, but it is not a conversation: it must never be listed in the
 * drawer nor restored at boot, because reached that way it would open as a plain chat -- no parent
 * to go back to, and a send with no `parentThreadId`, which a private sub-agent refuses outright.
 */
function isSubAgentThread(threadId: string): boolean {
  return /^sub-[0-9a-f]{16}$/.test(threadId);
}

export function AppShell(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette, dark } = useTheme();
  const themeControl = useThemeControl();

  const [url, setUrl] = useState(prefs.get().serverUrl);
  const [status, setStatus] = useState<WsStatusPayload>({ state: 'idle' });
  /** The version the connected server announced (`hello` frame); null until it speaks. */
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  /** The running build's version name, read from the package once at boot. */
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which settings page is showing: the index lists the categories, every other value is a
   *  page under it, and back always walks one level up. */
  const [settingsPage, setSettingsPage] = useState<
    | 'index'
    | 'general'
    | 'agents'
    | 'agent'
    | 'providers'
    | 'provider'
    | 'provider-edit'
    | 'provider-env'
    | 'tags'
    | 'skills'
    | 'workspaces'
    | 'workspace'
    | 'instruction'
    | 'instruction-layer'
    | 'tools'
    | 'mcps'
    | 'other'
    | 'diagnostics'
    | 'scope'
    | 'workspace-picker'
    | 'number'
    | 'file'
    | 'newagent'
    | 'config'
    | 'model-picker'
    | 'tag-editor'
  >('index');
  /** The agent detail page shows this key, taken from the last agents.config.result. */
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  /** The provider page shows this key's models, filtered from the shared catalog. */
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  /** The provider form: create (no key yet) or edit (the key being renamed). */
  const [providerEdit, setProviderEdit] = useState<{ mode: 'create' | 'edit'; key: string | null } | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  /** The provider waiting for its delete confirmation, with the env key it may take with it. */
  const [providerToDelete, setProviderToDelete] = useState<{ key: string; keyEnv?: string } | null>(null);
  /** Which workspace the workspace page shows. The instruction editor and the layer screen hang
   *  under it, so it outlives them: back walks down to this page, not to a list. */
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('default');
  /** The workspace page is a page of the workspaces list, but the agent page links straight into
   *  the workspace it is pinned to: back has to return where the user came from. */
  const [workspaceFrom, setWorkspaceFrom] = useState<'workspaces' | 'agent'>('workspaces');
  /** The layer screen is reached from the workspace page only; one entry path, one back. */
  const [layerTarget, setLayerTarget] = useState<{ workspace: string; file: string } | null>(null);
  /** The model picker is open for "global" or an agent key: its group stack, walked by back. */
  const [agentModelFor, setAgentModelFor] = useState<string | null>(null);
  const [agentPicker, setAgentPicker] = useState<PickerState>(pickerStart);
  /**
   * The provider page's search box lives on that page, not here: it filters the longest list in
   * the app, and as shell state every keystroke redrew the whole tree. The back key still clears
   * it before leaving, and reaches it through this handle.
   */
  const providerSearch = useRef<ProviderSearch>({ query: '', clear: () => {} });
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [toolsMissing, setToolsMissing] = useState<string[]>([]);
  const [toolsSaving, setToolsSaving] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpEntry[]>([]);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  /** Which scope editor is open: skills or MCP, writing to the config override or to a file. */
  const [scopeEditor, setScopeEditor] = useState<{
    kind: 'skills' | 'mcp';
    target: 'config' | 'file';
  } | null>(null);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [workspacePickerAgent, setWorkspacePickerAgent] = useState<string | null>(null);
  const [numberEditor, setNumberEditor] = useState<{ field: 'iterations' | 'contextcap'; agent: string } | null>(null);
  /** The tag editor sheet: its group stack is walked by back, and the row to rename over it. */
  const [tagEditor, setTagEditor] = useState<{ name: string; picker: PickerState } | null>(null);
  /** The context-cap number page for one tag, opened from the tags page. */
  const [tagContextEditor, setTagContextEditor] = useState<string | null>(null);
  /** The name prompt for a tag about to be created, opened by /tag new or the + button. */
  const [newTagPrompt, setNewTagPrompt] = useState(false);
  /** The tag waiting for its delete confirmation. */
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [newAgentBusy, setNewAgentBusy] = useState(false);
  const [configEditor, setConfigEditor] = useState<ConfigEditorState | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspacesBusy, setWorkspacesBusy] = useState(false);
  /** The workspace picker, for the + of the drawer (/new) and the menus' Change workspace. */
  const [workspacePicker, setWorkspacePicker] = useState<{ threadId: string | null } | null>(null);
  /** Workspace a brand-new thread picked before the server knew the conversation existed. */
  const pendingWorkspaceRef = useRef(new Map<string, string>());
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillViewer, setSkillViewer] = useState<{
    url: string;
    skill: SkillEntry;
  } | null>(null);
  /** The transfer flow of one skill, one sheet per step: what to do, where to, and the replace
   *  confirmation when the name is already taken there. The catalog answer closes it. */
  const [skillMenu, setSkillMenu] = useState<SkillEntry | null>(null);
  const [skillTargets, setSkillTargets] = useState<{ skill: SkillEntry; mode: 'copy' | 'move' } | null>(null);
  const [skillReplace, setSkillReplace] = useState<{
    skill: SkillEntry;
    mode: 'copy' | 'move';
    target: SkillTarget;
    label: string;
  } | null>(null);
  /** What the last transfer did. Kept until the page is left: the list reorders itself, which
   *  on its own is indistinguishable from nothing having happened. */
  const [skillsNotice, setSkillsNotice] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceModeResultFrame | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<SessionFileMeta | null>(null);
  const [imageViewer, setImageViewer] = useState<{
    url: string;
    filename: string;
    sizeBytes?: number;
  } | null>(null);
  const [textViewer, setTextViewer] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [videoViewer, setVideoViewer] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  /** A file with no preview: name, size and a download button. */
  const [fileViewer, setFileViewer] = useState<{
    url: string;
    filename: string;
    sizeBytes?: number;
  } | null>(null);
  const [sessionFiles, setSessionFiles] = useState<SessionFileMeta[]>([]);
  const [filesTotal, setFilesTotal] = useState(0);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [diagSnapshot, setDiagSnapshot] = useState('');
  const [diagLogs, setDiagLogs] = useState('');
  const [diagBusy, setDiagBusy] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [autoFocusHero, setAutoFocusHero] = useState(false);
  const [bubbleMenu, setBubbleMenu] = useState<TextItem | null>(null);
  const [threadMenu, setThreadMenu] = useState<SessionSummary | null>(null);
  const [threadToRename, setThreadToRename] = useState<SessionSummary | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  /** Which group of the model picker is open: its own stack, walked by the back key. */
  const [modelPicker, setModelPicker] = useState<PickerState>(pickerStart);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  /** The fullscreen status page of a conversation, an absolute layer over everything else. */
  const [statusOpen, setStatusOpen] = useState(false);
  /** The scheduled-tasks page, another absolute layer; the editor stacks over the list. */
  const [jobsOpen, setJobsOpen] = useState(false);
  /** The job being edited: null = the list, 'new' = a blank editor, an entry = that job. */
  const [jobsEditor, setJobsEditor] = useState<JobEntry | 'new' | null>(null);
  const [jobsSaving, setJobsSaving] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<JobEntry | null>(null);
  /** The runs page of one job, stacked over the jobs list; a run opens as a chat over it. */
  const [jobSessions, setJobSessions] = useState<{ jobId: string; jobName: string } | null>(null);
  const [agentsOpen, setAgentsOpen] = useState(false);
  /** The drawer's Sub-Agents page: shared agents from every conversation, not one roster. */
  const [agentsGlobalOpen, setAgentsGlobalOpen] = useState(false);
  /**
   * Set while the chat on screen is a sub-agent rather than a conversation. It carries the parent
   * so the header can name it and so a send can declare which conversation it is driving from.
   */
  const [subagentView, setSubagentView] = useState<{
    threadId: string;
    id: string;
    type: string;
    status: 'idle' | 'running';
    messageCount: number;
    parentThreadId: string;
  } | null>(null);
  const [subagentAction, setSubagentAction] = useState<'reset' | 'kill' | null>(null);
  const [subagentMenuOpen, setSubagentMenuOpen] = useState(false);
  const [jobRuns, setJobRuns] = useState<JobRunEntry[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  /** The frame handler runs outside React: it checks the runs page by ref. */
  const jobSessionsRef = useRef<{ jobId: string; jobName: string } | null>(null);
  /** Run titles are server-side; the chat header shows one instead of the raw first message. */
  const runTitlesRef = useRef<Record<string, string>>({});
  /** The frame handler runs outside React: it needs to know a save/delete is in flight. */
  const jobsSavingRef = useRef(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // A run can ask several times in a row; each answer clears one, in order.
  const [approvals, setApprovals] = useState<ApprovalRequestFrame[]>([]);

  const items = useChatItems(activeThread);
  const historyPage = useHistoryPage(activeThread);
  const sessions = useSessions();
  const archivedSessions = useArchivedSessions();
  const pinnedOrder = usePinnedOrder();
  const unread = useUnreadThreads();
  const mediaBase = useMemo(() => httpOrigin(url), [url]);
  const catalog = useModelCatalog();
  const threadModel = useThreadModel(activeThread);
  const agentsState = useAgentsConfig();
  const tagsState = useTags();
  const providersEnvState = useProvidersEnv();
  const agentsFile = useAgentsFile();
  const instructions = useInstructions();
  const agentsConfig = agentsState.config;
  // The Stop button is pinned to the run, not to a streaming bubble: it survives tool calls
  // and model turns, and only disappears when the run itself ends.
  const streaming = useActiveRun(activeThread);

  // Frame handlers run outside React: they need the thread on screen right now, not the one
  // captured when the listener was registered.
  const activeThreadRef = useRef<string | null>(null);
  // The server's push key, kept for a re-registration after the distributor rotates the
  // endpoint (the "registered" event can fire long after the frame that triggered it).
  const vapidRef = useRef<string | null>(null);
  // A sub-agent chat always goes back to its parent conversation, never to the roster: the roster
  // is a chooser that closes when a row is picked, which is what keeps the header's promise true.
  const subagentRef = useRef<typeof subagentView>(null);
  // A run opened from the job's runs page goes back there, like the archives flow.
  const fromJobSessionsRef = useRef(false);
  // Where the thread on screen came from: the hardware back press sends a conversation
  // opened from the archived list back to that list, instead of exiting the app.
  const fromArchivesRef = useRef(false);
  const selectThread = useCallback((threadId: string | null) => {
    activeThreadRef.current = threadId;
    setActiveThread(threadId);
    // Keep the last conversation: reopening the app must land on it, not inside a sub-agent.
    if (threadId === null || !isSubAgentThread(threadId)) prefs.set('lastThreadId', threadId);
  }, []);

  const openThread = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      chatStore.markRead(threadId);
      setAutoFocusHero(false);
      setDrawerOpen(false);
      setSettingsOpen(false);
      setArchivesOpen(false);
      setAgentsOpen(false);
      subagentRef.current = null;
      setSubagentView(null);
      connection.send(encodeSubAgentsList(threadId)).catch(() => {});
      connection.send(encodeSessionHistory(threadId, HISTORY_LIMIT));
      // The model of a conversation is per session: refresh it when the thread changes, so
      // the picker never shows the previous conversation's choice.
      connection.send(encodeModelGet(threadId));
    },
    [selectThread],
  );

  // The two thread lists differ only by where the back arrow should lead afterwards. Held stable
  // here rather than written inline at the call site: they are handed to memoized rows, and a
  // fresh arrow per render would make every visible row redraw on every frame the shell receives.
  const openThreadFromDrawer = useCallback(
    (threadId: string) => {
      fromArchivesRef.current = false;
      openThread(threadId);
    },
    [openThread],
  );
  const openThreadFromArchives = useCallback(
    (threadId: string) => {
      fromArchivesRef.current = true;
      openThread(threadId);
    },
    [openThread],
  );

  /**
   * The + and /new propose a workspace before the conversation exists: default preselected,
   * every named workspace available. The pick itself creates the thread and tells the server
   * right away, so the choice is stored before the first message.
   */
  const newThread = useCallback(() => {
    setWorkspacePicker({ threadId: null });
    connection.send(encodeWorkspacesList()).catch(() => {});
  }, []);

  /** The workspace a conversation runs in, optimistic pending value included. */
  const workspaceOf = useCallback(
    (threadId: string) =>
      sessionStore.workspaceOf(threadId) ?? pendingWorkspaceRef.current.get(threadId) ?? 'default',
    [],
  );

  const pickWorkspace = useCallback(
    (key: string) => {
      if (!workspacePicker) return;
      const target = workspacePicker.threadId;
      if (target) {
        // Switching an existing conversation: optimistic local echo, the server confirms
        // through session.workspace.set.result (and the next listing).
        sessionStore.setWorkspace(target, key);
        connection.send(encodeSessionWorkspaceSet(target, key)).catch(() => {});
      } else {
        const threadId = uuid();
        pendingWorkspaceRef.current.set(threadId, key);
        fromArchivesRef.current = false;
        selectThread(threadId);
        // The composer is the whole screen on a fresh thread: focus it, but only from the +
        // tap, never when the app boots into an empty list.
        setAutoFocusHero(true);
        setDrawerOpen(false);
        setSettingsOpen(false);
        connection.send(encodeSessionWorkspaceSet(threadId, key)).catch(() => {});
      }
      setWorkspacePicker(null);
    },
    [workspacePicker, selectThread],
  );

  /** Settings always open on the category index, never inside yesterday's page. */
  const openSettings = useCallback(() => {
    setSettingsPage('index');
    setSettingsOpen(true);
    setAutoFocusHero(false);
  }, []);

  /** The status page is asked on every opening: the report is a snapshot, not a live gauge. */
  const openStatus = useCallback((threadId: string) => {
    statusStore.open(threadId);
    setStatusOpen(true);
    connection.send(encodeStatusGet(threadId)).catch(() => {});
  }, []);

  /** The jobs page asks on every opening: the listing is a snapshot, and cheap to refresh. */
  const openJobs = useCallback(() => {
    setJobsEditor(null);
    setJobSessions(null);
    setJobsError(null);
    setJobsOpen(true);
    setDrawerOpen(false);
    setAutoFocusHero(false);
    connection.send(encodeJobsList()).catch(() => {});
  }, []);

  /**
   * Asks for the page just older than what is on screen. The guard is the store's, not a ref
   * here: the list fires this from a scroll handler, so it arrives repeatedly while one request
   * is still out.
   */
  const loadOlderHistory = useCallback(() => {
    const threadId = activeThreadRef.current;
    if (!threadId) return;
    const page = chatStore.getPage(threadId);
    if (!page.hasMore || page.loading) return;
    chatStore.setPageLoading(threadId, true);
    connection
      .send(encodeSessionHistory(threadId, HISTORY_LIMIT, page.nextBefore))
      .catch(() => chatStore.setPageLoading(threadId, false));
  }, []);

  const setGlobalDefaultModel = useCallback((modelId: string) => {
    connection.send(encodeAgentsModelSet('global', modelId)).catch(() => {});
  }, []);

  const editJob = useCallback((job: JobEntry) => {
    setJobsError(null);
    setJobsEditor(job);
  }, []);

  const openJobSessions = useCallback((job: JobEntry) => {
    setJobsEditor(null);
    setJobSessions({ jobId: job.id, jobName: job.name });
    jobSessionsRef.current = { jobId: job.id, jobName: job.name };
    setJobRuns(null);
    setRunsError(null);
    setDrawerOpen(false);
    setAutoFocusHero(false);
    connection.send(encodeJobsRuns(job.id)).catch(() => {});
  }, []);

  /** Opens a job run as a chat, exactly like a conversation: history, stream, and answers. */
  const openJobRun = useCallback(
    (threadId: string) => {
      // The runs page and the jobs page close under the chat; the back key restores them
      // (jobSessionsRef remembers which job the run belonged to).
      fromJobSessionsRef.current = true;
      setJobsOpen(false);
      setJobSessions(null);
      openThread(threadId);
    },
    [openThread],
  );

  /**
   * Opens a sub-agent as a real chat. Its handle is a thread id like any other, so history,
   * streaming, tool cards and reasoning all work; what differs is the header and that a send
   * declares the conversation it is driven from.
   */
  const openSubAgent = useCallback(
    (entry: SubAgentEntry, parentThreadId: string) => {
      const view = {
        threadId: entry.threadId,
        id: entry.id,
        type: entry.type,
        status: entry.status,
        messageCount: entry.messageCount,
        parentThreadId,
      };
      subagentRef.current = view;
      setSubagentView(view);
      setAgentsOpen(false);
      setAutoFocusHero(false);
      setDrawerOpen(false);
      selectThread(entry.threadId);
      chatStore.markRead(entry.threadId);
      connection.send(encodeSessionHistory(entry.threadId, HISTORY_LIMIT));
    },
    [selectThread],
  );

  /**
   * A shared agent answers to the conversation on screen: that is what the back row names, and
   * what authorizes the send (a global accepts any caller).
   */
  const openGlobalAgent = useCallback(
    (entry: SubAgentEntry) => {
      const parent = activeThreadRef.current;
      if (!parent) return;
      setAgentsGlobalOpen(false);
      openSubAgent(entry, parent);
    },
    [openSubAgent],
  );

  /** Back out of a sub-agent to the conversation that reached it. */
  const leaveSubAgent = useCallback(() => {
    const view = subagentRef.current;
    subagentRef.current = null;
    setSubagentView(null);
    if (!view) return;
    openThread(view.parentThreadId);
  }, [openThread]);

  const saveJob = useCallback(
    (fields: JobFieldsOut) => {
      jobsSavingRef.current = true;
      setJobsSaving(true);
      setJobsError(null);
      connection
        .send(encodeJobsSave(fields))
        .then(() => {
          // The fresh listing answers the save; the frame handler closes the editor.
        })
        .catch(() => {
          jobsSavingRef.current = false;
          setJobsSaving(false);
        });
    },
    [],
  );

  const deleteJob = useCallback(
    (job: JobEntry) => {
      setJobToDelete(null);
      jobsSavingRef.current = true;
      setJobsSaving(true);
      setJobsError(null);
      connection
        .send(encodeJobsDelete(job.id))
        .then(() => {})
        .catch(() => {
          jobsSavingRef.current = false;
          setJobsSaving(false);
        });
    },
    [],
  );

  useEffect(() => {
    /** Activity in a thread the user is not reading: badge it and make sure it is listed. */
    const noteActivity = (threadId: string, text: string): void => {
      if (threadId === activeThreadRef.current) return;
      chatStore.markUnread(threadId);
      if (!isSubAgentThread(threadId)) sessionStore.ensure(threadId, text);
    };

    const offState = connection.onState(next => {
      setStatus(next);
      if (next.state !== 'connected') {
        // A server's version belongs to its socket: gone with it, or a reconnect to a newer
        // server would show yesterday's label.
        setServerVersion(null);
        setLocationEnabled(false);
      }
      if (next.state === 'connected') {
        connection.send(encodeSessionList());
        connection.send(encodeCommandsList());
        connection.send(encodeModelList());
        connection.send(encodeJobsList());
      }
    });
    const offPending = connection.onPending(setPending);

    const offFrame = connection.onFrame(frame => {
      // The run id rides on the reply: keeping the last one is what makes "logs for this run"
      // possible without asking the user to read anything off a screen.
      if (
        (frame.type === 'chat.message' || frame.type === 'chat.stream.start') &&
        frame.run
      ) {
        setLastRun(frame.run);
      }
      switch (frame.type) {
        case 'location.capabilities':
          setLocationEnabled(frame.enabled === true);
          break;
        case 'chat.location':
          chatStore.setLocation(frame.threadId, frame.replyToId, frame.location);
          break;
        case 'location.preview.result':
          locationPreview.receive(frame.id, frame.location);
          break;
        case 'chat.message':
          chatStore.addAgentMessage(
            frame.threadId,
            frame.id,
            frame.text,
            frame.attachments,
            frame.replyToId,
            frame.notice,
          );
          noteActivity(frame.threadId, frame.text);
          break;
        case 'chat.run.start':
          chatStore.startRun(frame.threadId);
          break;
        case 'chat.run.end': {
          chatStore.endRun(frame.threadId);
          // A run may have spawned sub-agents; the roster is refetched at its end rather than
          // pushed, which keeps the counter honest without a live push path.
          const parent = subagentRef.current?.parentThreadId ?? activeThreadRef.current;
          if (parent) connection.send(encodeSubAgentsList(parent)).catch(() => {});
          break;
        }
        case 'subagents.list.result':
          subAgentStore.receive(frame);
          break;
        case 'chat.stream.start':
          // The agent is answering, so no command result is coming: a placeholder left by a
          // command this server does not know would sit there forever.
          chatStore.clearCommandPending(frame.threadId);
          chatStore.startStream(frame.threadId, frame.id, frame.replyToId);
          noteActivity(frame.threadId, '');
          break;
        case 'chat.stream.delta':
          chatStore.appendDelta(frame.threadId, frame.id, frame.text);
          break;
        case 'chat.reasoning.delta':
          chatStore.appendReasoning(frame.threadId, frame.id, frame.text);
          break;
        case 'chat.reasoning.tokens':
          chatStore.setReasoningTokens(frame.threadId, frame.id, frame.tokens);
          break;
        case 'chat.stream.done':
          chatStore.endStream(frame.threadId, frame.id);
          break;
        case 'chat.stream.abort':
          chatStore.abortStream(frame.threadId, frame.id, frame.error);
          break;
        case 'chat.tool':
          chatStore.addToolCall(frame.threadId, {
            id: frame.id,
            name: frame.name,
            args: frame.args,
            durationMs: frame.durationMs,
            ok: frame.ok,
            output: frame.output,
            truncated: frame.truncated,
          });
          break;
        case 'session.list.result':
          sessionStore.replace(frame.sessions);
          // The server now owns these conversations: their optimistic workspace values are
          // superseded by the listing's own (authoritative) field.
          for (const threadId of pendingWorkspaceRef.current.keys()) {
            if (sessionStore.has(threadId)) pendingWorkspaceRef.current.delete(threadId);
          }
          // The server's run view survives a reconnect mid-run: flags it missed (or lost)
          // come back through the list, so the Stop button reappears without a new token.
          chatStore.seedRuns(frame.sessions.filter(session => session.activeRun).map(session => session.threadId));
          // Land straight in a conversation instead of an empty screen, but never in one the
          // owner filed away: those are only reached from the archived list.
          if (!activeThreadRef.current) {
            const first = frame.sessions.find(summary => !summary.archived);
            if (first) openThread(first.threadId);
            else {
              const threadId = uuid();
              selectThread(threadId);
              // The drawer's agents section reads this roster: an app that boots with no
              // conversation at all must still list the shared agents.
              connection.send(encodeSubAgentsList(threadId)).catch(() => {});
            }
          }
          break;
        case 'session.workspace.set.result':
          if (sessionStore.has(frame.threadId)) {
            // The server stored the key and the conversation is listed: the stored value
            // supersedes the optimistic one.
            pendingWorkspaceRef.current.delete(frame.threadId);
            sessionStore.setWorkspace(frame.threadId, frame.workspace);
          } else {
            // A fresh conversation the listing has not carried yet: keep the pending value
            // until the next session.list.result brings the stored one.
            pendingWorkspaceRef.current.set(frame.threadId, frame.workspace);
          }
          break;
        case 'commands.list.result':
          commandStore.replace(frame.commands);
          break;
        case 'diag.snapshot.result':
          setDiagSnapshot(frame.text);
          setDiagBusy(false);
          break;
        case 'diag.report.result':
          acknowledgeDiagnostics(frame.accepted);
          break;
        case 'logs.tail.result':
          setDiagLogs(frame.lines > 0 ? frame.text : 'no matching lines');
          setDiagBusy(false);
          break;
        case 'files.list.result':
          setSessionFiles(frame.files);
          setFilesTotal(frame.totalBytes);
          setFilesError(null);
          break;
        case 'chat.history':
          // The same frame carries both the newest page, which replaces the thread, and an
          // older one, which goes in front of it. `before` is what tells them apart.
          if (frame.before) chatStore.prependHistory(frame.threadId, frame.messages);
          else chatStore.seedHistory(frame.threadId, frame.messages);
          chatStore.setPage(frame.threadId, {
            // An old server answers neither field: no cursor means no older page to ask for,
            // which is exactly the behaviour before this existed.
            nextBefore: frame.nextBefore ?? 0,
            hasMore: frame.hasMore === true && frame.nextBefore !== undefined,
          });
          if (!frame.before) chatStore.markRead(frame.threadId);
          break;
        case 'voice.mode.result':
          setVoice(frame);
          break;
        case 'model.list.result':
          modelStore.replaceCatalog(frame);
          break;
        case 'skills.list.result':
          setSkills(frame.skills);
          setSkillsError(null);
          break;
        case 'tools.list.result':
          setTools(frame.tools);
          setToolsMissing(frame.missing ?? []);
          setToolsError(null);
          setToolsSaving(false);
          break;
        case 'mcp.list.result':
          setMcpServers(frame.servers);
          setMcpError(null);
          setMcpBusy(false);
          break;
        case 'workspaces.list.result':
          setWorkspaces(frame.workspaces);
          setWorkspacesError(null);
          setWorkspacesBusy(false);
          break;
        case 'model.result':
          modelStore.replaceThread(frame);
          break;
        case 'agents.config.result':
          agentsStore.receive(frame);
          break;
        case 'tags.result':
          tagsStore.receive(frame.tags);
          break;
        case 'providers.env.result':
          providersEnvStore.receive(frame);
          setProviderBusy(false);
          break;
        case 'agents.file.result':
          agentsFileStore.receive(frame);
          break;
        case 'agents.file.saved':
          agentsFileStore.receiveSaved(frame);
          // The catalog changed (created/deleted agent): ask for a fresh snapshot instead of
          // guessing what the registry now holds.
          connection.send(encodeAgentsConfigGet()).catch(() => {});
          break;
        case 'config.result':
          setConfigEditor({
            status: 'ready',
            draft: frame.content,
            loaded: frame.content,
            sha: frame.sha,
            maxBytes: frame.maxBytes,
            error: null,
            changed: [],
            rebootRequired: [],
          });
          break;
        case 'config.saved':
          setConfigEditor(current => {
            if (!current) return current;
            if (frame.ok) {
              return { ...current, status: 'ready', loaded: current.draft, sha: frame.sha, error: null, changed: frame.changed, rebootRequired: frame.rebootRequired };
            }
            return {
              ...current,
              status: frame.conflict ? 'conflict' : 'ready',
              error: frame.error ?? 'save refused',
            };
          });
          break;
        case 'instructions.list.result':
          instructionsStore.receive(frame);
          break;
        case 'instructions.file':
          instructionsStore.receiveFile(frame);
          break;
        case 'instructions.saved':
          instructionsStore.receiveSaved(frame);
          break;
        case 'chat.command.pending':
          chatStore.addCommandPending(frame.threadId, frame.replyToId, frame.text);
          break;
        case 'chat.command.result':
          if (frame.status) {
            // A /status answered by the server: the page replaces the bubble, so the report
            // never takes space in the conversation. Its placeholder goes with it.
            chatStore.clearCommandPending(frame.threadId);
            statusStore.receive({
              type: 'status.result',
              threadId: frame.threadId,
              text: frame.text,
              status: frame.status,
            });
            setStatusOpen(true);
          } else {
            chatStore.addCommandResult(
              frame.threadId,
              `cmd-${frame.replyToId ?? 'x'}-${Date.now()}`,
              frame.text,
              frame.replyToId,
              frame.details,
            );
            noteActivity(frame.threadId, frame.text);
          }
          break;
        case 'status.result':
          // A late answer to a page that was already closed must not reopen it: only accept
          // while a request is in flight.
          if (statusStore.getSnapshot().fetch === 'loading') statusStore.receive(frame);
          break;
        case 'jobs.list.result':
          // The fresh listing is also the answer to a save or a delete: a pending one closes
          // the editor on arrival, and a refused one lands as a jobs-scoped error instead.
          jobsStore.replace(frame);
          setJobsError(null);
          if (jobsSavingRef.current) {
            jobsSavingRef.current = false;
            setJobsSaving(false);
            setJobsEditor(null);
          }
          break;
        case 'jobs.runs.result': {
          // The answer to the runs page that asked for it: only accepted while it is open, so
          // a late answer does not resurrect a closed page.
          if (!jobSessionsRef.current || jobSessionsRef.current.jobId !== frame.jobId) break;
          const titles: Record<string, string> = {};
          for (const run of frame.runs) titles[run.threadId] = run.title;
          runTitlesRef.current = titles;
          setJobRuns(frame.runs);
          setRunsError(null);
          break;
        }
        case 'notifications.info':
          // The server hands its VAPID key on every connection; registering again is how the
          // library verifies the distributor link is still alive (and picks up a rotation).
          vapidRef.current = frame.vapidPublicKey;
          registerForPush(frame.vapidPublicKey).catch(() => {});
          break;
        case 'hello':
          // The server names itself on connect: the settings page labels "connected" with it.
          setServerVersion(frame.version);
          break;
        case 'chat.cleared':
          chatStore.clearThread(frame.threadId);
          break;
        case 'chat.transcript':
          chatStore.setTranscripts(frame.threadId, frame.replyToId, frame.items);
          break;
        case 'approval.request':
          setApprovals(current =>
            current.some(entry => entry.id === frame.id)
              ? current
              : [...current, frame],
          );
          break;
          case 'error':
            // Where the user asked is where the refusal belongs: a rejected delete used to be
            // invisible under the files screen, and then loud in a conversation it has nothing
            // to do with.
            if (frame.scope === 'files') {
              setFilesError(frame.message);
            } else if (frame.scope === 'model') {
              // A stale picker answered by a server that dropped the model: close the sheet,
              // the next model.list will carry the truth.
              setModelOpen(false);
            } else if (frame.scope === 'skills') {
              // An old server has no skill catalog: the skills page must not spin forever.
              setSkillsError(frame.message);
            } else if (frame.scope === 'tools') {
              setToolsError(frame.message);
              setToolsSaving(false);
            } else if (frame.scope === 'mcp') {
              setMcpError(frame.message);
              setMcpBusy(false);
            } else if (frame.scope === 'config') {
              setConfigEditor(current =>
                current ? { ...current, status: 'ready', error: frame.message } : current,
              );
            } else if (frame.scope === 'workspaces') {
              setWorkspacesError(frame.message);
              setWorkspacesBusy(false);
            } else if (frame.scope === 'jobs') {
              jobsSavingRef.current = false;
              setJobsSaving(false);
              setJobsError(frame.message);
            } else if (frame.scope === 'status') {
              statusStore.fail(frame.message);
            } else if (frame.scope === 'agents') {
              agentsStore.fail(frame.message);
              // A file edit can fail while the file page is open: the editor shows it where it
              // was asked for, and a no-op for the list page.
              agentsFileStore.fail(frame.message);
            } else if (frame.scope === 'instructions') {
              instructionsStore.fail(frame.message);
            } else if (frame.scope === 'tags') {
              tagsStore.fail(frame.message);
            } else if (frame.scope === 'providers') {
              providersEnvStore.fail(frame.message);
              setProviderBusy(false);
            } else if (activeThreadRef.current) {
              chatStore.addAgentMessage(
                activeThreadRef.current,
                `err-${Date.now()}`,
                `error: ${frame.message}`,
                [],
              );
            }
            break;
      }
    });

    // Settings first: the stored server address and last thread decide what we connect to and
    // what the user sees on the first frame.
    prefs.hydrate().then(stored => {
      setUrl(stored.serverUrl);
      if (stored.lastThreadId) openThread(stored.lastThreadId);
      return connection.getState().then(state => {
        setStatus({ state });
        if (state !== 'connected' && state !== 'connecting')
          connection.connect(stored.serverUrl);
        connection.send(encodeSessionList());
      });
    });
    pinnedStore.hydrate().catch(() => {});

    // Reports of what killed the previous process, read before the first frame goes out. They
    // are queued natively if the socket is not up yet, so this does not need to wait for it.
    loadDiagnostics()
      .then(flushDiagnostics)
      .catch(() => {});

    getDeviceInfo()
      .then(setDeviceInfo)
      .catch(() => {});
    deviceBridge
      .getAppVersion()
      .then(version => setAppVersion(version || null))
      .catch(() => {});
    connection
      .pendingCount()
      .then(setPending)
      .catch(() => {});

    return () => {
      offState();
      offFrame();
      offPending();
    };
  }, [openThread, selectThread]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // A confirmation is the topmost thing on screen when it is up.
      if (subagentAction) {
        setSubagentAction(null);
        return true;
      }
      if (subagentMenuOpen) {
        setSubagentMenuOpen(false);
        return true;
      }
      // The roster is an absolute layer like the status page, so it closes before anything under it.
      if (agentsOpen) {
        setAgentsOpen(false);
        return true;
      }
      if (agentsGlobalOpen) {
        setAgentsGlobalOpen(false);
        return true;
      }
      // Topmost layer first: the image covers everything else.
      if (statusOpen) {
        // The status page is an absolute layer over the whole shell, so the back key must
        // always close it before anything underneath can see the press.
        statusStore.close();
        setStatusOpen(false);
        return true;
      }
      if (jobsOpen) {
        // The runs page and the editor stack over the jobs list: back leaves them first.
        if (jobsEditor) {
          setJobsEditor(null);
          return true;
        }
        if (jobSessions) {
          setJobSessions(null);
          jobSessionsRef.current = null;
          setJobRuns(null);
          return true;
        }
        setJobsOpen(false);
        return true;
      }
      if (imageViewer) {
        setImageViewer(null);
        return true;
      }
      if (textViewer) {
        setTextViewer(null);
        return true;
      }
      if (videoViewer) {
        setVideoViewer(null);
        return true;
      }
      if (fileViewer) {
        setFileViewer(null);
        return true;
      }
      if (approvals.length > 0) {
        setApprovals(current => current.slice(1));
        return true;
      }
      if (fileToDelete) {
        setFileToDelete(null);
        return true;
      }
      // Innermost first: the rename sheet sits over the menu that opened it.
      if (threadToRename) {
        setThreadToRename(null);
        return true;
      }
      if (modelOpen) {
        // The picker is a flow of its own: back walks out of a group, then one step back through
        // the model/effort/context screens, and only then closes the sheet.
        const previous = pickerBack(modelPicker);
        if (previous) {
          setModelPicker(previous);
          return true;
        }
        setModelOpen(false);
        return true;
      }
      if (newTagPrompt) {
        setNewTagPrompt(false);
        return true;
      }
      if (tagToDelete) {
        setTagToDelete(null);
        return true;
      }
      if (providerToDelete) {
        setProviderToDelete(null);
        return true;
      }
      if (commandMenuOpen) {
        setCommandMenuOpen(false);
        return true;
      }
      if (bubbleMenu || threadMenu) {
        setBubbleMenu(null);
        setThreadMenu(null);
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (skillMenu || skillTargets || skillReplace) {
        setSkillMenu(null);
        setSkillTargets(null);
        setSkillReplace(null);
        return true;
      }
      if (skillViewer) {
        setSkillViewer(null);
        return true;
      }
      if (settingsOpen) {
        // Innermost page first: the back key walks the settings stack one level at a time,
        // so a habit press from a subpage can never fall through to the launcher.
        if (settingsPage === 'index') {
          setSettingsOpen(false);
          return true;
        }
        // The picker pages are flows of their own: back walks out of a group, then one step
        // back through the model/effort/context screens, and only then leaves the page. The
        // model picker returns where it was opened from: the agents list for "global" and
        // "fallback", the agent page for an agent key.
        if (settingsPage === 'model-picker') {
          const previous = pickerBack(agentPicker);
          if (previous) {
            setAgentPicker(previous);
            return true;
          }
          const from = agentModelFor === 'global' || agentModelFor === 'fallback' ? 'agents' : 'agent';
          setAgentModelFor(null);
          setSettingsPage(from);
          return true;
        }
        if (settingsPage === 'tag-editor') {
          const previous = pickerBack(tagEditor?.picker ?? pickerStart);
          if (previous && tagEditor) {
            setTagEditor({ ...tagEditor, picker: previous });
            return true;
          }
          setTagEditor(null);
          setSettingsPage('tags');
          return true;
        }
        if (settingsPage === 'agent') {
          setSettingsPage('agents');
          return true;
        }
        if (settingsPage === 'provider') {
          if (providerSearch.current.query) {
            providerSearch.current.clear();
            return true;
          }
          setSettingsPage('providers');
          return true;
        }
        if (settingsPage === 'provider-env') {
          setSettingsPage('provider-edit');
          return true;
        }
        if (settingsPage === 'provider-edit') {
          if (providerEdit?.mode === 'create') setSettingsPage('providers');
          else setSettingsPage('provider');
          setProviderEdit(null);
          return true;
        }
        if (settingsPage === 'providers') {
          setSettingsPage('index');
          return true;
        }
        if (settingsPage === 'tags') {
          setSettingsPage('providers');
          return true;
        }
        if (settingsPage === 'agents') {
          setSettingsPage('index');
          return true;
        }
        if (settingsPage === 'scope') {
          setSettingsPage(scopeEditor?.target === 'file' ? 'file' : 'agent');
          setScopeEditor(null);
          return true;
        }
        if (settingsPage === 'workspace-picker' || settingsPage === 'number') {
          setSettingsPage(tagContextEditor ? 'tags' : 'agent');
          return true;
        }
        if (settingsPage === 'file') {
          agentsFileStore.close();
          setSettingsPage('agent');
          return true;
        }
        if (settingsPage === 'newagent') {
          setSettingsPage('agents');
          return true;
        }
        if (settingsPage === 'mcps' || settingsPage === 'config') {
          setSettingsPage('index');
          return true;
        }
        if (settingsPage === 'instruction-layer') {
          setLayerTarget(null);
          instructionsStore.closeLayer();
          setSettingsPage('workspace');
          return true;
        }
        if (settingsPage === 'instruction') {
          instructionsStore.closeEditor();
          setSettingsPage('workspace');
          return true;
        }
        // The workspace page is reached from the list, or straight from an agent pinned to it.
        if (settingsPage === 'workspace') {
          setSettingsPage(workspaceFrom === 'agent' ? 'agent' : 'workspaces');
          return true;
        }
        // Workspaces is its own index entry; diagnostics lives under Other. Back lands where
        // they came from.
        if (settingsPage === 'workspaces') {
          setSettingsPage('index');
          return true;
        }
        if (settingsPage === 'diagnostics') {
          setSettingsPage('other');
          return true;
        }
        setSettingsPage('index');
        return true;
      }
      if (archivesOpen) {
        setArchivesOpen(false);
        return true;
      }
      if (filesOpen) {
        setFilesOpen(false);
        return true;
      }
      // A conversation opened from the archived list goes back there: backing out of it
      // would otherwise fall through and close the app.
      // A sub-agent chat backs out to the conversation that reached it, which is exactly what its
      // header says it will do.
      if (subagentRef.current) {
        leaveSubAgent();
        return true;
      }
      if (fromArchivesRef.current) {
        fromArchivesRef.current = false;
        selectThread(null);
        setArchivesOpen(true);
        return true;
      }
      // A run opened from a job's runs page goes back to that page, then on to the jobs list.
      if (fromJobSessionsRef.current) {
        fromJobSessionsRef.current = false;
        selectThread(null);
        setJobsOpen(true);
        const page = jobSessionsRef.current;
        if (page) {
          setJobSessions(page);
          // The runs are still in state from the page that opened the run; no refetch needed.
          setJobRuns(current => current);
        }
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    approvals.length,
    agentModelFor,
    agentPicker,
    agentsGlobalOpen,
    agentsOpen,
    archivesOpen,
    bubbleMenu,
    commandMenuOpen,
    drawerOpen,
    fileToDelete,
    filesOpen,
    imageViewer,
    workspaceFrom,
    layerTarget,
    jobSessions,
    jobsEditor,
    jobsOpen,
    modelOpen,
    modelPicker,
    newTagPrompt,
    providerEdit,
    providerToDelete,
    scopeEditor,
    selectThread,
    settingsOpen,
    settingsPage,
    skillMenu,
    skillReplace,
    skillTargets,
    skillViewer,
    statusOpen,
    subagentAction,
    subagentMenuOpen,
    leaveSubAgent,
    tagContextEditor,
    tagEditor,
    tagToDelete,
    textViewer,
    threadMenu,
    threadToRename,
    videoViewer,
    fileViewer,
  ]);

  // The roster of the conversation in play: while inside a sub-agent that is still the parent's,
  // because that is the scope the server answered for.
  const rosterThread = subagentView?.parentThreadId ?? activeThread;
  const roster = useSubAgents(rosterThread);
  const spawnCards = useMemo(
    () =>
      items.flatMap(item =>
        item.kind === 'tool' && item.name === 'spawn'
          ? [{ id: item.id, name: item.name, args: item.args, ok: item.ok, durationMs: item.durationMs }]
          : [],
      ),
    [items],
  );
  const rosterGroups = useMemo(() => groupRoster(roster.agents), [roster.agents]);
  const globalAgents = useMemo(
    () =>
      roster.agents
        .filter(agent => agent.visibility === 'global')
        .sort((a, b) => {
          const running = Number(b.status === 'running') - Number(a.status === 'running');
          if (running !== 0) return running;
          const created = b.createdAt.localeCompare(a.createdAt);
          return created !== 0 ? created : a.id.localeCompare(b.id);
        }),
    [roster.agents],
  );
  const globalGroups = useMemo(() => groupRoster(globalAgents), [globalAgents]);
  const subagentCount = useMemo(
    () => ({
      total: rosterGroups.reduce((sum, group) => sum + group.rows.length, 0),
      running: roster.agents.filter(agent => agent.status === 'running').length,
    }),
    [rosterGroups, roster.agents],
  );

  /**
   * Which `spawn` cards still lead somewhere. A card outlives the sub-agent it made, so the door is
   * offered only while the roster still lists it: a killed one stops offering rather than opening a
   * dead thread.
   */
  const subagentDoors = useMemo(() => {
    const byName = new Map(roster.agents.map(agent => [agent.displayName, agent]));
    const doors = new Map<string, { label: string; status: 'idle' | 'running' }>();
    for (const card of spawnCards) {
      if (!card.ok || card.args.mode !== 'session') continue;
      const claimed = typeof card.args.name === 'string' ? card.args.name : '';
      const agent = byName.get(claimed);
      if (!agent) continue;
      doors.set(card.id, { label: agent.id.replace(/^subagent\//, ''), status: agent.status });
    }
    return doors;
  }, [roster.agents, spawnCards]);

  const openSubAgentFromCard = useCallback(
    (toolItemId: string) => {
      const card = spawnCards.find(entry => entry.id === toolItemId);
      const claimed = card && typeof card.args.name === 'string' ? card.args.name : '';
      const agent = roster.agents.find(entry => entry.displayName === claimed);
      if (!agent || !activeThread) return;
      openSubAgent(agent, activeThread);
    },
    [spawnCards, roster.agents, activeThread, openSubAgent],
  );

  /**
   * Sends into a named conversation. Explicit rather than always the active one, because handing a
   * sub-agent's answer to its parent posts into the parent while the sub-agent is still on screen.
   */
  const sendChatTo = useCallback(
    async (threadId: string, text: string, attachments?: OutgoingAttachment[], location?: LocationInput) => {
      const id = uuid();
      chatStore.addUserMessage(
        threadId,
        id,
        text,
        attachments?.map(attachment => ({
          id: attachment.id,
          type: attachment.type,
          uri: attachment.uri,
          filename: attachment.filename,
          ...(attachment.audioAsVoice ? { audioAsVoice: true } : {}),
          ...(attachment.durationMs === undefined ? {} : { durationMs: attachment.durationMs }),
        })) ?? [],
        location,
      );
      const isVoiceNote = attachments?.some(attachment => attachment.audioAsVoice) ?? false;
      if (!isSubAgentThread(threadId)) sessionStore.ensure(threadId, text || (isVoiceNote ? '(voice message)' : location ? '(location)' : '(attachment)'));
      // The wire only carries the reference; uri and filename are local bubble concerns.
      const delivered = await connection.send(
        encodeChatSend(
          id,
          text,
          threadId,
          attachments?.map(attachment => ({
            id: attachment.id,
            type: attachment.type,
            ...(attachment.audioAsVoice ? { audioAsVoice: true } : {}),
            ...(attachment.durationMs === undefined ? {} : { durationMs: attachment.durationMs }),
          })),
          // Only when driving a sub-agent: it names the conversation this is driven from, which
          // the server matches against the sub-agent's recorded parent.
          subagentRef.current?.threadId === threadId ? subagentRef.current.parentThreadId : undefined,
          location,
        ),
      );
      if (!delivered) chatStore.markSendFailed(threadId, id);
    },
    [],
  );

  const sendChat = useCallback(
    async (text: string, attachments?: OutgoingAttachment[], location?: LocationInput) => {
      const threadId = activeThreadRef.current ?? uuid();
      if (!activeThreadRef.current) selectThread(threadId);
      return sendChatTo(threadId, text, attachments, location);
    },
    [selectThread, sendChatTo],
  );

  // Push notifications (docs/notifications.md). The distributor answers registrations on its
  // own channel: whenever it hands out an endpoint the server gets it, and a lost registration
  // clears the server side so it stops publishing into the void.
  useEffect(() => {
    if (!pushSupported) return;
    return subscribeToPushRegistration(event => {
      if (event.kind === 'registered') {
        connection.send(encodeNotificationsRegister(event.subscription)).catch(() => {});
        return;
      }
      if (event.kind === 'unregistered') {
        // The distributor dropped us: allow a fresh registration on the next VAPID key, and
        // tell the server to stop publishing into the void.
        resetPushRegistration();
        connection.send(encodeNotificationsRegister({ endpoint: '' })).catch(() => {});
      }
      if (event.kind === 'failed') {
        resetPushRegistration();
      }
    });
  }, []);

  // The one notification the user asked to never see is the run they are already watching, so
  // the server needs to know what is on screen: app state and active thread, on every change.
  useEffect(() => {
    if (!pushSupported) return;
    const report = (foreground: boolean) => {
      connection
        .send(
          encodeNotificationsState({
            foreground,
            ...(activeThreadRef.current ? { threadId: activeThreadRef.current } : {}),
          }),
        )
        .catch(() => {});
    };
    report(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => report(state === 'active'));
    return () => subscription.remove();
  }, [activeThread]);

  // A notification tap opens the thread or the jobs page it came from. The cold start (the app
  // was killed and the tap launched it) is the initial URL; a live app gets the event.
  useEffect(() => {
    const handle = (link: string | null) => {
      const target = parseNotificationLink(link);
      if (!target) return;
      if (target.kind === 'thread') openThread(target.threadId);
      else openJobs();
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    const subscription = Linking.addEventListener('url', event => handle(event.url));
    return () => subscription.remove();
  }, [openThread, openJobs]);

  // Asked for when the screen opens rather than at boot: it is the only place that shows it,
  // and a stale answer from an hour ago would render a switch that no longer matches the server.
  useEffect(() => {
    if (!settingsOpen) return;
    connection.send(encodeVoiceModeGet()).catch(() => {});
  }, [settingsOpen]);

  // The skill catalog and the workspace list are asked for when their pages open: they are the
  // only surfaces that show them, and a stale list from another day would name skills or paths
  // that moved or disappeared.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'skills') return;
    connection.send(encodeSkillsList()).catch(() => {});
    connection.send(encodeWorkspacesList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The jobs editor's pickers (model, workspace, skills, MCP, tools) are fed by the same live
  // catalogs as the settings pages: ask for them when the jobs page opens too. The model list is
  // one of them: the editor calls a pinned model "no such model" on a catalog it does not have,
  // and the only other fetch is the one at connect -- a lost frame there painted every job red.
  useEffect(() => {
    if (!jobsOpen) return;
    connection.send(encodeSkillsList()).catch(() => {});
    connection.send(encodeToolsList()).catch(() => {});
    connection.send(encodeMcpList()).catch(() => {});
    connection.send(encodeWorkspacesList()).catch(() => {});
    connection.send(encodeModelList()).catch(() => {});
  }, [jobsOpen]);

  // The index shows the skills/tools counts on its rows: asking for the catalogs when it opens
  // is what makes those numbers real without a first visit to either page. The pages still
  // refresh their own list on entry, so a hot-reload or an edit made elsewhere lands on the
  // next visit.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'index') return;
    connection.send(encodeSkillsList()).catch(() => {});
    connection.send(encodeToolsList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The workspaces list owns the CRUD: asked for on every visit, like the other lists, because
  // config.workspaces hot-reloads under it. The list also carries the per-row prompt summary,
  // which is the instruction listing, so it asks for both -- see the instructions effect below.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'workspaces') return;
    connection.send(encodeWorkspacesList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // Same for the tools page: it is the only surface that shows the catalog, and plugins and
  // disabled tools change under hot-reload, so a list from earlier can already be wrong.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'tools') return;
    connection.send(encodeToolsList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The MCP list is the wire version of /mcp: asked for on the MCPs page, and on every page that
  // judges names against it.
  useEffect(() => {
    if (!settingsOpen) return;
    if (settingsPage !== 'mcps' && !judgesCatalogNames(settingsPage)) return;
    connection.send(encodeMcpList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // Same catalog, same rule, for the skills: the pages that call a name "removed" need the list
  // that decides it. The two used to be fetched by effects with different page sets, which is how
  // the file editor ended up checking MCP names it had against skill names it did not.
  useEffect(() => {
    if (!settingsOpen || !judgesCatalogNames(settingsPage)) return;
    connection.send(encodeSkillsList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The agent defaults are asked for by every page that renders them: the agents stack, the
  // provider stack, and the index (its rows carry the counts). A server that predates the
  // frames answers nothing at all (unknown frames are dropped silently), so the store flips to
  // "unsupported" after a beat instead of spinning forever.
  useEffect(() => {
    if (!settingsOpen || !readsAgentsConfig(settingsPage)) return;
    agentsStore.request();
    connection.send(encodeAgentsConfigGet()).catch(() => {});
    // The workspace picker needs its list here, and only the agent pages own one; the skills and
    // MCP catalogs these pages judge names against are fetched by the catalog effects above.
    if (settingsPage === 'agents' || settingsPage === 'agent') {
      connection.send(encodeWorkspacesList()).catch(() => {});
    }
    const timer = setTimeout(() => agentsStore.markUnsupported(), 4000);
    return () => clearTimeout(timer);
  }, [settingsOpen, settingsPage]);

  // The agent file editor asks for its file when the page opens; a stale sha answers a conflict.
  // The instructions list is asked too, so the layer chips can say which checked layers are off
  // at the workspace level -- the one fact the frontmatter alone cannot show.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'file' || !selectedAgent) return;
    agentsFileStore.open(selectedAgent);
    connection.send(encodeAgentFileGet(selectedAgent)).catch(() => {});
    connection.send(encodeInstructionsList()).catch(() => {});
  }, [settingsOpen, settingsPage, selectedAgent]);

  // The raw config editor: asked for when its page opens, and the sha round-trip guards saves.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'config') return;
    setConfigEditor({
      status: 'loading',
      draft: '',
      loaded: '',
      sha: '',
      maxBytes: 0,
      error: null,
      changed: [],
      rebootRequired: [],
    });
    connection.send(encodeConfigGet()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The catalog is fetched at connect, but the provider pages group it by provider and the
  // grouping follows config hot-reloads: ask again when they open, like the skills page does.
  // The env pages pull the variable names too: the form's "reuse or ask for a value" decision
  // depends on it, and a server that predates the frames flips to unsupported after a beat.
  useEffect(() => {
    if (!settingsOpen || (settingsPage !== 'providers' && settingsPage !== 'provider')) return;
    connection.send(encodeModelList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  useEffect(() => {
    if (!settingsOpen || (settingsPage !== 'provider-edit' && settingsPage !== 'provider-env')) return;
    providersEnvStore.request();
    connection.send(encodeProvidersEnvList()).catch(() => {});
    const timer = setTimeout(() => providersEnvStore.markUnsupported(), 4000);
    return () => clearTimeout(timer);
  }, [settingsOpen, settingsPage]);

  // The tag catalog, same pull pattern as the agents page: asked for when the page opens, and
  // a server that predates the frames flips to "unsupported" after a beat instead of spinning.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'tags') return;
    tagsStore.request();
    connection.send(encodeTagsList()).catch(() => {});
    const timer = setTimeout(() => tagsStore.markUnsupported(), 4000);
    return () => clearTimeout(timer);
  }, [settingsOpen, settingsPage]);

  // Same guard as the agents page: a server without the instructions frames answers nothing,
  // and the page must say so rather than spin. The list is re-asked on every visit because the
  // agent edits AGENTS.md too, so a list from ten minutes ago can already be wrong -- and the
  // layer screen's ladder depends on that list directly.
  //
  // The workspace list is asked for here too, and it is not decoration: a source is called
  // "broken" precisely when its workspace is missing from that list, so an empty one turns
  // every `inherit: <workspace>` into a red "no longer exists" that is pure fiction. Reaching
  // this page from the settings index -- which fetches no workspaces -- used to do exactly that.
  useEffect(() => {
    if (!settingsOpen || !READS_INSTRUCTIONS_PAGES.has(settingsPage)) return;
    instructionsStore.request();
    connection.send(encodeInstructionsList()).catch(() => {});
    connection.send(encodeWorkspacesList()).catch(() => {});
    const timer = setTimeout(() => instructionsStore.markUnsupported(), 4000);
    return () => clearTimeout(timer);
  }, [settingsOpen, settingsPage]);

  const changeVoiceMode = useCallback((mode: VoiceMode) => {
    // No optimistic write: the server answers with the state it actually stored, including what
    // "auto" resolved to, and a switch that lied about that would be worse than a slow one.
    connection.send(encodeVoiceModeSet(mode)).catch(() => {});
  }, []);

  // Diagnostics is a page under Other, not a screen of its own: reached from settings, the
  // back key has to land back on Other instead of dropping the user two levels down.
  const openDiagnostics = useCallback(() => {
    setSettingsOpen(true);
    setSettingsPage('diagnostics');
    setDiagBusy(true);
    connection.send(encodeDiagSnapshot(activeThreadRef.current ?? ''));
  }, []);

  /** Every entry point of the picker starts at its root, never inside yesterday's group. */
  const openModel = useCallback(() => {
    setModelPicker(pickerStart);
    setModelOpen(true);
  }, []);

  const fetchLogs = useCallback((query: LogsTailQuery) => {
    setDiagBusy(true);
    connection.send(encodeLogsTail(query));
  }, []);

  /**
   * Opens the files of a named conversation, switching to it first when the entry came from the
   * drawer: the files screen sits over the chat, so landing on the right conversation makes the
   * way back land where the files belong.
   */
  const openFilesFor = useCallback(
    (threadId: string) => {
      if (activeThreadRef.current !== threadId) openThread(threadId);
      setFilesOpen(true);
      connection.send(encodeFilesList(threadId));
    },
    [openThread],
  );

  const changeUrl = useCallback((next: string) => {
    setUrl(next);
    prefs.set('serverUrl', next);
  }, []);

  /** Destroys the conversation: messages, uploads and name all go, here and on the server. */
  const deleteThread = useCallback(
    (threadId: string) => {
      connection.send(encodeSessionDelete(threadId));
      chatStore.clearThread(threadId);
      modelStore.dropThread(threadId);
      sessionStore.remove(threadId);
      if (activeThreadRef.current === threadId) selectThread(null);
      setThreadMenu(null);
      connection.send(encodeSessionList());
    },
    [selectThread],
  );

  /**
   * Moves a conversation between the drawer and the archived list. Nothing is cleared: the
   * server answers with the refreshed listing, and letting go of the active thread makes that
   * reply land on the first conversation still in the drawer.
   */
  const setThreadArchived = useCallback(
    (threadId: string, archived: boolean) => {
      connection.send(archived ? encodeSessionArchive(threadId) : encodeSessionUnarchive(threadId));
      if (archived && activeThreadRef.current === threadId) selectThread(null);
      setThreadMenu(null);
    },
    [selectThread],
  );

  /**
   * What a conversation can do, wherever it is named: the drawer's per-conversation sheet and
   * the header's menu answer the same list, same order, same words. They had drifted -- only
   * one carried Status, the labels disagreed, and the drawer deleted without asking while the
   * header confirmed. The subject is a conversation in both places, so no label says so.
   */
  const conversationActions = useCallback(
    (target: SessionSummary, close: () => void): SheetEntry[] => [
      // Pinning is a drawer thing, but the drawer's own sheet is the same list; both menus
      // answer here, so the entry lives with the rest of the conversation actions.
      pinnedOrder.includes(target.threadId)
        ? {
            label: 'Unpin',
            hint: 'back to the conversation list',
            onPress: () => {
              pinnedStore.setPinned(target.threadId, false);
              close();
            },
          }
        : {
            label: 'Pin to top',
            hint: 'keep it above the list',
            onPress: () => {
              pinnedStore.setPinned(target.threadId, true);
              close();
            },
          },
      // First and standing alone: it is the one action both menus share for any conversation,
      // and it used to cost a whole header button.
      {
        label: 'Session files',
        onPress: () => {
          close();
          openFilesFor(target.threadId);
        },
      },
      {
        label: 'Change workspace',
        hint: `current: ${workspaceOf(target.threadId)}`,
        onPress: () => {
          setWorkspacePicker({ threadId: target.threadId });
          connection.send(encodeWorkspacesList()).catch(() => {});
          close();
        },
      },
      { type: 'separator' },
      {
        label: 'Rename…',
        onPress: () => {
          // The rename sheet needs the current name to start from, so it is handed the thread
          // as a value: closing the menu first would drop the one it was opened for.
          setThreadToRename(target);
          close();
        },
      },
      {
        label: 'Status',
        hint: 'context, tokens, cost',
        onPress: () => {
          close();
          openStatus(target.threadId);
        },
      },
      target.archived
        ? {
            label: 'Unarchive',
            hint: 'put it back in the list',
            onPress: () => {
              setThreadArchived(target.threadId, false);
              close();
            },
          }
        : {
            label: 'Archive',
            hint: 'file it away, nothing is deleted',
            onPress: () => {
              setThreadArchived(target.threadId, true);
              close();
            },
          },
      {
        label: 'Delete',
        danger: true,
        onPress: () => {
          // Always through the confirmation: the drawer used to delete on the first tap.
          setConfirmDelete(target.threadId);
          close();
        },
      },
    ],
    [openStatus, setThreadArchived, openFilesFor, workspaceOf, pinnedOrder],
  );

  const threadActions: SheetEntry[] = threadMenu
    ? conversationActions(threadMenu, () => setThreadMenu(null))
    : [];

  /**
   * One sheet for both flows: a new conversation (default preselected) and a switch of an
   * existing one (its current workspace preselected). The same words as the menus: the
   * workspace is a property of the conversation, so the picker names nothing else.
   */
  const workspacePickerOptions: SheetEntry[] = workspacePicker
    ? [
        ...workspaces.map(entry => ({
          key: entry.key,
          label: entry.key === 'default' ? 'Default workspace' : entry.key,
          hint: entry.path,
          selected: entry.key === (workspacePicker.threadId ? workspaceOf(workspacePicker.threadId) : 'default'),
          onPress: () => pickWorkspace(entry.key),
        })),
        { type: 'separator' as const },
        {
          label: 'Manage workspaces…',
          onPress: () => {
            setWorkspacePicker(null);
            openSettings();
            setSettingsPage('workspaces');
          },
        },
      ]
    : [];

  /**
   * A slash command picked from the composer's menu. Commands the app can do natively are
   * handled here (returning true keeps their text out of the field); everything else stays a
   * typed command that the server executes.
   */
  const dispatchCommand = useCallback(
    (command: string): boolean => {
      const threadId = activeThreadRef.current;
      switch (command) {
        case 'model':
          setCommandMenuOpen(false);
          openModel();
          return true;
        case 'new':
          setCommandMenuOpen(false);
          newThread();
          return true;
        case 'tag':
          setCommandMenuOpen(false);
          setSettingsOpen(true);
          setSettingsPage('tags');
          return true;
        case 'stop':
          if (threadId) connection.send(encodeChatStop(threadId));
          return true;
        case 'rename':
          if (threadId) {
            const summary = sessions.find(session => session.threadId === threadId);
            setThreadToRename(summary ?? { threadId, title: '', messageCount: 0, createdAt: '', lastActiveAt: '' });
            return true;
          }
          return false;
        case 'status':
          if (threadId) {
            setCommandMenuOpen(false);
            openStatus(threadId);
            return true;
          }
          return false;
        default:
          return false;
      }
    },
    [newThread, openModel, openStatus, sessions],
  );

  const currentModelLabel = threadModel
    ? catalog.models.find(model => model.id === threadModel.model)?.label ?? threadModel.model
    : null;
  // A model this chat did not pick is inherited, and from where decides what to go and edit. A
  // row that only named the model could not explain why picking the global default changed
  // nothing: the agent's own pin was answering all along.
  const currentModelOrigin =
    threadModel?.source === 'agent' || threadModel?.source === 'agent-file'
      ? 'from the agent config'
      : threadModel?.source === 'global'
        ? 'global default'
        : null;

  const commandMenuOptions: SheetEntry[] = [
    {
      label: 'Model…',
      hint: currentModelLabel
        ? `current: ${currentModelLabel}${currentModelOrigin ? ` · ${currentModelOrigin}` : ''}`
        : undefined,
      onPress: () => {
        setCommandMenuOpen(false);
        openModel();
      },
    },
    ...(streaming
      ? [
          {
            label: 'Stop',
            onPress: () => {
              const threadId = activeThreadRef.current;
              if (threadId) connection.send(encodeChatStop(threadId));
              setCommandMenuOpen(false);
            },
          } satisfies SheetEntry,
        ]
      : []),
    // Model and Stop lead because only the conversation on screen can answer for them: the app
    // knows the live model and the running turn of the one in front of it, not of a thread
    // picked in the drawer. Everything below is the shared conversation list.
    ...(activeThread
      ? conversationActions(
          {
            threadId: activeThread,
            title: sessionStore.titleOf(activeThread) ?? '',
            messageCount: 0,
            createdAt: '',
            lastActiveAt: '',
            archived: archivedSessions.some(entry => entry.threadId === activeThread),
          },
          () => setCommandMenuOpen(false),
        )
      : []),
    // New conversations live on the + in the drawer (and the /new command). Session files sit in
    // this menu too, so the header keeps only the counter and the menu.
  ];

  const title =
    (activeThread ? runTitlesRef.current[activeThread] ?? sessionStore.titleOf(activeThread) : null) ??
    'new conversation';
  // Looked up rather than stored on the sub-agent view: a conversation renamed while a sub-agent is
  // open must not leave a stale name on the way back.
  const parentTitleOf = (threadId: string): string => sessionStore.titleOf(threadId) ?? 'conversation';
  const offline = status.state !== 'connected';
  const subtitle = [
    offline ? status.state : 'connected',
    pending > 0 ? `${pending} pending` : null,
    items.length > 0 ? `${items.length} items` : null,
    // The model that runs here: the one fact about a conversation worth seeing at a glance.
    currentModelLabel ? `model: ${currentModelLabel}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const hint = offline
    ? pending > 0
      ? `offline · ${pending} message(s) will send on reconnect`
      : 'offline · message will send on reconnect'
    : undefined;
  const selectedAgentInfo = agentsConfig?.agents.find(agent => agent.key === selectedAgent) ?? null;
  const selectedProviderInfo =
    agentsConfig?.providers.find(provider => provider.key === selectedProvider) ?? null;
  // Same grouping rule as the server's provider count: a model with no provider of its own
  // follows the global default provider.
  // Memoized because a discovering provider floods this with hundreds of models, and the array
  // identity is what ProviderScreen's own filter memo keys on: rebuilt here, it made that memo a
  // no-op and re-filtered the whole catalogue on every keystroke.
  const providerModels = useMemo(
    () =>
      selectedProvider
        ? catalog.models.filter(
            model => (model.provider ?? agentsConfig?.defaultProvider) === selectedProvider,
          )
        : EMPTY_MODELS,
    [agentsConfig?.defaultProvider, catalog.models, selectedProvider],
  );
  // Shapes handed to the scope pickers and the agent file editor. Built here once per catalogue
  // change instead of inside the JSX: rebuilt in the render body they were a new array on every
  // frame the shell received, and no child could hold a memo across one.
  const skillOptions = useMemo(
    () => skills.map(s => ({ name: s.name, description: s.description })),
    [skills],
  );
  const mcpOptions = useMemo(
    () =>
      mcpServers.map(s => ({
        name: s.name,
        description: `${s.transport} · ${s.state}`,
      })),
    [mcpServers],
  );

  /**
   * The skill transfer flow. A skill is a folder on the server, and the tiers it can land in are
   * the shared custom one and every workspace: the built-in tier is never a target (the release
   * resyncs it by hash at every boot), so it is not offered at all rather than refused after the
   * fact. Whether the name is already taken over there is read from the catalog the page already
   * holds, so the replace question is asked before the send, not derived from a refusal.
   */
  const skillTargetChoices = useCallback(
    (skill: SkillEntry): Array<{ target: SkillTarget; label: string; hint: string }> => {
      const isHere = (target: SkillTarget): boolean =>
        target.source === 'custom'
          ? skill.source === 'custom'
          : skill.source === 'workspace' &&
            (skill.workspace ?? 'default') === (target.workspace ?? 'default');
      return [
        {
          target: { source: 'custom' as const },
          label: 'Custom',
          hint: 'shared tier, visible from every workspace',
        },
        ...workspaces.map(workspace => ({
          target: { source: 'workspace' as const, workspace: workspace.key },
          label: `Workspace · ${workspace.key}`,
          hint: workspace.path,
        })),
      ].filter(choice => !isHere(choice.target));
    },
    [workspaces],
  );

  const skillAt = useCallback(
    (name: string, target: SkillTarget): boolean =>
      skills.some(
        entry =>
          entry.name === name &&
          (target.source === 'custom'
            ? entry.source === 'custom'
            : entry.source === 'workspace' &&
              (entry.workspace ?? 'default') === (target.workspace ?? 'default')),
      ),
    [skills],
  );

  const sendSkillTransfer = useCallback(
    (
      skill: SkillEntry,
      mode: 'copy' | 'move',
      target: SkillTarget,
      label: string,
      overwrite?: boolean,
    ): void => {
      setSkillMenu(null);
      setSkillTargets(null);
      setSkillReplace(null);
      setSkillsError(null);
      setSkillsNotice(
        `${skill.name} ${mode === 'move' ? 'moved' : 'copied'} to ${label}${overwrite ? ', replacing the previous one' : ''}`,
      );
      // A move changes the tier the open document is addressed by, so its URL is stale: the
      // reader would keep showing a file that is no longer there.
      if (mode === 'move') setSkillViewer(null);
      connection
        .send(encodeSkillsTransfer(mode, skill, target, overwrite))
        .catch(() => {});
    },
    // connection lives outside the component: it is not a dependency, it is the transport.
    [],
  );

  const skillMenuOptions = useMemo((): SheetEntry[] => {
    const skill = skillMenu;
    if (!skill) return [];
    return [
      {
        label: 'Copy to…',
        hint:
          skill.source === 'built-in'
            ? 'fork the shipped skill, the original keeps being synced'
            : 'the original stays where it is',
        onPress: () => {
          setSkillTargets({ skill, mode: 'copy' });
          setSkillMenu(null);
        },
      },
      // Built-in is copy-from only: a delete there is undone by the next boot's resync, so the
      // move would look like it silently came back.
      ...(skill.source === 'built-in'
        ? []
        : [
            {
              label: 'Move to…',
              hint: 'the original is removed once the copy landed',
              onPress: () => {
                setSkillTargets({ skill, mode: 'move' });
                setSkillMenu(null);
              },
            },
          ]),
    ];
  }, [skillMenu]);

  const skillTargetOptions = useMemo((): SheetEntry[] => {
    if (!skillTargets) return [];
    const { skill, mode } = skillTargets;
    return skillTargetChoices(skill).map(choice => {
      const taken = skillAt(skill.name, choice.target);
      return {
        key: `${choice.target.source}:${choice.target.workspace ?? ''}`,
        label: choice.label,
        hint: taken ? `${choice.hint} · a skill of that name is already there` : choice.hint,
        danger: taken,
        onPress: () => {
          if (taken) {
            setSkillReplace({ skill, mode, target: choice.target, label: choice.label });
            setSkillTargets(null);
            return;
          }
          sendSkillTransfer(skill, mode, choice.target, choice.label);
        },
      };
    });
  }, [skillAt, skillTargetChoices, skillTargets, sendSkillTransfer]);
  const mcpScopeOptions = useMemo(
    () =>
      mcpServers.map(s => ({
        name: s.name,
        description: `${s.transport} · ${s.state}${s.state === 'failed' ? ` · ${s.lastError ?? ''}` : ''}`,
      })),
    [mcpServers],
  );
  const workspaceKeys = useMemo(() => workspaces.map(w => w.key), [workspaces]);
  /** Which instruction layers the agent file's workspace has switched off. */
  const agentFileLayerOff = useMemo(() => {
    const ws = agentsFile.editor?.frame?.workspace ?? 'default';
    const off: Record<string, boolean> = {};
    for (const entry of instructions.entries) {
      if (entry.workspace === ws && entry.off) off[layerOfFile(entry.file)] = true;
    }
    return off;
  }, [agentsFile.editor?.frame?.workspace, instructions.entries]);

  const openInstruction = (workspace: string, file: string): void => {
    instructionsStore.openEditor(workspace, file);
    setSettingsPage('instruction');
    connection.send(encodeInstructionsGet(workspace, file)).catch(() => {});
  };
  // A workspace the list no longer carries (removed while its page was open, or renamed under it)
  // still has a page: the key is what the instruction rows are addressed by, so a synthetic entry
  // keeps the page honest instead of bouncing to the list.
  const workspaceEntry: WorkspaceEntry = workspaces.find(w => w.key === selectedWorkspace) ?? {
    key: selectedWorkspace,
    path: '',
    default: selectedWorkspace === 'default',
  };
  const workspacePage = (
    <WorkspaceScreen
      workspace={workspaceEntry}
      entries={instructions.entries}
      nested={instructions.nested}
      nestedTruncated={instructions.nestedTruncated}
      workspaceKeys={workspaceKeys}
      status={instructions.status}
      error={instructions.error}
      configError={workspacesError}
      busy={workspacesBusy}
      backLabel={workspaceFrom === 'agent' ? 'Back to agent' : 'Back to workspaces'}
      onBack={() => setSettingsPage(workspaceFrom === 'agent' ? 'agent' : 'workspaces')}
      onOpen={entry => openInstruction(entry.workspace, entry.file)}
      onOpenLayer={entry => {
        setLayerTarget({ workspace: entry.workspace, file: entry.file });
        instructionsStore.openLayer(entry.workspace, entry.file);
        setSettingsPage('instruction-layer');
      }}
      onOpenNested={item => {
        instructionsStore.openEditor(item.workspace, item.path);
        setSettingsPage('instruction');
        connection.send(encodeInstructionsGetNested(item.workspace, item.path)).catch(() => {});
      }}
      onRename={(from, to) => {
        setWorkspacesBusy(true);
        // The page follows the rename: its subject is the key, and the old one stops existing.
        setSelectedWorkspace(to);
        connection.send(encodeWorkspacesRename(from, to)).catch(() => {});
      }}
      onSetPath={(key, path) => {
        setWorkspacesBusy(true);
        connection.send(encodeWorkspacesSetPath(key, path)).catch(() => {});
      }}
      onRemove={key => {
        setWorkspacesBusy(true);
        setSettingsPage('workspaces');
        connection.send(encodeWorkspacesRemove(key)).catch(() => {});
      }}
    />
  );
  // Both pages double as the fallback when a detail page has no subject yet (config not loaded,
  // or a key that no longer exists), so they are built once here.
  const openTagContextEditor = (name: string): void => {
    setTagContextEditor(name);
    setSettingsPage('number');
  };
  const saveTagContextCap = (value: number | null): void => {
    if (!tagContextEditor) return;
    const tag = tagsState.tags?.find(entry => entry.name === tagContextEditor);
    if (tag) {
      connection
        .send(encodeTagsUpsert(tagContextEditor, tag.model, tag.effort, value ?? undefined))
        .catch(() => {});
      connection.send(encodeModelList()).catch(() => {});
      connection.send(encodeAgentsConfigGet()).catch(() => {});
    }
    setSettingsPage('tags');
    setTagContextEditor(null);
  };
  const openTagEditor = (name: string): void => {
    // The editor is a settings page now, whatever opened it: a /tag command from the chat
    // lands in Settings the same way the bare /tag does.
    setTagEditor({ name, picker: pickerStart });
    setSettingsOpen(true);
    setSettingsPage('tag-editor');
  };
  /** The /tag command: bare opens the tags page, `new "name"` opens the tag editor. */
  const dispatchTagCommand = useCallback(
    (text: string): boolean => {
      const name = parseTagCommand(text);
      if (name === undefined) return false;
      if (name === null) {
        setSettingsOpen(true);
        setSettingsPage('tags');
        return true;
      }
      if (name === '') {
        setNewTagPrompt(true);
        return true;
      }
      if (name === 'Default') {
        setSettingsOpen(true);
        setSettingsPage('tags');
        return true;
      }
      openTagEditor(name);
      return true;
    },
    [],
  );
  const createTagNamed = (name: string): void => {
    setNewTagPrompt(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === 'Default') return;
    openTagEditor(trimmed);
  };
  const deleteTagConfirmed = (): void => {
    if (!tagToDelete) return;
    connection.send(encodeTagsDelete(tagToDelete)).catch(() => {});
    connection.send(encodeModelList()).catch(() => {});
    connection.send(encodeAgentsConfigGet()).catch(() => {});
    setTagToDelete(null);
  };
  const agentsPage = (
    <AgentsSettingsScreen
      config={agentsConfig}
      status={agentsState.status}
      error={agentsState.error}
      onBack={() => setSettingsPage('index')}
      onOpenDefaultModel={() => {
        setAgentPicker(pickerStart);
        setAgentModelFor('global');
        setSettingsPage('model-picker');
      }}
      onOpenFallback={() => {
        setAgentPicker(pickerStart);
        setAgentModelFor('fallback');
        setSettingsPage('model-picker');
      }}
      onOpenAgent={key => {
        setSelectedAgent(key);
        setSettingsPage('agent');
      }}
      onNewAgent={() => setSettingsPage('newagent')}
    />
  );
  const providersPage = (
    <ProvidersScreen
      providers={agentsConfig?.providers ?? []}
      onBack={() => setSettingsPage('index')}
      onNewProvider={() => {
        setProviderBusy(false);
        setProviderEdit({ mode: 'create', key: null });
        setSettingsPage('provider-edit');
      }}
      onOpenProvider={key => {
        if (key === 'tags') {
          setSettingsPage('tags');
          return;
        }
        setSelectedProvider(key);
        setSettingsPage('provider');
      }}
    />
  );
  const tagsPage = (
    <TagsScreen
      tags={tagsState.tags}
      status={tagsState.status}
      error={tagsState.error}
      onBack={() => setSettingsPage('providers')}
      onNewTag={() => setNewTagPrompt(true)}
      onEditTag={openTagEditor}
      onDeleteTag={setTagToDelete}
      onOpenContextCap={openTagContextEditor}
    />
  );

  // ---- Agent scope / workspace / number / file / config editors ------------------------------

  const openScope = (kind: 'skills' | 'mcp', target: 'config' | 'file'): void => {
    setScopeEditor({ kind, target });
    setScopeSaving(false);
    setSettingsPage('scope');
  };
  const configModeOf = (mode: ScopeMode): 'inherit' | 'all' | 'list' => (mode === 'absent' ? 'inherit' : mode);
  const saveScope = (mode: ScopeMode, names: string[]): void => {
    const editor = scopeEditor;
    if (!editor || !selectedAgent) return;
    if (editor.target === 'file') {
      const file = agentsFile.editor;
      if (!file?.frame) return;
      const patch =
        editor.kind === 'skills'
          ? { skillsMode: mode as FileScopeMode, skills: mode === 'list' ? names : undefined }
          : { mcpMode: mode as FileScopeMode, mcp: mode === 'list' ? names : undefined };
      agentsFileStore.stage(file.name, patch);
      setSettingsPage('file');
      setScopeEditor(null);
      return;
    }
    setScopeSaving(true);
    connection.send(encodeAgentsScopeSet(selectedAgent, editor.kind, configModeOf(mode), names)).catch(() => {});
    setSettingsPage('agent');
    setScopeEditor(null);
  };
  const openWorkspacePicker = (): void => {
    setWorkspacePickerAgent(selectedAgent);
    setSettingsPage('workspace-picker');
  };
  const saveWorkspace = (key: string | null): void => {
    if (!workspacePickerAgent) return;
    connection.send(encodeAgentsWorkspaceSet(workspacePickerAgent, key)).catch(() => {});
    setSettingsPage('agent');
    setWorkspacePickerAgent(null);
  };
  const openNumberEditor = (field: 'iterations' | 'contextcap'): void => {
    if (!selectedAgent) return;
    setNumberEditor({ field, agent: selectedAgent });
    setSettingsPage('number');
  };
  const saveNumber = (value: number | null): void => {
    if (!numberEditor) return;
    connection
      .send(
        numberEditor.field === 'iterations'
          ? encodeAgentsIterationsSet(numberEditor.agent, value)
          : encodeAgentsContextCapSet(numberEditor.agent, value),
      )
      .catch(() => {});
    setSettingsPage('agent');
    setNumberEditor(null);
  };
  const saveProviderEdit = (patch: {
    key: string;
    providerType: 'openai' | 'claude-sdk' | 'codex';
    baseUrl: string;
    group: string;
    discover: boolean;
    promptCache: boolean;
    pricingProvider: string;
    fallbackModel: string;
    apiKeyEnv: string;
    envValue: string;
  }): void => {
    if (!providerEdit || providerBusy) return;
    const from = providerEdit.key;
    setProviderBusy(true);
    if (from !== null && from !== patch.key) {
      connection.send(encodeProvidersRename(from, patch.key)).catch(() => {});
    }
    connection
      .send(
        encodeProvidersUpsert(patch.key, {
          providerType: patch.providerType,
          baseUrl: patch.baseUrl,
          group: patch.group,
          discover: patch.discover,
          promptCache: patch.promptCache,
          pricingProvider: patch.pricingProvider,
          fallbackModel: patch.fallbackModel,
          apiKeyEnv: patch.apiKeyEnv,
        }),
      )
      .catch(() => {});
    // The one field that rides on a create: a fresh name gets its value in the same Save.
    if (patch.apiKeyEnv && patch.envValue) {
      connection.send(encodeProvidersEnvSet(patch.apiKeyEnv, patch.envValue)).catch(() => {});
    }
    setProviderEdit(null);
    if (providerEdit.mode === 'create') {
      setSettingsPage('providers');
    } else {
      setSelectedProvider(patch.key);
      setSettingsPage('provider');
    }
  };
  const deleteProviderConfirmed = (removeKeyToo: boolean): void => {
    if (!providerToDelete) return;
    const { key, keyEnv } = providerToDelete;
    connection.send(encodeProvidersRemove(key)).catch(() => {});
    if (removeKeyToo && keyEnv) {
      connection.send(encodeProvidersEnvRemove(keyEnv)).catch(() => {});
    }
    setProviderToDelete(null);
    setSelectedProvider(null);
    setProviderEdit(null);
    setSettingsPage('providers');
  };
  const saveEnvValue = (name: string, value: string): void => {
    if (providerBusy) return;
    setProviderBusy(true);
    connection.send(encodeProvidersEnvSet(name, value)).catch(() => {});
  };
  const renameEnvVariable = (from: string, to: string): void => {
    if (providerBusy) return;
    setProviderBusy(true);
    connection.send(encodeProvidersEnvRename(from, to)).catch(() => {});
  };
  const bindProviderEnv = (name: string): void => {
    const key = providerEdit?.key;
    if (!key || providerBusy) return;
    setProviderBusy(true);
    connection
      .send(encodeProvidersUpsert(key, { apiKeyEnv: name }))
      .catch(() => {});
  };
  const unbindProviderEnv = (): void => {
    const key = providerEdit?.key;
    if (!key || providerBusy) return;
    setProviderBusy(true);
    connection.send(encodeProvidersUpsert(key, { apiKeyEnv: '' })).catch(() => {});
  };
  const saveAgentFile = (): void => {
    const editor = agentsFile.editor;
    if (!editor?.frame || !editor.editable) return;
    agentsFileStore.markSaving();
    const frame = editor.frame;
    const fields: AgentFileFieldsOut = {
      sha: editor.sha,
      description: frame.description,
      base: frame.base,
      tools: frame.tools,
      skillsMode: frame.skillsMode,
      skills: frame.skills,
      mcpMode: frame.mcpMode,
      mcp: frame.mcp,
      model: frame.model,
      workspace: frame.workspace,
      maxIterations: frame.maxIterations,
      contextCap: frame.contextCap,
      instructions: frame.instructions,
      prompt: frame.prompt,
    };
    connection.send(encodeAgentFileSet(editor.name, fields)).catch(() => {});
  };
  const closeAgentFile = (): void => {
    agentsFileStore.close();
    setSettingsPage('agent');
  };
  const forkAgent = (): void => {
    if (!selectedAgentInfo) return;
    // A fork is a create with the same name in the custom tier: it overrides the built-in,
    // which is the whole point of the tier model. The agents list refreshes on the result.
    connection.send(encodeAgentFileCreate(selectedAgentInfo.key, selectedAgentInfo.description)).catch(() => {});
    connection.send(encodeAgentsConfigGet()).catch(() => {});
    setSettingsPage('agents');
  };
  const deleteAgent = (): void => {
    const editor = agentsFile.editor;
    if (!editor) return;
    connection.send(encodeAgentFileDelete(editor.name)).catch(() => {});
    closeAgentFile();
  };
  const createAgent = (name: string, description: string): void => {
    setNewAgentBusy(true);
    connection.send(encodeAgentFileCreate(name, description)).catch(() => {});
    setSettingsPage('agents');
  };
  const toggleTool = (name: string, disabled: boolean): void => {
    setToolsSaving(true);
    connection.send(encodeToolsToggle(name, disabled)).catch(() => {});
  };
  const addMcp = (
    name: string,
    transport: 'stdio' | 'sse' | 'http',
    spec: { command?: string; args?: string[]; url?: string },
  ): void => {
    setMcpBusy(true);
    connection.send(encodeMcpAdd(name, transport, spec)).catch(() => {});
  };
  const removeMcp = (name: string): void => {
    setMcpBusy(true);
    connection.send(encodeMcpRemove(name)).catch(() => {});
  };
  const enableMcp = (name: string, enabled: boolean): void => {
    setMcpBusy(true);
    connection.send(encodeMcpEnable(name, enabled)).catch(() => {});
  };
  const saveConfig = (): void => {
    if (!configEditor) return;
    setConfigEditor({ ...configEditor, status: 'saving' });
    connection.send(encodeConfigSet(configEditor.sha, configEditor.draft)).catch(() => {});
  };
  const reloadConfig = (): void => {
    setConfigEditor({
      status: 'loading',
      draft: '',
      loaded: '',
      sha: '',
      maxBytes: 0,
      error: null,
      changed: [],
      rebootRequired: [],
    });
    connection.send(encodeConfigGet()).catch(() => {});
  };

  // The scope editor reads its subject from the agent row (config) or the open file (file).
  const scopeSubject =
    scopeEditor && (scopeEditor.target === 'config' ? selectedAgentInfo : agentsFile.editor?.frame) ? (
      scopeEditor.target === 'config'
        ? selectedAgentInfo
          ? scopeEditor.kind === 'skills'
            ? { mode: scopeModeOf(selectedAgentInfo.skills), names: selectedAgentInfo.skills ?? [], unknown: selectedAgentInfo.unknownSkills ?? [] }
            : { mode: scopeModeOf(selectedAgentInfo.mcp), names: selectedAgentInfo.mcp ?? [], unknown: selectedAgentInfo.unknownMcp ?? [] }
          : null
        : agentsFile.editor?.frame
          ? scopeEditor.kind === 'skills'
            ? { mode: scopeModeOfFile(agentsFile.editor.frame.skillsMode), names: agentsFile.editor.frame.skills ?? [], unknown: agentsFile.editor.frame.skills ? unknownOfList(agentsFile.editor.frame.skills, skills) : [] }
            : { mode: scopeModeOfFile(agentsFile.editor.frame.mcpMode), names: agentsFile.editor.frame.mcp ?? [], unknown: agentsFile.editor.frame.mcp ? unknownOfList(agentsFile.editor.frame.mcp, mcpServers) : [] }
          : null
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={palette.bg}
      />
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          {settingsOpen ? (
            settingsPage === 'index' ? (
              <SettingsScreen
                skillsCount={skills.length}
                toolsCount={tools.length}
                providersCount={agentsConfig?.providers.length ?? 0}
                onBack={() => setSettingsOpen(false)}
                onOpenCategory={category => setSettingsPage(category)}
              />
            ) : settingsPage === 'general' ? (
              <GeneralSettingsScreen
                url={url}
                onUrlChange={changeUrl}
                voice={voice}
                onVoiceModeChange={changeVoiceMode}
                status={status}
                serverVersion={serverVersion}
                appVersion={appVersion}
                pending={pending}
                deviceInfo={deviceInfo}
                onConnect={() => connection.connect(url)}
                onDisconnect={() => connection.disconnect()}
                onClearOutbox={() => {
                  connection.clearOutbox();
                  setPending(0);
                }}
                onBack={() => setSettingsPage('index')}
              />
            ) : settingsPage === 'other' ? (
              <OtherSettingsScreen
                themeMode={themeControl.mode}
                onThemeModeChange={themeControl.setMode}
                onOpenDiagnostics={openDiagnostics}
                onBack={() => setSettingsPage('index')}
              />
            ) : settingsPage === 'agents' ? (
              agentsPage
            ) : settingsPage === 'model-picker' ? (
              agentModelFor ? (
                <AgentModelPickerPage
                  target={agentModelFor}
                  config={agentsConfig}
                  state={agentPicker}
                  onStateChange={setAgentPicker}
                  onBack={() => {
                    // The picker returns where it was opened from: the agents list for the
                    // global default and the fallback, the agent page for an agent key.
                    const from = agentModelFor === 'global' || agentModelFor === 'fallback' ? 'agents' : 'agent';
                    setAgentModelFor(null);
                    setSettingsPage(from);
                  }}
                />
              ) : (
                agentsPage
              )
            ) : settingsPage === 'tag-editor' ? (
              tagEditor ? (
                <TagEditorPage
                  name={tagEditor.name}
                  state={tagEditor.picker}
                  onStateChange={picker => setTagEditor(current => (current ? { ...current, picker } : current))}
                  onBack={() => {
                    setTagEditor(null);
                    setSettingsPage('tags');
                  }}
                />
              ) : (
                tagsPage
              )
            ) : settingsPage === 'instruction-layer' ? (
              layerTarget && instructions.layer ? (
                <InstructionLayerScreen
                  layer={instructions.layer}
                  entry={instructions.entries.find(
                    e => e.workspace === layerTarget.workspace && e.file === layerTarget.file,
                  ) ?? instructions.entries[0]!}
                  entries={instructions.entries}
                  workspaces={workspaces}
                  files={instructions.files}
                  agentLayers={instructions.agentLayers}
                  saving={instructions.layer.saving > 0}
                  error={instructions.layer.error}
                  backLabel="Back to the workspace"
                  onBack={() => {
                    setLayerTarget(null);
                    instructionsStore.closeLayer();
                    setSettingsPage('workspace');
                  }}
                  onChange={patch => instructionsStore.editLayer(patch)}
                  onSave={applyToAll => {
                    const layer = instructions.layer;
                    if (!layer) return;
                    const files = applyToAll ? instructions.files : [layer.file];
                    instructionsStore.markLayerSaving(files.length);
                    for (const file of files) {
                      connection
                        .send(encodeInstructionsLayerSet(layer.workspace, file, layer.inherit, layer.off))
                        .catch(() => {});
                    }
                    // A send() that resolves does not mean the server answered: the outbox is in
                    // memory and dies with the process. A silent save must come back, not spin.
                    setTimeout(() => instructionsStore.failLayer('no answer from the server · try again'), 4000);
                  }}
                />
              ) : (
                workspacePage
              )
            ) : settingsPage === 'workspace' ? (
              workspacePage
            ) : settingsPage === 'instruction' ? (
              instructions.editor ? (
                <InstructionEditorScreen
                  editor={instructions.editor}
                  maxBytes={instructions.maxBytes}
                  onBack={() => {
                    instructionsStore.closeEditor();
                    setSettingsPage('workspace');
                  }}
                  onChange={draft => instructionsStore.edit(draft)}
                  onSave={() => {
                    const editor = instructions.editor;
                    if (!editor) return;
                    instructionsStore.markSaving();
                    connection
                      .send(encodeInstructionsSet(editor.workspace, editor.file, editor.draft, editor.sha))
                      .catch(() => {});
                  }}
                  onReload={() => {
                    const editor = instructions.editor;
                    if (!editor) return;
                    instructionsStore.openEditor(editor.workspace, editor.file);
                    connection.send(encodeInstructionsGet(editor.workspace, editor.file)).catch(() => {});
                  }}
                />
              ) : (
                workspacePage
              )
            ) : settingsPage === 'providers' ? (
              providersPage
            ) : settingsPage === 'tags' ? (
              tagsPage
            ) : settingsPage === 'provider' ? (
              selectedProviderInfo ? (
                <ProviderScreen
                  // Keyed by provider: switching to another one starts with an empty search
                  // instead of the previous provider's, and without a reset to remember.
                  key={selectedProviderInfo.key}
                  provider={selectedProviderInfo}
                  models={providerModels}
                  defaultModel={agentsConfig?.defaultModel ?? ''}
                  searchHandle={providerSearch}
                  error={agentsState.error}
                  onSetDefault={setGlobalDefaultModel}
                  onEditProvider={() => {
                    setProviderBusy(false);
                    setProviderEdit({ mode: 'edit', key: selectedProviderInfo.key });
                    setSettingsPage('provider-edit');
                  }}
                  onBack={() => setSettingsPage('providers')}
                />
              ) : (
                providersPage
              )
            ) : settingsPage === 'provider-edit' ? (
              providerEdit ? (
                <ProviderEditScreen
                  mode={providerEdit.mode}
                  provider={
                    providerEdit.mode === 'edit' && providerEdit.key
                      ? (agentsConfig?.providers.find(p => p.key === providerEdit.key) ?? null)
                      : null
                  }
                  env={providersEnvState.env}
                  error={providersEnvState.error}
                  busy={providerBusy}
                  onSave={saveProviderEdit}
                  onDelete={() =>
                    setProviderToDelete({
                      key: providerEdit.key ?? '',
                      ...(providerEdit.key
                        ? { keyEnv: agentsConfig?.providers.find(p => p.key === providerEdit.key)?.keyEnv }
                        : {}),
                    })
                  }
                  onOpenEnv={() => setSettingsPage('provider-env')}
                  onBack={() => {
                    if (providerEdit.mode === 'create') setSettingsPage('providers');
                    else setSettingsPage('provider');
                    setProviderEdit(null);
                  }}
                />
              ) : (
                providersPage
              )
            ) : settingsPage === 'provider-env' ? (
              providerEdit?.key &&
              agentsConfig?.providers.find(p => p.key === providerEdit.key) ? (
                <ProviderEnvScreen
                  provider={agentsConfig.providers.find(p => p.key === providerEdit.key)!}
                  env={providersEnvState.env}
                  error={providersEnvState.error}
                  onBack={() => setSettingsPage('provider-edit')}
                  onSaveValue={saveEnvValue}
                  onRename={renameEnvVariable}
                  onBind={bindProviderEnv}
                  onUnbind={unbindProviderEnv}
                />
              ) : (
                providersPage
              )
            ) : settingsPage === 'agent' ? (
              selectedAgentInfo ? (
                <AgentDetailScreen
                  agent={selectedAgentInfo}
                  error={agentsState.error}
                  onBack={() => setSettingsPage('agents')}
                  onOpenModel={() => {
                    if (!selectedAgent) return;
                    setAgentPicker(pickerStart);
                    setAgentModelFor(selectedAgent);
                    setSettingsPage('model-picker');
                  }}
                  onOpenInstructions={() => {
                    // The agent reads one workspace's prompt: the one it is pinned to, the
                    // default when it is not. Landing on a list of every workspace would leave
                    // the reader to work out which of them this agent actually reads.
                    setSelectedWorkspace(selectedAgentInfo?.workspace ?? 'default');
                    setWorkspaceFrom('agent');
                    setSettingsPage('workspace');
                  }}
                  onOpenScope={kind => openScope(kind, 'config')}
                  onOpenWorkspace={openWorkspacePicker}
                  onOpenIterations={() => openNumberEditor('iterations')}
                  onOpenContextCap={() => openNumberEditor('contextcap')}
                  onOpenFile={() => {
                    if (!selectedAgent) return;
                    setSettingsPage('file');
                  }}
                  onFork={forkAgent}
                />
              ) : (
                agentsPage
              )
            ) : settingsPage === 'scope' ? (
              scopeEditor && scopeSubject && selectedAgent ? (
                <ScopeEditorScreen
                  title={scopeEditor.kind === 'skills' ? 'Skills' : 'MCP servers'}
                  subtitle={`for ${selectedAgent} · ${
                    scopeEditor.target === 'config' ? 'saved to the server config' : 'edited in the definition file'
                  }`}
                  kind={scopeEditor.kind}
                  available={scopeEditor.kind === 'skills' ? skillOptions : mcpScopeOptions}
                  mode={scopeSubject.mode}
                  names={scopeSubject.names}
                  unknown={scopeSubject.unknown}
                  unsetLabel={scopeEditor.target === 'config' ? 'Inherit' : 'Unset'}
                  unsetValue={scopeEditor.target === 'config' ? 'inherit' : 'absent'}
                  error={agentsState.error}
                  saving={scopeSaving}
                  onBack={() => {
                    setSettingsPage(scopeEditor.target === 'file' ? 'file' : 'agent');
                    setScopeEditor(null);
                  }}
                  onSave={saveScope}
                />
              ) : (
                agentsPage
              )
            ) : settingsPage === 'workspace-picker' ? (
              selectedAgentInfo ? (
                <WorkspacePickerScreen
                  workspaces={workspaces}
                  current={selectedAgentInfo.workspace ?? null}
                  unknown={selectedAgentInfo.unknownWorkspace === true}
                  error={agentsState.error}
                  saving={false}
                  subtitle="where this agent runs its sessions"
                  backLabel="Back to agent"
                  onBack={() => setSettingsPage('agent')}
                  onSave={saveWorkspace}
                />
              ) : (
                agentsPage
              )
            ) : settingsPage === 'number' ? (
              numberEditor && selectedAgentInfo ? (
                <NumberEditorScreen
                  title={numberEditor.field === 'iterations' ? 'Iterations' : 'Context cap'}
                  hint={numberEditor.field === 'iterations' ? 'per-agent budget · default when unset' : 'ceiling · 0 lifts it'}
                  value={numberEditor.field === 'iterations' ? selectedAgentInfo.maxIterations ?? null : selectedAgentInfo.contextCap ?? null}
                  placeholder={
                    numberEditor.field === 'iterations'
                      ? 'a positive integer, blank = default'
                      : '0 lifts the ceiling, blank = global cap'
                  }
                  min={1}
                  allowZero={numberEditor.field === 'contextcap'}
                  error={agentsState.error}
                  saving={false}
                  onBack={() => setSettingsPage('agent')}
                  onSave={saveNumber}
                />
              ) : tagContextEditor ? (
                <NumberEditorScreen
                  title={`Tag ${tagContextEditor} · context cap`}
                  hint="ceiling for runs through this tag · 0 lifts it"
                  value={tagsState.tags?.find(tag => tag.name === tagContextEditor)?.contextCap ?? null}
                  placeholder="0 lifts the ceiling, blank = agent/global setting"
                  min={1}
                  allowZero
                  error={tagsState.error}
                  saving={false}
                  onBack={() => setSettingsPage('tags')}
                  onSave={saveTagContextCap}
                />
              ) : (
                agentsPage
              )
            ) : settingsPage === 'file' ? (
              agentsFile.editor ? (
                <AgentFileScreen
                  editor={agentsFile.editor}
                  skills={skillOptions}
                  mcpServers={mcpOptions}
                  error={agentsFile.error}
                  layerOff={agentFileLayerOff}
                  onBack={closeAgentFile}
                  onChange={patch => {
                    const editor = agentsFile.editor;
                    if (editor) agentsFileStore.stage(editor.name, patch);
                  }}
                  onSave={saveAgentFile}
                  onFork={forkAgent}
                  onDelete={deleteAgent}
                />
              ) : (
                agentsPage
              )
            ) : settingsPage === 'newagent' ? (
              <NewAgentScreen
                error={agentsState.error}
                busy={newAgentBusy}
                onBack={() => setSettingsPage('agents')}
                onCreate={createAgent}
              />
            ) : settingsPage === 'config' ? (
              configEditor ? (
                <ConfigScreen
                  editor={configEditor}
                  onBack={() => setSettingsPage('index')}
                  onChange={draft => setConfigEditor(current => (current ? { ...current, draft, error: null } : current))}
                  onSave={saveConfig}
                  onReload={reloadConfig}
                />
              ) : (
                <EmptyCategoryScreen title="Config" onBack={() => setSettingsPage('index')} />
              )
            ) : settingsPage === 'skills' ? (
              <SkillsScreen
                skills={skills}
                workspaces={workspaces}
                error={skillsError ?? undefined}
                notice={skillsNotice ?? undefined}
                onBack={() => {
                  setSkillsNotice(null);
                  setSettingsPage('index');
                }}
                onOpenSkill={skill => {
                  if (!deviceInfo) return;
                  setSkillViewer({
                    url: skillUrl(mediaBase, deviceInfo, skill.source, skill.name, skill.workspace),
                    skill,
                  });
                }}
                onSkillActions={setSkillMenu}
              />
            ) : settingsPage === 'workspaces' ? (
              <WorkspacesScreen
                workspaces={workspaces}
                entries={instructions.entries}
                nested={instructions.nested}
                error={workspacesError}
                busy={workspacesBusy}
                onBack={() => setSettingsPage('index')}
                onAdd={(key, path) => {
                  setWorkspacesBusy(true);
                  connection.send(encodeWorkspacesAdd(key, path)).catch(() => {});
                }}
                onOpen={key => {
                  setSelectedWorkspace(key);
                  setWorkspaceFrom('workspaces');
                  setSettingsPage('workspace');
                }}
              />
            ) : settingsPage === 'diagnostics' ? (
              <DiagnosticsScreen
                snapshot={diagSnapshot}
                logs={diagLogs}
                lastRun={lastRun}
                busy={diagBusy}
                onSnapshot={openDiagnostics}
                onLogs={fetchLogs}
                backLabel="Back to other"
                onBack={() => setSettingsPage('other')}
              />
            ) : settingsPage === 'tools' ? (
              <ToolsScreen
                tools={tools}
                missing={toolsMissing}
                error={toolsError ?? undefined}
                saving={toolsSaving}
                onBack={() => setSettingsPage('index')}
                onToggle={toggleTool}
              />
            ) : settingsPage === 'mcps' ? (
              <McpsScreen
                servers={mcpServers}
                error={mcpError}
                busy={mcpBusy}
                onBack={() => setSettingsPage('index')}
                onAdd={addMcp}
                onRemove={removeMcp}
                onEnable={enableMcp}
              />
            ) : (
              <EmptyCategoryScreen title="Other" onBack={() => setSettingsPage('index')} />
            )
          ) : archivesOpen ? (
            <ArchivesScreen
              sessions={archivedSessions}
              onBack={() => setArchivesOpen(false)}
              onOpenThread={openThreadFromArchives}
              onThreadMenu={setThreadMenu}
            />
          ) : filesOpen ? (
            <FilesScreen
              mediaBase={mediaBase}
              deviceInfo={deviceInfo}
              files={sessionFiles}
              totalBytes={filesTotal}
              onBack={() => setFilesOpen(false)}
              error={filesError ?? undefined}
              onDelete={setFileToDelete}
              onOpenImage={setImageViewer}
              onOpenText={setTextViewer}
              onOpenVideo={setVideoViewer}
            />
          ) : (
            <ChatScreen
              threadId={activeThread ?? ''}
              title={title}
              subtitle={subtitle}
              connectionState={status.state}
              locationEnabled={locationEnabled}
              items={items}
              mediaBase={mediaBase}
              deviceInfo={deviceInfo}
              hint={hint}
              autoFocusHero={autoFocusHero}
              onOpenDrawer={subagentView ? leaveSubAgent : () => setDrawerOpen(true)}
              onStatusPress={openSettings}
              onSend={sendChat}
              subagentCount={subagentCount}
              onAgentsPress={() => setAgentsOpen(true)}
              subagentDoors={subagentDoors}
              onOpenSubAgent={openSubAgentFromCard}
              {...(subagentView
                ? {
                    subagent: {
                      id: subagentView.id,
                      type: subagentView.type,
                      status: streaming ? ('running' as const) : subagentView.status,
                      messageCount: subagentView.messageCount,
                      parentTitle: parentTitleOf(subagentView.parentThreadId),
                    },
                    onSubAgentMenu: () => setSubagentMenuOpen(true),
                  }
                : {})}
              onBubbleMenu={setBubbleMenu}
              onOpenImage={setImageViewer}
              onOpenText={setTextViewer}
              onOpenVideo={setVideoViewer}
              onOpenFile={setFileViewer}
              onOpenMenu={() => setCommandMenuOpen(true)}
              onCommandEntered={dispatchCommand}
              onTagCommand={dispatchTagCommand}
              streaming={streaming}
              onStop={() => {
                if (activeThread) connection.send(encodeChatStop(activeThread));
              }}
              onNewThread={newThread}
              onLoadOlder={loadOlderHistory}
              loadingOlder={historyPage.loading}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <Drawer
        open={drawerOpen}
        sessions={sessions}
        unread={unread}
        activeThread={activeThread}
        connectionState={status.state}
        pending={pending}
        onClose={() => setDrawerOpen(false)}
        onOpenThread={openThreadFromDrawer}
        subagentCount={globalAgents.length}
        onOpenSubAgents={() => {
          setDrawerOpen(false);
          setAgentsGlobalOpen(true);
        }}
        onNewThread={newThread}
        onThreadMenu={setThreadMenu}
        onOpenSettings={() => {
          setDrawerOpen(false);
          openSettings();
        }}
        onOpenJobs={openJobs}
        archivedCount={archivedSessions.length}
        onOpenArchives={() => {
          setDrawerOpen(false);
          setArchivesOpen(true);
        }}
      />

      {imageViewer ? (
        <ImageViewer
          url={imageViewer.url}
          filename={imageViewer.filename}
          sizeBytes={imageViewer.sizeBytes}
          onClose={() => setImageViewer(null)}
        />
      ) : null}

      {textViewer ? (
        <TextViewer
          url={textViewer.url}
          filename={textViewer.filename}
          onClose={() => setTextViewer(null)}
        />
      ) : null}

      {videoViewer ? (
        <VideoViewer
          url={videoViewer.url}
          filename={videoViewer.filename}
          onClose={() => setVideoViewer(null)}
        />
      ) : null}

      {fileViewer ? (
        <FileViewer
          filename={fileViewer.filename}
          url={fileViewer.url}
          sizeBytes={fileViewer.sizeBytes}
          onClose={() => setFileViewer(null)}
        />
      ) : null}

      {skillViewer ? (
        <SkillViewer
          url={skillViewer.url}
          skill={skillViewer.skill}
          onClose={() => setSkillViewer(null)}
          onActions={() => setSkillMenu(skillViewer.skill)}
        />
      ) : null}

      {skillMenu ? (
        <ActionSheet
          preview={`${skillMenu.name} · ${skillMenu.source === 'workspace' ? `workspace ${skillMenu.workspace ?? 'default'}` : skillMenu.source}`}
          options={skillMenuOptions}
          onClose={() => setSkillMenu(null)}
        />
      ) : null}

      {skillTargets ? (
        <ActionSheet
          preview={`${skillTargets.mode === 'move' ? 'Move' : 'Copy'} ${skillTargets.skill.name} where?`}
          options={skillTargetOptions}
          onClose={() => setSkillTargets(null)}
        />
      ) : null}

      {skillReplace ? (
        <ActionSheet
          preview={`${skillReplace.label} already has a skill named ${skillReplace.skill.name}. Replacing overwrites its whole folder, references and scripts included.`}
          options={[
            {
              label: 'Replace',
              danger: true,
              onPress: () =>
                sendSkillTransfer(
                  skillReplace.skill,
                  skillReplace.mode,
                  skillReplace.target,
                  skillReplace.label,
                  true,
                ),
            },
          ]}
          onClose={() => setSkillReplace(null)}
        />
      ) : null}

      {bubbleMenu ? (
        <ActionSheet
          preview={bubbleMenu.text}
          options={[
            // Handing an answer to the parent is a message in the parent conversation, so it is a
            // plain send there: the server injects it into a running parent or starts a fresh run,
            // exactly as it would for anything typed by hand.
            ...(subagentView && bubbleMenu.role === 'agent' && bubbleMenu.text.trim()
              ? [
                  {
                    label: `Hand to ${parentTitleOf(subagentView.parentThreadId)}`,
                    hint: 'sends it to the parent conversation, quoted',
                    onPress: () => {
                      const quote = `[${subagentView.id.replace(/^subagent\//, '')}] ${bubbleMenu.text}`;
                      const parentThreadId = subagentView.parentThreadId;
                      setBubbleMenu(null);
                      leaveSubAgent();
                      sendChatTo(parentThreadId, quote).catch(() => {});
                    },
                  },
                ]
              : []),
            {
              label: 'Copy text',
              onPress: () => {
                Clipboard.setString(bubbleMenu.text);
                setBubbleMenu(null);
              },
            },
          ]}
          onClose={() => setBubbleMenu(null)}
        />
      ) : null}

      {subagentMenuOpen && subagentView ? (
        <ActionSheet
          preview={subagentView.id.replace(/^subagent\//, '')}
          options={[
            {
              label: 'Copy id',
              onPress: () => {
                Clipboard.setString(subagentView.id);
                setSubagentMenuOpen(false);
              },
            },
            {
              label: 'Clear memory',
              hint: 'archives the transcript, keeps the agent and its workspace',
              onPress: () => {
                setSubagentMenuOpen(false);
                setSubagentAction('reset');
              },
            },
            {
              label: 'Delete',
              hint: 'removes the agent and its transcript for good',
              danger: true,
              onPress: () => {
                setSubagentMenuOpen(false);
                setSubagentAction('kill');
              },
            },
          ]}
          onClose={() => setSubagentMenuOpen(false)}
        />
      ) : null}

      {threadMenu ? (
        <ActionSheet
          preview={threadMenu.title}
          options={threadActions}
          onClose={() => setThreadMenu(null)}
        />
      ) : null}

      {commandMenuOpen ? (
        <ActionSheet
          preview={activeThread ? title : undefined}
          options={commandMenuOptions}
          onClose={() => setCommandMenuOpen(false)}
        />
      ) : null}

      {workspacePicker ? (
        <ActionSheet
          preview={workspacePicker.threadId ? 'Change workspace' : 'New conversation'}
          options={workspacePickerOptions}
          onClose={() => setWorkspacePicker(null)}
        />
      ) : null}

      {modelOpen ? (
        <ModelSheet
          threadId={activeThread}
          state={modelPicker}
          onStateChange={setModelPicker}
          onClose={() => setModelOpen(false)}
        />
      ) : null}

      {newTagPrompt ? (
        <PromptSheet
          title="Name this tag"
          hint="then pick the model, effort and context cap it pins"
          initialValue=""
          placeholder="opus, sonnet, research…"
          maxLength={40}
          onSubmit={createTagNamed}
          onClose={() => setNewTagPrompt(false)}
        />
      ) : null}

      {tagToDelete ? (
        <ActionSheet
          preview={`Delete the tag "${tagToDelete}"? Configs still referencing tag:${tagToDelete} will show it as unknown.`}
          options={[
            {
              label: 'Delete',
              danger: true,
              onPress: deleteTagConfirmed,
            },
          ]}
          onClose={() => setTagToDelete(null)}
        />
      ) : null}

      {providerToDelete ? (
        <ActionSheet
          preview={`Delete the provider "${providerToDelete.key}"? Its discovered models leave with the catalog refresh, and a re-auth recreates the SDK providers.`}
          options={[
            {
              label: 'Delete',
              danger: true,
              onPress: () => deleteProviderConfirmed(false),
            },
            ...(providerToDelete.keyEnv
              ? [
                  {
                    label: 'Delete and remove its key from .env',
                    danger: true,
                    onPress: () => deleteProviderConfirmed(true),
                  },
                ]
              : []),
          ]}
          onClose={() => setProviderToDelete(null)}
        />
      ) : null}

      {approvals.length > 0 ? (
        <ActionSheet
          preview={`${approvals[0]!.toolName} wants to run`}
          options={[
            {
              label: 'Approve',
              onPress: () => {
                connection.send(encodeApprovalResponse(approvals[0]!.id, true));
                setApprovals(current => current.slice(1));
              },
            },
            {
              label: 'Reject',
              danger: true,
              onPress: () => {
                connection.send(encodeApprovalResponse(approvals[0]!.id, false));
                setApprovals(current => current.slice(1));
              },
            },
          ]}
          onClose={() => setApprovals(current => current.slice(1))}>
          <Text style={styles.approvalArgs} selectable>
            {JSON.stringify(approvals[0]!.args, null, 2)}
          </Text>
        </ActionSheet>
      ) : null}

      {threadToRename ? (
        <PromptSheet
          title="Name this conversation"
          hint="Leave empty to go back to the first message."
          initialValue={threadToRename.title}
          placeholder="Infra maison"
          maxLength={MAX_TITLE_LENGTH}
          onSubmit={value => {
            connection
              .send(encodeSessionRename(threadToRename.threadId, value))
              .catch(() => {});
          }}
          onClose={() => setThreadToRename(null)}
        />
      ) : null}

      {confirmDelete ? (
        <ActionSheet
          preview="Delete this conversation? The agent loses access to it too."
          options={[
            {
              label: 'Delete',
              danger: true,
              onPress: () => {
                deleteThread(confirmDelete);
                setConfirmDelete(null);
              },
            },
            { label: 'Cancel', onPress: () => setConfirmDelete(null) },
          ]}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}

      {fileToDelete ? (
        <ActionSheet
          preview={`Delete ${fileToDelete.filename}? The agent loses access to it too.`}
          options={[
            {
              label: 'Delete',
              danger: true,
              onPress: () => {
                setFilesError(null);
                if (activeThread)
                  connection.send(
                    encodeFileDelete(activeThread, fileToDelete.id),
                  );
                setFileToDelete(null);
              },
            },
            { label: 'Cancel', onPress: () => setFileToDelete(null) },
          ]}
          onClose={() => setFileToDelete(null)}
        />
      ) : null}

      {agentsOpen && rosterThread ? (
        <AgentsScreen
          parentTitle={parentTitleOf(rosterThread)}
          groups={rosterGroups}
          status={roster.status}
          onClose={() => setAgentsOpen(false)}
          onOpenAgent={entry => openSubAgent(entry, rosterThread)}
        />
      ) : null}

      {agentsGlobalOpen ? (
        <AgentsScreen
          parentTitle="conversations"
          subtitle="shared across conversations"
          groups={globalGroups}
          status={roster.status}
          onClose={() => setAgentsGlobalOpen(false)}
          onOpenAgent={openGlobalAgent}
        />
      ) : null}

      {subagentAction && subagentView ? (
        <ActionSheet
          preview={
            subagentAction === 'kill'
              ? `Delete ${subagentView.id.replace(/^subagent\//, '')}? Its transcript is gone for good.`
              : `Clear this agent's memory? Its transcript is archived, its workspace and identity are kept.`
          }
          options={[
            {
              label: subagentAction === 'kill' ? 'Delete' : 'Clear memory',
              danger: subagentAction === 'kill',
              onPress: () => {
                const view = subagentView;
                const frame =
                  subagentAction === 'kill'
                    ? encodeSubAgentKill(view.threadId, view.parentThreadId)
                    : encodeSubAgentReset(view.threadId, view.parentThreadId);
                connection.send(frame).catch(() => {});
                setSubagentAction(null);
                // A deleted sub-agent has no thread left to stand on; a cleared one stays open.
                if (view.threadId && subagentAction === 'kill') leaveSubAgent();
                else connection.send(encodeSessionHistory(view.threadId, HISTORY_LIMIT)).catch(() => {});
              },
            },
          ]}
          onClose={() => setSubagentAction(null)}
        />
      ) : null}

      {statusOpen ? (
        <StatusScreen
          onClose={() => {
            statusStore.close();
            setStatusOpen(false);
          }}
        />
      ) : null}

      {jobsOpen ? (
        <>
          <JobsScreen
            error={jobsError}
            onClose={() => {
              setJobsEditor(null);
              setJobSessions(null);
              jobSessionsRef.current = null;
              setJobsOpen(false);
            }}
            onAdd={() => setJobsEditor('new')}
            onEdit={editJob}
            onSessions={openJobSessions}
          />
          {jobSessions ? (
            <JobSessionsScreen
              jobName={jobSessions.jobName}
              runs={jobRuns}
              error={runsError}
              onClose={() => {
                setJobSessions(null);
                jobSessionsRef.current = null;
                setJobRuns(null);
              }}
              onEditJob={() => {
                // The shortcut: from the runs page straight into the job's editor. The runs
                // page stays mounted underneath, so the back key returns to it.
                const job = jobsStore.getSnapshot().jobs.find(entry => entry.id === jobSessions.jobId);
                if (job) {
                  setJobsError(null);
                  setJobsEditor(job);
                }
              }}
              onOpenRun={openJobRun}
            />
          ) : null}
          {jobsEditor ? (
            <JobsEditorScreen
              job={jobsEditor === 'new' ? null : jobsEditor}
              error={jobsError}
              saving={jobsSaving}
              skills={skills}
              tools={tools}
              mcpServers={mcpServers}
              workspaces={workspaces}
              onBack={() => setJobsEditor(null)}
              onSave={saveJob}
              onDelete={setJobToDelete}
            />
          ) : null}
        </>
      ) : null}

      {jobToDelete ? (
        <ActionSheet
          preview={`Delete "${jobToDelete.name}"? The task stops running, its output stays on the server.`}
          options={[
            {
              label: 'Delete',
              danger: true,
              onPress: () => deleteJob(jobToDelete),
            },
            { label: 'Cancel', onPress: () => setJobToDelete(null) },
          ]}
          onClose={() => setJobToDelete(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) => ({
  safe: { flex: 1, backgroundColor: palette.bg },
  container: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  approvalArgs: {
    fontSize: font.small,
    fontFamily: 'monospace' as const,
    color: palette.textMuted,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: space.sm,
    maxHeight: 180,
  },
});
