import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StatusBar,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { connection } from '../core/connection';
import {
  chatStore,
  useChatItemCount,
  useSpawnCards,
  useActiveRun,
  useHistoryPage,
  useUnreadThreads,
  type TextItem,
} from '../core/chat';
import { resumeFrames } from '../core/resume';
import { groupRoster, groupSharedRoster, spawnDoorsOf, spawnLiveOf, subAgentCallersStore, useSubAgentCallers, useSubAgents } from '../core/subagents';
import { sessionStore, useArchivedSessions, useSessions } from '../core/sessions';
import { isPinned, migrateLocalPins, setPinned } from '../core/pinned';
import { parseTagCommand } from '../core/commands';
import { prefs } from '../core/prefs';
import { flushDiagnostics, loadDiagnostics, recordDiag } from '../core/diagnostics';
import {
  encodeApprovalResponse,
  encodeApprovalHistory,
  encodeAgentsConfigGet,
  encodeInstructionsGet,
  encodeInstructionsGetNested,
  encodeInstructionsLayerSet,
  encodeInstructionsList,
  encodeInstructionsSet,
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
  encodeSessionInstructionsGet,
  encodeSessionInstructionsSet,
  encodeInstructionsSetNested,
  encodeStatusGet,
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
  encodeSessionSync,
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
  encodeUiPrefsGet,
  encodeUiPrefsSet,
  encodeUpdateRun,
  encodeVoiceModeSet,
  MAX_TITLE_LENGTH,
  type AgentFileFieldsOut,
  type ApprovalRequestFrame,
  type ApprovalHistoryResultFrame,
  type FileScopeMode,
  type JobEntry,
  type SubAgentEntry,
  type JobRunEntry,
  type JobFieldsOut,
  type LogsTailQuery,
  type McpEntry,
  type ModelOption,
  type UnavailableModel,
  type SessionFileMeta,
  type SessionSummary,
  type SkillEntry,
  type SkillTarget,
  type ToolEntry,
  type VoiceMode,

  type VoiceModeResultFrame,
  type UiPrefsResultFrame,
  type LocationInput,
  type WorkspaceEntry,
  encodeNotificationsRegister,
  encodeNotificationsState,
  encodeTagsDelete,
  encodeTagsList,
  encodeSubAgentsList,
  encodeSubAgentCallers,
  encodeSubAgentHandoff,
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
  dismissThreadNotification,
  parseNotificationLink,
  pushSupported,
  resetPushRegistration,
  subscribeToPushRegistration,
} from '../core/notifications';
import { contextPercent } from '../core/context';
import { declareModel, modelStore, undeclareModel, useModelCatalog, useThreadModel } from '../core/model';
import { jobsStore } from '../core/jobs';
import { agentsStore, useAgentsConfig } from '../core/agents';
import { tagsStore, useTags } from '../core/tags';
import { agentsFileStore, useAgentsFile } from '../core/agentsFile';
import { instructionsStore, useInstructions } from '../core/instructions';
import { sessionInstructionsStore, useSessionInstructions } from '../core/sessionInstructions';
import { WorkspaceScreen } from './WorkspaceScreen';
import { layerOfFile } from '../core/layers';
import { InstructionLayerScreen } from './InstructionLayerScreen';
import { InstructionEditorScreen } from './InstructionEditorScreen';
import { SessionInstructionsScreen } from './SessionInstructionsScreen';
import { skillUrl } from '../core/skills';
import { getDeviceInfo, type DeviceInfo } from '../core/device';
import { deviceBridge } from '../core/nativeBridge';
import type { OutgoingAttachment } from '../core/upload';
import type { WsStatusPayload } from '../core/types';
import { reduceUpdate, type UpdatePhase } from '../core/serverUpdate';
import { reduceAppUpdate, type AppUpdatePhase } from '../core/appUpdate';
import { appUpdateRuntime } from '../core/appUpdateRuntime';
import { httpOrigin, uuid } from '../core/utils';
import { ChatScreen } from './ChatScreen';
import { SettingsScreen } from './SettingsScreen';
import { GeneralSettingsScreen } from './GeneralSettingsScreen';
import { PairingScreen, usePairing } from './PairingScreen';
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
import { ModelEditScreen } from './ModelEditScreen';
import { ProviderEditScreen } from './ProviderEditScreen';
import { ProviderEnvScreen } from './ProviderEnvScreen';
import { providersEnvStore, useProvidersEnv } from '../core/providers';
import { EmptyCategoryScreen } from './EmptyCategoryScreen';
import { SkillsScreen } from './SkillsScreen';
import { DevicesScreen } from './DevicesScreen';
import { ToolsScreen } from './ToolsScreen';
import { SkillViewer } from './SkillViewer';
import { WorkspacesScreen } from './WorkspacesScreen';
import { FilesScreen } from './FilesScreen';
import { ImageViewer } from './ImageViewer';
import { SelectionViewer } from './SelectionViewer';
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
import { ApprovalSheet } from '../components/ApprovalSheet';
import { ApprovalHistoryScreen } from './ApprovalHistoryScreen';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import { ScreenLayer } from '../components/ScreenLayer';
import { AppUpdateModal } from './AppUpdateModal';
import { ModelSheet, pickerBack, pickerStart, type PickerState } from '../components/ModelSheet';
import { ModelTuneSheet } from '../components/ModelTuneSheet';
import { space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useThemeControl } from '../theme/ThemeProvider';
import { statusStore } from '../core/status';
import { messageSelectionBody, TextSelectionContext, type SelectionTarget } from '../core/textSelection';
import { useLayout } from '../core/layout';
import { useHardwareBack } from '../core/hardwareBack';
import { useHotkeys } from '../core/hotkeys';
import { initialRoute, showThread, watchBack } from '../core/route';
import { isSubAgentThread, routeServerFrame, type ServerFrameHandlers } from '../core/frameRouter';
import {
  readsAgentsConfig,
  PAGE_REQUESTS,
  READS_INSTRUCTIONS_PAGES,
} from './settingsPages';
import { AgentModelPickerPage } from './AgentModelPickerPage';
import { TagEditorPage } from './TagEditorPage';
import { setPageTitle } from '../core/pageTitle';

/** One page of replayed history, not a ceiling: scrolling past the oldest asks for the next. */
const HISTORY_LIMIT = 50;

/**
 * A frozen empty for the model list this shell hands to the provider page. A fresh `[]` reads the
 * same but is a new identity every render, which silently defeats the memo of whatever gets it.
 */
const EMPTY_MODELS: ModelOption[] = [];
Object.freeze(EMPTY_MODELS);
const EMPTY_UNAVAILABLE: UnavailableModel[] = [];
Object.freeze(EMPTY_UNAVAILABLE);

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

export function AppShell(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette, dark } = useTheme();
  const themeControl = useThemeControl();

  const [url, setUrl] = useState(prefs.get().serverUrl);
  const [status, setStatus] = useState<WsStatusPayload>({ state: 'idle' });
  // Every widening of the layout is decided from here: pinned list, dialogs, side panes.
  const layout = useLayout();
  /** The version the connected server announced (`hello` frame); null until it speaks. */
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  /** Native pairing state; the PairingScreen drives it and this screen chooses whether to show it. */
  const pairing = usePairing();
  const [pairingOpen, setPairingOpen] = useState(false);
  const unauthorizedHandled = useRef(false);
  useEffect(() => {
    // The server-minted credentials are stored and the chat socket is reconnecting: leave the
    // pairing screen and show the chat.
    if (pairing.phase === 'granted') {
      setPairingOpen(false);
      unauthorizedHandled.current = false;
    }
  }, [pairing.phase]);
  useEffect(() => {
    // First launch, or a server that never saw this device: the socket answered 401. Offer the
    // pairing screen once; if the owner closes it, the switch back happens through the button.
    if (status.state === 'disconnected' && status.reason === 'unauthorized' && !unauthorizedHandled.current) {
      unauthorizedHandled.current = true;
      setPairingOpen(true);
    }
  }, [status]);
  /** The running build's version name, read from the package once at boot. */
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Bumped by Ctrl+K; the drawer's search field reads it and takes the caret. */
  const [searchFocus, setSearchFocus] = useState(0);
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
    | 'model-edit'
    | 'tags'
    | 'skills'
    | 'devices'
    | 'approvals'
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
  /** The declaration being written: which provider it belongs to, and the row it started from. */
  const [modelEdit, setModelEdit] = useState<{
    mode: 'create' | 'edit';
    provider: string;
    model: ModelOption | UnavailableModel | null;
  } | null>(null);
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
  const [tagEditor, setTagEditor] = useState<{ name: string; picker: PickerState | null; pickerIndex: number | null } | null>(null);
  const [tagEditorDirty, setTagEditorDirty] = useState(false);
  const [tagEditorDiscard, setTagEditorDiscard] = useState(false);
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
  /** Server-owned display prefs: every device starts from the same layout choices. */
  const [uiPrefs, setUiPrefs] = useState<UiPrefsResultFrame | null>(null);
  /** Everything the update button knows. A phase, not booleans: see core/serverUpdate.ts. */
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>({ kind: 'idle' });
  /** The app update card: check, download, install. See core/appUpdate.ts. */
  const [appUpdatePhase, setAppUpdatePhase] = useState<AppUpdatePhase>({ kind: 'idle' });
  /** Mirror of appUpdatePhase for async callbacks: a stale closure must not re-download. */
  const appUpdatePhaseRef = useRef<AppUpdatePhase>({ kind: 'idle' });
  useEffect(() => {
    appUpdatePhaseRef.current = appUpdatePhase;
  }, [appUpdatePhase]);
  /**
   * The version the owner said "later" to. The dialog is modal, so it has to be dismissible;
   * dismissing one version must not hide the next one, and Settings always shows the card.
   */
  const [appUpdateDismissed, setAppUpdateDismissed] = useState<string | null>(null);
  const dismissAppUpdate = useCallback(() => {
    const phase = appUpdatePhaseRef.current;
    const version =
      phase.kind === 'available' || phase.kind === 'downloading' || phase.kind === 'ready'
        ? phase.version
        : phase.kind === 'error'
          ? phase.staged ?? 'error'
          : null;
    setAppUpdateDismissed(version);
  }, []);
  /** Shown for a decision only: an update to fetch, one ready to install, or a failure that explains itself. */
  const appUpdateDialogOpen =
    (appUpdatePhase.kind === 'available' && appUpdatePhase.version !== appUpdateDismissed) ||
    (appUpdatePhase.kind === 'ready' && appUpdatePhase.version !== appUpdateDismissed) ||
    (appUpdatePhase.kind === 'downloading' && appUpdatePhase.version !== appUpdateDismissed) ||
    (appUpdatePhase.kind === 'error' && (appUpdatePhase.staged ?? 'error') !== appUpdateDismissed);
  /** Only moves while a server update runs, so nothing else in the tree redraws on a clock. */
  const [updateNow, setUpdateNow] = useState(0);
  /** Only the two settings screens read it: a re-render there is enough. */
  const [updateOnMobileData, setUpdateOnMobileData] = useState(prefs.get().updateOnMobileData);
  // The toggle on the Other page and the auto-download policy read the same value; subscribe so
  // a change propagated by another window (or a hydrate) re-renders both.
  useEffect(() => {
    const apply = () => setUpdateOnMobileData(prefs.get().updateOnMobileData);
    apply();
    return prefs.subscribe(apply);
  }, []);
  /** Thread typography scale from the settings bag; a change repaints the chat live. */
  const [chatFontScale, setChatFontScale] = useState(prefs.get().chatFontScale);
  useEffect(() => {
    const apply = () => setChatFontScale(prefs.get().chatFontScale);
    apply();
    return prefs.subscribe(apply);
  }, []);
  const changeChatFontScale = useCallback((scale: number) => {
    prefs.set('chatFontScale', scale);
    setChatFontScale(scale);
  }, []);
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
  /** The More sheet in the drawer footer: Archived, Agents, Jobs, Settings. */
  const [moreOpen, setMoreOpen] = useState(false);
  const [diagSnapshot, setDiagSnapshot] = useState('');
  const [diagLogs, setDiagLogs] = useState('');
  const [diagBusy, setDiagBusy] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [autoFocusHero, setAutoFocusHero] = useState(false);
  const [bubbleMenu, setBubbleMenu] = useState<TextItem | null>(null);
  // The block a reader asked to select from. Held by the shell rather than by whoever opened it:
  // a tool card scrolled out of the window must not take the viewer with it.
  const [selection, setSelection] = useState<SelectionTarget | null>(null);
  const openSelection = useCallback((target: SelectionTarget) => setSelection(target), []);
  const [threadMenu, setThreadMenu] = useState<SessionSummary | null>(null);
  const [threadToRename, setThreadToRename] = useState<SessionSummary | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  /** Whether the effort/window sheet of the conversation is open (the tune sheet). */
  const [tuneOpen, setTuneOpen] = useState(false);
  /** Which group of the model picker is open: its own stack, walked by the back key. */
  const [modelPicker, setModelPicker] = useState<PickerState>(pickerStart);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  /** The fullscreen status page of a conversation, an absolute layer over everything else. */
  const [statusOpen, setStatusOpen] = useState(false);
  /** The instructions page of a conversation, and whether one of its files is being edited. */
  const [instructionsPageOpen, setInstructionsPageOpen] = useState(false);
  const [instructionsPageEditing, setInstructionsPageEditing] = useState(false);
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
  /**
   * The hand-back in progress: which answer, and which callers it goes to.
   *
   * A set rather than one target, because one answer can be owed to several conversations -- a
   * global sub-agent works for whoever drives it, and the conversation the owner happened to walk
   * in from is not necessarily the one waiting for this.
   */
  const [handoff, setHandoff] = useState<{ item: TextItem; targets: Set<string> | null } | null>(null);
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
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryResultFrame | null>(null);

  const itemCount = useChatItemCount(activeThread);
  const historyPage = useHistoryPage(activeThread);
  const sessions = useSessions();
  const archivedSessions = useArchivedSessions();
  const unread = useUnreadThreads();
  const mediaBase = useMemo(() => httpOrigin(url), [url]);
  const catalog = useModelCatalog();
  const threadModel = useThreadModel(activeThread);
  const agentsState = useAgentsConfig();
  const tagsState = useTags();
  const providersEnvState = useProvidersEnv();
  const agentsFile = useAgentsFile();
  const instructions = useInstructions();
  const sessionInstructions = useSessionInstructions();
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
  /** The address bar has not been written to yet: the first write replaces, it does not push. */
  const firstRouteRef = useRef(true);
  // Where the thread on screen came from: the hardware back press sends a conversation
  // opened from the archived list back to that list, instead of exiting the app.
  const fromArchivesRef = useRef(false);
  const selectThread = useCallback((threadId: string | null) => {
    activeThreadRef.current = threadId;
    setActiveThread(threadId);
    // A sub-agent is a view of its parent, so it never becomes the stored last thread. The
    // value is kept as a trace of where the owner was, but boot no longer restores it: the
    // app opens on the home screen and the owner picks a conversation, unless a deep link
    // (web) or a notification tap addressed one. Same rule for the address bar: a reload
    // lands on the addressed route rather than on a chat with no way back.
    if (threadId === null || !isSubAgentThread(threadId)) {
      prefs.set('lastThreadId', threadId);
      // The first sync is a replace: restoring the addressed thread at boot must not leave a
      // Back step whose only effect is to unload it.
      showThread(threadId, firstRouteRef.current);
      firstRouteRef.current = false;
    }
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
      // The run that raised a notification is the one now on screen: clear it, whichever way the
      // owner arrived. A tap cancels its own notification, the drawer and the deep link did not.
      dismissThreadNotification(threadId);
      connection.send(encodeSubAgentsList(threadId)).catch(() => {});
      // Sync the thread: asks for delta since last known entry, or full page if fresh.
      const { since, leaf } = chatStore.getSyncState(threadId);
      connection.send(encodeSessionSync(threadId, since, leaf ?? undefined));
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

  const handleHome = useCallback(() => {
    selectThread(null);
    setDrawerOpen(false);
    setAutoFocusHero(false);
  }, [selectThread]);

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

  /** From the drawer footer: the gear jumps to Settings, so the drawer goes away first.
   * The sheet used to do the same for its Settings row; the direct button must too, or the
   * back key would close the drawer before leaving the settings stack.
   */
  const openSettingsFromDrawer = useCallback(() => {
    setDrawerOpen(false);
    openSettings();
  }, [openSettings]);

  /** The status page is asked on every opening: the report is a snapshot, not a live gauge. */
  const openStatus = useCallback((threadId: string) => {
    statusStore.open(threadId);
    setStatusOpen(true);
    connection.send(encodeStatusGet(threadId)).catch(() => {});
  }, []);

  /**
   * What this conversation is loaded with. Asked on every opening like the status page: the
   * report is composed on demand server side, so a cached one would age into a lie the moment a
   * file is edited from anywhere.
   */
  const openSessionInstructions = useCallback((threadId: string) => {
    sessionInstructionsStore.open(threadId);
    setInstructionsPageEditing(false);
    setInstructionsPageOpen(true);
    connection.send(encodeSessionInstructionsGet(threadId)).catch(() => {});
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
    // Resolved false, never rejected: a `.catch` here never ran, and the pagination stayed
    // locked on a spinner that nothing could clear.
    connection
      .send(encodeSessionHistory(threadId, HISTORY_LIMIT, page.nextBefore))
      .then((delivered) => {
        if (!delivered) chatStore.setPageLoading(threadId, false);
      });
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
      const { since: entrySince, leaf: entryLeaf } = chatStore.getSyncState(entry.threadId);
      connection.send(encodeSessionSync(entry.threadId, entrySince, entryLeaf ?? undefined));
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
    const offState = connection.onState(next => {
      setStatus(next);
      if (next.state !== 'connected') {
        // A server's version belongs to its socket: gone with it, or a reconnect to a newer
        // server would show yesterday's label.
        setServerVersion(null);
        setLocationEnabled(false);
      }
      if (next.state === 'connected') {
        for (const frame of resumeFrames(activeThreadRef.current)) {
          connection.send(frame).catch(() => {});
        }
        // Server-owned display prefs and voice mode shape the conversation as soon as it loads,
        // not when the owner first opens Settings: a fresh tab must render with the same layout
        // choices a phone already applied. The Settings screens re-ask when they open, so the
        // fetch here is only the boot value.
        connection.send(encodeUiPrefsGet()).catch(() => {});
        connection.send(encodeVoiceModeGet()).catch(() => {});
      }
    });
    const offPending = connection.onPending(setPending);

    const frameHandlers: ServerFrameHandlers = {
      activeThreadId: () => activeThreadRef.current,
      subagentParent: () => subagentRef.current?.parentThreadId ?? null,
      jobSessionsPage: () => jobSessionsRef.current,
      jobsSaving: () => jobsSavingRef.current,
      markJobsSaving: value => {
        jobsSavingRef.current = value;
      },
      pendingWorkspace: pendingWorkspaceRef.current,
      setRunTitles: titles => {
        runTitlesRef.current = titles;
      },
      setVapidKey: key => {
        vapidRef.current = key;
      },
      setLastRun,
      setLocationEnabled,
      // The version the server announces is the other half of the verdict: same one back means
      // nothing was installed, a different one means the swap happened.
      setServerVersion: version => {
        setServerVersion(version);
        setUpdatePhase(phase => reduceUpdate(phase, { type: 'hello', version }));
      },
      setDiagSnapshot,
      setDiagLogs,
      setDiagBusy,
      setSessionFiles,
      setFilesTotal,
      setFilesError,
      setVoice,
      setUiPrefs,
      setUpdate: frame => setUpdatePhase(phase => reduceUpdate(phase, { type: 'result', frame, now: Date.now() })),
      setSkills,
      setSkillsError,
      setTools,
      setToolsMissing,
      setToolsError,
      setToolsSaving,
      setMcpServers,
      setMcpError,
      setMcpBusy,
      setWorkspaces,
      setWorkspacesError,
      setWorkspacesBusy,
      setProviderBusy,
      setStatusOpen,
      setModelOpen,
      setJobsEditor,
      setJobsSaving,
      setJobsError,
      setJobRuns,
      setRunsError,
      setApprovals,
      setApprovalHistory,
      onConfigResult: frame => {
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
      },
      onConfigSaved: frame => {
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
      },
      onConfigError: message => {
        setConfigEditor(current =>
          current ? { ...current, status: 'ready', error: message } : current,
        );
      },
    };

    const offFrame = connection.onFrame(frame => routeServerFrame(frame, frameHandlers));

    // Settings first: the stored server address and last thread decide what we connect to and
    // what the user sees on the first frame.
    prefs.hydrate().then(stored => {
      setUrl(stored.serverUrl);
      // A link wins over everything: the address is what the owner asked for. With none, the
      // app boots on the home screen (the session list) and the owner picks a conversation,
      // instead of silently reopening the last one. Always null on Android.
      const target = initialRoute().threadId;
      if (target) openThread(target);
      return connection.getState().then(state => {
        setStatus({ state });
        if (state !== 'connected' && state !== 'connecting')
          connection.connect(stored.serverUrl);
        connection.send(encodeSessionList());
      });
    });
    // The pins this device kept to itself before the server owned them, handed over once.
    migrateLocalPins().catch(() => {});

    // Reports of what killed the previous process, read before the first frame goes out. They
    // are queued natively if the socket is not up yet, so this does not need to wait for it.
    loadDiagnostics()
      .then(flushDiagnostics)
      .catch(() => {});

    // Reported, never swallowed: an identity that never arrives takes the media URLs, the
    // uploads and the skill documents with it, and a silent catch here cost a whole release
    // where the browser showed every attachment as a bare filename and said nothing.
    getDeviceInfo()
      .then(setDeviceInfo)
      .catch((err: unknown) => {
        recordDiag({
          kind: 'js',
          at: Date.now(),
          message: `identity unavailable: ${err instanceof Error ? err.message : String(err)}`,
          reason: 'device-info',
        });
      });
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

  /**
   * Closes the topmost layer, and says whether there was one.
   *
   * Written once, read by three inputs that all mean the same thing: Android's back key, the
   * browser's Back button and the Escape key. `false` is "nothing left to close", which is what
   * lets the platform do its own thing (leave the app, leave the page).
   */
  const handleBack = useCallback((): boolean => {
    // The selection viewer covers everything, including whatever opened it.
    if (selection) {
      setSelection(null);
      return true;
    }
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
    if (instructionsPageOpen) {
      // The editor stacks over the report: back leaves the editor first, the page second.
      if (instructionsPageEditing) {
        instructionsStore.closeEditor();
        setInstructionsPageEditing(false);
        return true;
      }
      sessionInstructionsStore.close();
      setInstructionsPageOpen(false);
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
    if (tuneOpen) {
      setTuneOpen(false);
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
    if (moreOpen) {
      setMoreOpen(false);
      return true;
    }
    if (bubbleMenu || threadMenu) {
      setBubbleMenu(null);
      setThreadMenu(null);
      return true;
    }
    // A pinned list is not a layer: closing it would eat the press and change nothing on screen.
    if (drawerOpen && !layout.pinnedDrawer) {
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
        if (tagEditor?.picker) {
          const previous = pickerBack(tagEditor.picker);
          if (previous) {
            setTagEditor({ ...tagEditor, picker: previous });
          } else {
            setTagEditor({ ...tagEditor, picker: null, pickerIndex: null });
          }
          return true;
        }
        if (tagEditorDirty) {
          setTagEditorDiscard(true);
        } else {
          setTagEditor(null);
          setSettingsPage('tags');
        }
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
      if (settingsPage === 'model-edit') {
        setSettingsPage('provider');
        setModelEdit(null);
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
    // chat ouvert sur téléphone → back va au home (pas à la sortie)
    if (Platform.OS !== 'web' && !layout.pinnedDrawer && activeThreadRef.current && !settingsOpen
        && !archivesOpen && !filesOpen && !subagentRef.current) {
      selectThread(null);
      return true;
    }
    return false;
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
    moreOpen,
    instructionsPageEditing,
    instructionsPageOpen,
    workspaceFrom,
    jobSessions,
    jobsEditor,
    jobsOpen,
    modelOpen,
    modelPicker,
    tuneOpen,
    newTagPrompt,
    providerEdit,
    providerToDelete,
    scopeEditor,
    selection,
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
    tagEditorDirty,
    tagToDelete,
    textViewer,
    threadMenu,
    threadToRename,
    videoViewer,
    fileViewer,
    layout.pinnedDrawer,
  ]);

  useHardwareBack(handleBack);

  /**
   * The browser's Back button, which until now walked straight out of the app: a layer is closed
   * first, exactly like the hardware key, and only an empty stack lets the address bar win.
   * No-op on Android.
   */
  useEffect(
    () =>
      watchBack({
        closeTopLayer: handleBack,
        showRoute: route => {
          if (route.threadId) openThread(route.threadId);
          else selectThread(null);
        },
      }),
    [handleBack, openThread, selectThread],
  );

  useHotkeys({
    escape: () => {
      handleBack();
    },
    // The conversation list is the palette: it searches, and on a desktop it is already there.
    'mod+k': () => {
      if (!layout.pinnedDrawer) setDrawerOpen(true);
      setSearchFocus(count => count + 1);
    },
    'mod+n': () => newThread(),
    'mod+,': () => openSettings(),
    'mod+/': () => setCommandMenuOpen(true),
  });

  // The roster of the conversation in play: while inside a sub-agent that is still the parent's,
  // because that is the scope the server answered for.
  const rosterThread = subagentView?.parentThreadId ?? activeThread;
  // Who called the sub-agent on screen, for the hand-back sheet. Pulled when that menu opens, so
  // it is idle for every conversation that never opens it.
  const handoffCallers = useSubAgentCallers(subagentView?.threadId ?? null);
  const roster = useSubAgents(rosterThread);
  const spawnCards = useSpawnCards(activeThread);
  const rosterGroups = useMemo(() => groupRoster(roster.agents), [roster.agents]);
  // The drawer page shows what this conversation shares with others: public agents, then the
  // agents of each workspace it can reach. Private ones stay out -- they belong to the
  // conversation roster, which is the other entry point.
  const globalAgents = useMemo(
    () => roster.agents.filter(agent => agent.visibility === 'global' || agent.visibility === 'workspace'),
    [roster.agents],
  );
  const globalGroups = useMemo(() => groupSharedRoster(globalAgents), [globalAgents]);
  const subagentCount = useMemo(
    () => ({
      total: rosterGroups.reduce((sum, group) => sum + group.rows.length, 0),
      running: roster.agents.filter(agent => agent.status === 'running').length,
    }),
    [rosterGroups, roster.agents],
  );

  // Both derivations live in core/subagents.ts, both pure. Only the door needs the roster: the
  // lifecycle state is already on the card, put there by the server's replay or by
  // `reconcileSpawnRoster`, so re-deriving it here was a second copy of the same match.
  const subagentDoors = useMemo(() => spawnDoorsOf(spawnCards, roster.agents), [spawnCards, roster.agents]);
  const spawnLive = useMemo(() => spawnLiveOf(spawnCards), [spawnCards]);

  const openSubAgentFromCard = useCallback(
    (toolItemId: string) => {
      const card = spawnCards.find(entry => entry.id === toolItemId);
      const claimed = card && typeof card.args.name === 'string' ? card.args.name : '';
      const agent =
        (card?.subagentId ? roster.agents.find(entry => entry.id === card.subagentId) : undefined) ??
        roster.agents.find(entry => entry.displayName === claimed);
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
      // No default model configured: a send would resolve to an empty provider and fail with
      // "Provider \"\" not found in config". Open the provider setup instead of posting into
      // a conversation nobody can answer.
      if (catalog.defaultModel === '') {
        setSettingsPage('providers');
        setSettingsOpen(true);
        return;
      }
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
    [catalog.defaultModel],
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
      // Coming back to a conversation that notified while the app was away: the tray must not keep
      // announcing a run the owner is looking at. Backgrounded, the notification is legitimate and
      // stays.
      if (foreground && activeThreadRef.current) dismissThreadNotification(activeThreadRef.current);
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
    connection.send(encodeUiPrefsGet()).catch(() => {});
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    for (const rule of PAGE_REQUESTS) {
      if (!rule.match(settingsPage)) continue;
      for (const request of rule.requests) connection.send(request()).catch(() => {});
    }
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

  const runServerUpdate = useCallback(() => {
    // The socket is expected to die a few seconds after a successful start, so nothing here waits
    // for anything: the answer arrives first, and the reconnect carries the verdict.
    setUpdatePhase(phase => reduceUpdate(phase, { type: 'asked' }));
    setUpdateNow(Date.now());
    connection.send(encodeUpdateRun()).catch(() => {
      setUpdatePhase(phase => reduceUpdate(phase, { type: 'sendFailed' }));
    });
  }, []);

  /** Downloads the APK for `version`, then offers the install. Shared by the tap and the auto path. */
  const downloadAppUpdate = useCallback(
    async (version: string, apkSize: number) => {
      setAppUpdatePhase({ kind: 'downloading', version, apkSize, progress: 0 });
      try {
        await appUpdateRuntime.download(mediaBase, deviceInfo, `app-update-${version}`, version);
        setAppUpdatePhase({ kind: 'ready', version });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'download failed';
        // A download that failed left nothing usable behind: drop it, so the next tap downloads
        // instead of offering an install for a file that is not there.
        await appUpdateRuntime.clearStaged().catch(() => {});
        setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'failed', message, staged: false }));
      }
    },
    [mediaBase, deviceInfo],
  );

  const runAppUpdate = useCallback(() => {
    // A stale closure must never re-download what the auto-download already staged: read the
    // ref, and ignore taps that land while a transfer or an install is already in flight.
    const state = appUpdatePhaseRef.current;
    if (state.kind === 'downloading' || state.kind === 'installing') return;
    const wanted = state.kind === 'ready' ? state.version : state.kind === 'error' ? state.staged : undefined;
    if (wanted) {
      setAppUpdatePhase({ kind: 'installing', version: wanted });
      (async () => {
        // The file is the authority, not the phase: a staged APK the system reclaimed used to
        // leave Install on screen forever, and every tap flashed back to the same button.
        const disk = await appUpdateRuntime.staged().catch(() => ({ staged: false, size: 0, version: '' }));
        if (!disk.staged) {
          setAppUpdatePhase(prev =>
            reduceAppUpdate(prev, { type: 'failed', message: 'the downloaded file is gone, download it again', staged: false }),
          );
          return;
        }
        // Android 8+ needs the "install unknown apps" opt-in before PackageInstaller will commit.
        // Check first so the tap opens the permission screen instead of failing the session; the
        // staged APK stays on disk, so coming back installs it directly.
        const allowed = await appUpdateRuntime.canInstall().catch(() => false);
        if (!allowed) {
          setAppUpdatePhase(prev =>
            reduceAppUpdate(prev, { type: 'failed', message: 'allow this app to install updates, then tap Install', staged: true }),
          );
          appUpdateRuntime.openInstallSettings();
          return;
        }
        try {
          await appUpdateRuntime.install();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'install failed';
          setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'failed', message, staged: true }));
        }
      })().catch(() => {});
      return;
    }
    if (state.kind === 'available') {
      downloadAppUpdate(state.version, state.apkSize).catch(() => {});
      return;
    }
    if (state.kind === 'error') {
      // Nothing staged: find out what the server has, then fetch it.
      setAppUpdatePhase({ kind: 'checking' });
      (async () => {
        const result = await appUpdateRuntime.check(mediaBase, deviceInfo);
        const next = reduceAppUpdate({ kind: 'idle' }, { type: 'checked', result, current: appVersion ?? '' });
        if (next.kind === 'available') await downloadAppUpdate(next.version, next.apkSize);
        else setAppUpdatePhase(next);
      })().catch(() => {});
      return;
    }
    // Idle or up-to-date: re-check right now.
    setAppUpdatePhase({ kind: 'checking' });
    appUpdateRuntime
      .check(mediaBase, deviceInfo)
      .then(result => {
        const current = appVersion ?? '';
        setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'checked', result, current }));
      })
      .catch(() => {});
  }, [mediaBase, deviceInfo, appVersion, downloadAppUpdate]);

  const openAppUpdateInstallSettings = useCallback(() => {
    appUpdateRuntime.openInstallSettings();
  }, []);

  // One clock, owned here, alive only while an update runs. It drives both the label's counter
  // and the two deadlines the phase depends on (nothing restarted, or nothing came back).
  useEffect(() => {
    if (updatePhase.kind !== 'running') return;
    const tick = setInterval(() => {
      const now = Date.now();
      setUpdateNow(now);
      setUpdatePhase(phase => reduceUpdate(phase, { type: 'tick', now }));
    }, 1000);
    return () => clearInterval(tick);
  }, [updatePhase.kind]);

  // The socket dropping is half the verdict: the updater only stops the service when it has
  // something to install.
  useEffect(() => {
    setUpdatePhase(phase => reduceUpdate(phase, { type: 'socket', connected: status.state === 'connected' }));
  }, [status.state]);

  // App self-update: check at launch, then every four hours, auto-download on wifi (or on mobile
  // data when the owner allows it), and follow the install status the system reports.
  useEffect(() => {
    if (status.state !== 'connected') return;
    // The running build's version is what a check compares against. Until it is known (the
    // bridge answers within the first frames) comparing against an empty string would read
    // every release as newer and auto-download the APK at every boot.
    if (appVersion === null || appVersion === '') return;
    let cancelled = false;
    let transferId: string | null = null;

    const maybeAutoDownload = async (version: string, apkSize: number) => {
      if (transferId) return;
      // Already staged or installing: nothing to download. The check may fire again while the
      // APK sits on disk, and re-downloading it is what turned Install back into Get it.
      const atStart = appUpdatePhaseRef.current;
      if (atStart.kind === 'ready' || atStart.kind === 'installing' || atStart.kind === 'downloading') return;
      const allowed = await appUpdateRuntime.canAutoDownload(updateOnMobileData);
      if (!allowed) return;
      const stillIdle = appUpdatePhaseRef.current;
      if (stillIdle.kind === 'ready' || stillIdle.kind === 'installing' || stillIdle.kind === 'downloading') return;
      transferId = `app-update-${version}`;
      setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'downloadStarted', version, apkSize }));
      try {
        await appUpdateRuntime.download(mediaBase, deviceInfo, transferId, version);
        if (cancelled) return;
        setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'downloadDone', version }));
      } catch (err) {
        if (cancelled) return;
        await appUpdateRuntime.clearStaged().catch(() => {});
        setAppUpdatePhase(prev => reduceAppUpdate(prev, {
          type: 'failed',
          message: err instanceof Error ? err.message : 'download failed',
          staged: false,
        }));
      } finally {
        transferId = null;
      }
    };

    const check = async () => {
      const result = await appUpdateRuntime.check(mediaBase, deviceInfo);
      if (cancelled) return;
      // An APK downloaded before the app was last closed is still on disk: offer the install
      // rather than spending 45 MB again. Only the file itself can say so.
      const disk = await appUpdateRuntime.staged().catch(() => ({ staged: false, size: 0, version: '' }));
      if (cancelled) return;
      if (disk.staged && result.ok && disk.version && disk.version === result.version) {
        setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'stagedFound', version: disk.version }));
        return;
      }
      // Staged, but for a version the server has since replaced: it is dead weight.
      if (disk.staged && result.ok && disk.version !== result.version) {
        await appUpdateRuntime.clearStaged().catch(() => {});
      }
      // The reducer refuses to reset an in-flight download/install; mirror that here for the
      // auto-download branch, which runs off its own computed state.
      setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'checked', result, current: appVersion ?? '' }));
      const afterCheck = appUpdatePhaseRef.current;
      if (afterCheck.kind !== 'ready' && afterCheck.kind !== 'installing' && afterCheck.kind !== 'downloading') {
        // The reducer is the one judge of what a check means here: an error that still has the
        // APK staged becomes `ready` (install, no download); anything else becomes `available`
        // and may auto-download on wifi.
        const after = reduceAppUpdate(afterCheck, { type: 'checked', result, current: appVersion ?? '' });
        if (after.kind === 'available') {
          maybeAutoDownload(after.version, after.apkSize);
        }
      }
    };

    check();
    const timer = setInterval(() => check(), 4 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status.state, mediaBase, deviceInfo, appVersion, updateOnMobileData]);

  // The install outcome listener lives outside the connection gate: the answer can arrive right
  // after a cold start, while the socket is still reconnecting, and dropping it would strand the
  // UI on "installing…" forever. Subscribe once, and drain whatever was parked before JS ran.
  useEffect(() => {
    const offInstall = appUpdateRuntime.onInstallStatus((installStatus, message) => {
      if (installStatus === 'success') {
        // The process is about to be replaced. Drop the staged APK so a reopen does not find a
        // file for the version it is already running and offer to install it again.
        appUpdateRuntime.clearStaged().catch(() => {});
        setAppUpdatePhase({ kind: 'installing', version: '' });
        return;
      }
      if (installStatus === 'failure') {
        // Declining the system dialog lands here too, and the APK is still on disk: keep it, so
        // the next tap installs rather than spending the download again.
        appUpdateRuntime
          .staged()
          .catch(() => ({ staged: false, size: 0, version: '' }))
          .then(disk => {
            setAppUpdatePhase(phase =>
              reduceAppUpdate(phase, {
                type: 'failed',
                message: message ?? 'install cancelled',
                staged: disk.staged,
              }),
            );
          });
      }
    });
    appUpdateRuntime.drainInstallResult();
    return offInstall;
  }, []);

  const changeVoiceMode = useCallback((mode: VoiceMode) => {
    // No optimistic write: the server answers with the state it actually stored, including what
    // "auto" resolved to, and a switch that lied about that would be worse than a slow one.
    connection.send(encodeVoiceModeSet(mode)).catch(() => {});
  }, []);

  const changeUiPrefs = useCallback((next: { expandTools?: boolean; expandReasoning?: boolean }) => {
    // No optimistic write either: the server broadcasts the stored state to every window, and
    // this one rewrites itself from that (frameRouter.setUiPrefs).
    connection.send(encodeUiPrefsSet(next)).catch(() => {});
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
  // Resync a conversation with the server: a fresh history top page replaces whatever the
  // screen shows (seedHistory drops the old items), the model row re-reads the session pin,
  // and the listing re-reads the drawer row. Same frames openThread sends on opening.
  const refreshThread = useCallback((threadId: string): void => {
    connection.send(encodeSubAgentsList(threadId)).catch(() => {});
    const { since: refreshSince, leaf: refreshLeaf } = chatStore.getSyncState(threadId);
    connection.send(encodeSessionSync(threadId, refreshSince, refreshLeaf ?? undefined));
    connection.send(encodeModelGet(threadId));
    connection.send(encodeSessionList());
    chatStore.markRead(threadId);
  }, []);

  const refreshAction = useCallback(
    (target: SessionSummary, close: () => void): SheetEntry => ({
      label: 'Refresh',
      hint: 'resync this conversation with the server',
      onPress: () => {
        refreshThread(target.threadId);
        close();
      },
    }),
    [refreshThread],
  );

  // Pinning leads both menus, on its own: it is the one action that changes nothing about the
  // conversation and everything about finding it again, so it is the row a thumb reaches for
  // without reading. Handed out apart from the list below because the header menu keeps Model
  // and Stop between it and the rest.
  const pinAction = useCallback(
    (target: SessionSummary, close: () => void): SheetEntry =>
      isPinned(target)
        ? {
            label: 'Unpin',
            hint: 'back to the conversation list',
            onPress: () => {
              setPinned(target.threadId, false);
              close();
            },
          }
        : {
            label: 'Pin to top',
            hint: 'on every device, above the list',
            onPress: () => {
              setPinned(target.threadId, true);
              close();
            },
          },
    [],
  );

  const conversationActions = useCallback(
    (target: SessionSummary, close: () => void): SheetEntry[] => [
      // What the conversation reads comes before what it produced: the instructions decide every
      // answer in it, the files are one of their outputs.
      {
        label: 'Instructions',
        hint: 'every layer it loads, nested files included',
        onPress: () => {
          close();
          openSessionInstructions(target.threadId);
        },
      },
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
    [openStatus, openSessionInstructions, setThreadArchived, openFilesFor, workspaceOf],
  );

  const threadActions: SheetEntry[] = threadMenu
    ? [refreshAction(threadMenu, () => setThreadMenu(null)), pinAction(threadMenu, () => setThreadMenu(null)), ...conversationActions(threadMenu, () => setThreadMenu(null))]
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
        case 'effort':
        case 'cap':
          setCommandMenuOpen(false);
          setTuneOpen(true);
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
        case 'instructions':
          // The typed command answers with the whole prompt inline; the page is the same content
          // laid out, editable, and it never lands in the conversation.
          if (threadId) {
            setCommandMenuOpen(false);
            openSessionInstructions(threadId);
            return true;
          }
          return false;
        default:
          return false;
      }
    },
    [newThread, openModel, openStatus, openSessionInstructions, sessions, setTuneOpen],
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

  const activeSummary: SessionSummary | null = activeThread
    ? {
        threadId: activeThread,
        title: sessionStore.titleOf(activeThread) ?? '',
        messageCount: 0,
        createdAt: '',
        lastActiveAt: '',
        archived: archivedSessions.some(entry => entry.threadId === activeThread),
      }
    : null;

  const commandMenuOptions: SheetEntry[] = [
    // Same head as the drawer's sheet: one action, in the same place, whichever menu was opened.
    ...(activeSummary ? [refreshAction(activeSummary, () => setCommandMenuOpen(false)), pinAction(activeSummary, () => setCommandMenuOpen(false))] : []),
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
    {
      label: 'Effort / window…',
      hint: currentModelLabel
        ? `tune ${currentModelLabel}`
        : undefined,
      onPress: () => {
        setCommandMenuOpen(false);
        setTuneOpen(true);
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
    // Model and Stop sit here because only the conversation on screen can answer for them: the
    // app knows the live model and the running turn of the one in front of it, not of a thread
    // picked in the drawer. Everything below is the shared conversation list.
    ...(activeSummary ? conversationActions(activeSummary, () => setCommandMenuOpen(false)) : []),
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
  // A healthy link says nothing: it is the normal case, and the space is worth more to the one
  // number that moves on its own. How full the window is decides when the conversation has to be
  // compacted, so it belongs where the owner already looks. Degraded states keep the word.
  const contextShare = contextPercent(threadModel?.context);
  const subtitle = [
    offline ? status.state : contextShare === null ? null : `ctx ${contextShare}%`,
    pending > 0 ? `${pending} pending` : null,
    itemCount > 0 ? `${itemCount} items` : null,
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

  // The window title. On a phone the launcher owns the label and this does nothing; in a browser
  // it is the tab strip, and the count is the only notification a plain-HTTP page can raise.
  useEffect(() => {
    setPageTitle(title, unread.length);
  }, [title, unread.length]);
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
  // The other half of the same catalogue: known, not runnable, and shown only here. Same grouping
  // rule, and empty on a server too old to send the field.
  const providerUnavailable = useMemo(
    () =>
      selectedProvider
        ? (catalog.unavailable ?? []).filter(
            model => (model.provider ?? agentsConfig?.defaultProvider) === selectedProvider,
          )
        : EMPTY_UNAVAILABLE,
    [agentsConfig?.defaultProvider, catalog.unavailable, selectedProvider],
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
    if (tag?.model) {
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
    // The route editor is a page, not a modal: draft changes stay local until Save.
    setTagEditor({ name, picker: null, pickerIndex: null });
    setTagEditorDirty(false);
    setSettingsOpen(true);
    setSettingsPage('tag-editor');
  };
  const leaveTagEditor = (): void => {
    if (tagEditorDirty) {
      setTagEditorDiscard(true);
      return;
    }
    setTagEditor(null);
    setTagEditorDirty(false);
    setSettingsPage('tags');
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
    if (tagEditor?.name === tagToDelete) {
      setTagEditor(null);
      setTagEditorDirty(false);
      setSettingsPage('tags');
    }
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
    providerType: 'openai' | 'codex' | 'anthropic';
    baseUrl: string;
    group: string;
    discover: boolean;
    promptCache: boolean;
    reasoningReplay: boolean;
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
          reasoningReplay: patch.reasoningReplay,
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

  /**
   * The conversation, held as a value rather than written at the end of the page chain: on a
   * wide window it is drawn beside a page instead of being replaced by it, so it has to be
   * placeable in two spots.
   */
  const chatScreen = (
          <ChatScreen
            threadId={activeThread ?? ''}
            title={title}
            subtitle={subtitle}
            connectionState={status.state}
            locationEnabled={locationEnabled}
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
            spawnLive={spawnLive}
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
            uiPrefs={uiPrefs}
          />
  );

  /** Something other than the conversation is showing: settings, the archives, the files. */
  const pageOpen = settingsOpen || archivesOpen || filesOpen;

  return (
    // Every block inside the thread reaches the selection viewer through here, rather than
    // through a callback threaded down to the tool cards. See docs/text-selection.md.
    <TextSelectionContext.Provider value={openSelection}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={palette.bg}
      />
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* A row with one child on a phone, two on a desktop: the conversation list stops being
            an overlay and becomes a column, and the pages beside it lose nothing. */}
        <View style={styles.shell}>
        {layout.pinnedDrawer ? (
          <Drawer
            pinned
            open
            focusSearch={searchFocus}
            sessions={sessions}
            unread={unread}
            activeThread={activeThread}
            connectionState={status.state}
            pending={pending}
            onClose={() => {}}
            onOpenThread={openThreadFromDrawer}
            onNewThread={newThread}
            onThreadMenu={setThreadMenu}
            onOpenMore={() => setMoreOpen(true)}
            onOpenSettings={openSettingsFromDrawer}
            onHome={handleHome}
          />
        ) : null}
        {/* The home list is a full-bleed panel: the container's md padding would paint a band
            of bg around its surface, a frame the phone does not ask for. It belongs to the
            shell, not to the padded column. */}
        {!layout.pinnedDrawer && !layout.sidePane && !pageOpen && activeThread === null ? (
          <Drawer
            home
            open
            sessions={sessions}
            unread={unread}
            activeThread={activeThread}
            connectionState={status.state}
            pending={pending}
            onClose={() => {}}
            onOpenThread={openThreadFromDrawer}
            onNewThread={newThread}
            onThreadMenu={setThreadMenu}
            onOpenMore={() => setMoreOpen(true)}
            onOpenSettings={openSettingsFromDrawer}
            onHome={handleHome}
          />
        ) : (
        <View style={[styles.container, layout.sidePane && styles.containerSplit]}>
        {/* Wide enough for both: a page opens beside the conversation instead of over it, which
            is the difference between reading the two and remembering one. */}
        {layout.sidePane ? <View style={styles.chatPane}>{activeThread === null ? <View style={styles.pageFull} testID="home-placeholder" /> : chatScreen}</View> : null}
        {layout.sidePane && !pageOpen ? null : (
        <View
          style={
            layout.sidePane
              ? styles.pagePane
              : [styles.pageFull, layout.pinnedDrawer && { maxWidth: layout.pageWidth, alignSelf: 'center' as const, width: '100%' as const }]
          }>
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
                uiPrefs={uiPrefs}
                onUiPrefsChange={changeUiPrefs}
                chatFontScale={chatFontScale}
                onChatFontScaleChange={changeChatFontScale}
                updatePhase={updatePhase}
                appUpdatePhase={appUpdatePhase}
                now={updateNow}
                onUpdateServer={runServerUpdate}
                onAppUpdate={runAppUpdate}
                onAppUpdateInstallSettings={openAppUpdateInstallSettings}
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
                onOpenPairing={() => {
                  setSettingsOpen(false);
                  setPairingOpen(true);
                }}
                onBack={() => setSettingsPage('index')}
              />
            ) : settingsPage === 'other' ? (
              <OtherSettingsScreen
                themeMode={themeControl.mode}
                updateOnMobileData={updateOnMobileData}
                onUpdateOnMobileDataChange={value => {
                  prefs.set('updateOnMobileData', value);
                  setUpdateOnMobileData(value);
                }}
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
                  picker={tagEditor.picker}
                  pickerIndex={tagEditor.pickerIndex}
                  onPickerChange={picker => setTagEditor(current => (current ? { ...current, picker } : current))}
                  onStartPicker={index => setTagEditor(current => (current ? { ...current, picker: pickerStart, pickerIndex: index } : current))}
                  onClosePicker={() => setTagEditor(current => (current ? { ...current, picker: null, pickerIndex: null } : current))}
                  onBack={leaveTagEditor}
                  onDelete={() => setTagToDelete(tagEditor.name)}
                  onDirtyChange={setTagEditorDirty}
                />
              ) : (
                tagsPage
              )
            ) : settingsPage === 'instruction-layer' ? (
              // The entry has to exist: a list that came back empty (a workspace removed server
              // side while the page was open) used to hand `undefined` to a screen that reads it
              // straight away, and the render error replaced the whole app with the red screen.
              layerTarget && instructions.layer && instructions.entries.length > 0 ? (
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
                  unavailable={providerUnavailable}
                  defaultModel={agentsConfig?.defaultModel ?? ''}
                  searchHandle={providerSearch}
                  error={agentsState.error}
                  onEditProvider={() => {
                    setProviderBusy(false);
                    setProviderEdit({ mode: 'edit', key: selectedProviderInfo.key });
                    setSettingsPage('provider-edit');
                  }}
                  onEditModel={model => {
                    setModelEdit({ mode: 'edit', provider: selectedProviderInfo.key, model });
                    setSettingsPage('model-edit');
                  }}
                  onAddModel={() => {
                    setModelEdit({ mode: 'create', provider: selectedProviderInfo.key, model: null });
                    setSettingsPage('model-edit');
                  }}
                  onBack={() => setSettingsPage('providers')}
                />
              ) : (
                providersPage
              )
            ) : settingsPage === 'model-edit' ? (
              modelEdit ? (
                <ModelEditScreen
                  mode={modelEdit.mode}
                  model={modelEdit.model}
                  provider={modelEdit.provider}
                  declared={modelEdit.model?.declared === true}
                  discovered={modelEdit.model?.discovered === true}
                  error={agentsState.error}
                  busy={false}
                  onSave={entry => {
                    declareModel(entry);
                    setModelEdit(null);
                    setSettingsPage('provider');
                  }}
                  onDelete={() => {
                    if (modelEdit.model) undeclareModel(modelEdit.model.id);
                    setModelEdit(null);
                    setSettingsPage('provider');
                  }}
                  onBack={() => {
                    setModelEdit(null);
                    setSettingsPage('provider');
                  }}
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
            ) : settingsPage === 'approvals' ? (
              <ApprovalHistoryScreen
                history={approvalHistory}
                onBack={() => setSettingsPage('index')}
                onRefresh={() => connection.send(encodeApprovalHistory())}
              />
            ) : settingsPage === 'devices' ? (
              <DevicesScreen onBack={() => setSettingsPage('index')} />
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
            pairingOpen ? (
              <PairingScreen
                serverUrl={url}
                onUrlChange={changeUrl}
                pairing={pairing}
                onClose={() => {
                  setPairingOpen(false);
                  setSettingsOpen(true);
                  setSettingsPage('general');
                }}
              />
            ) : (
              layout.sidePane ? null
                : activeThread === null
                  ? (layout.pinnedDrawer
                      ? <View style={styles.pageFull} testID="home-placeholder" />
                      : null
                      )
                  : (
                      <View style={styles.chatWrap}>
                        {chatScreen}
                      </View>
                    )
            )
          )}
        </View>
        )}
        </View>
        )}
        </View>
      </KeyboardAvoidingView>

      {layout.pinnedDrawer ? null : (
      <Drawer
        open={drawerOpen}
        focusSearch={searchFocus}
        sessions={sessions}
        unread={unread}
        activeThread={activeThread}
        connectionState={status.state}
        pending={pending}
        onClose={() => setDrawerOpen(false)}
        onOpenThread={openThreadFromDrawer}
        onNewThread={newThread}
        onThreadMenu={setThreadMenu}
        onOpenMore={() => setMoreOpen(true)}
        onOpenSettings={openSettingsFromDrawer}
        onHome={handleHome}
      />
      )}

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
                    label: 'Hand back to…',
                    hint: 'returns it to the conversations that called this sub-agent',
                    onPress: () => {
                      const item = bubbleMenu;
                      setBubbleMenu(null);
                      // `null`, not an empty set: the session ids only arrive with the list, so the
                      // pre-pick is derived from it below. An empty set would mean "the owner
                      // unticked everything", which is a different thing.
                      setHandoff({ item, targets: null });
                      subAgentCallersStore.requested(subagentView.threadId);
                      connection
                        .send(encodeSubAgentCallers(subagentView.threadId, subagentView.parentThreadId))
                        .catch(() => {});
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
            // The whole message, reasoning and summary included, as the source it was written
            // in: the viewer is the only place a selection can cross from one block to the next.
            {
              label: 'Select text',
              hint: 'opens the message where any part of it can be picked',
              onPress: () => {
                const target = { title: 'Message', body: messageSelectionBody(bubbleMenu) };
                setBubbleMenu(null);
                setSelection(target);
              },
            },
            // The asides carry their own copy button, but only once unfolded. Offering them here
            // too is the difference between copying a reasoning trace and reading it first.
            ...(bubbleMenu.reasoning?.trim()
              ? [
                  {
                    label: 'Copy reasoning',
                    onPress: () => {
                      Clipboard.setString(bubbleMenu.reasoning ?? '');
                      setBubbleMenu(null);
                    },
                  },
                ]
              : []),
            ...(bubbleMenu.details?.trim()
              ? [
                  {
                    label: 'Copy summary',
                    onPress: () => {
                      Clipboard.setString(bubbleMenu.details ?? '');
                      setBubbleMenu(null);
                    },
                  },
                ]
              : []),
          ]}
          onClose={() => setBubbleMenu(null)}
        />
      ) : null}

      {handoff && subagentView ? (() => {
        // Derived, never stored: the pre-pick needs the session ids, and those only arrive with the
        // list. `targets === null` means the owner has not touched the selection yet.
        const reachable = handoffCallers.callers.filter(c => !c.unreachable && c.threadId);
        const selected = handoff.targets
          ?? new Set(reachable.filter(c => c.threadId === subagentView.parentThreadId).map(c => c.sessionId));
        const toggle = (sessionId: string): void => {
          const next = new Set(selected);
          if (next.has(sessionId)) next.delete(sessionId);
          else next.add(sessionId);
          setHandoff({ item: handoff.item, targets: next });
        };
        const deliver = (mode: 'ask' | 'note'): void => {
          const targets = [...selected];
          if (targets.length === 0) return;
          setHandoff(null);
          connection
            .send(encodeSubAgentHandoff(subagentView.threadId, subagentView.parentThreadId, targets, mode, handoff.item.id))
            .catch(() => {});
        };
        const count = selected.size;
        return (
          <ActionSheet
            preview={handoff.item.text}
            options={[
              // The state as a row, not as custom content: a sheet says one thing at a time, and a
              // refusal or an empty list has to read as an answer rather than as an empty menu.
              ...(handoffCallers.status !== 'ready' || handoffCallers.callers.length === 0
                ? [{
                    key: 'state',
                    label: handoffCallers.status === 'loading'
                      ? 'Looking up who called this sub-agent…'
                      : handoffCallers.status === 'refused'
                        ? 'This sub-agent is no longer reachable from here'
                        : 'Nothing has called this sub-agent yet',
                    onPress: () => {},
                  }]
                : []),
              ...reachable.map(caller => ({
                key: caller.sessionId,
                label: caller.title ?? caller.threadId ?? caller.sessionId,
                hint: [
                  caller.creator ? 'created it' : null,
                  `${caller.runs} ${caller.runs === 1 ? 'call' : 'calls'}`,
                ].filter(Boolean).join(' · '),
                selected: selected.has(caller.sessionId),
                onPress: () => toggle(caller.sessionId),
              })),
              // Shown, not hidden: "that conversation is gone" is the answer to why it cannot be
              // picked, and a silently shorter list is not.
              ...handoffCallers.callers.filter(c => c.unreachable || !c.threadId).map(caller => ({
                key: caller.sessionId,
                label: caller.title ?? caller.sessionId,
                hint: 'conversation is gone',
                onPress: () => {},
              })),
              { type: 'separator' as const, key: 'actions' },
              {
                key: 'ask',
                label: count > 0 ? `Send for action (${count})` : 'Send for action',
                hint: 'lands as a message, so the agent there acts on it',
                onPress: () => deliver('ask'),
              },
              {
                key: 'note',
                label: count > 0 ? `File as a note (${count})` : 'File as a note',
                hint: 'visible in the conversation, never sent to a model',
                onPress: () => deliver('note'),
              },
            ]}
            onClose={() => setHandoff(null)}
          />
        );
      })() : null}

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

      {/* The update dialog sits with the other overlays, absolutely positioned over the shell.
          It used to be a strip declared as the first child of `shell`, which is a row: it
          rendered as a vertical band down the left edge and squeezed the whole app. */}
      {appUpdateDialogOpen ? (
        <AppUpdateModal
          phase={appUpdatePhase}
          currentVersion={appVersion}
          onPrimary={runAppUpdate}
          onDismiss={dismissAppUpdate}
        />
      ) : null}

      {moreOpen ? (
        <ActionSheet
          preview="More"
          options={[
            {
              label: 'Archived',
              hint: archivedSessions.length > 0 ? `${archivedSessions.length} conversations` : undefined,
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                setArchivesOpen(true);
              },
            },
            {
              label: 'Agents',
              hint: 'shared workers',
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                setAgentsGlobalOpen(true);
              },
            },
            {
              label: 'Jobs',
              hint: 'scheduled tasks',
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                openJobs();
              },
            },
          ]}
          onClose={() => setMoreOpen(false)}
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

      {tuneOpen ? (
        <ModelTuneSheet
          threadId={activeThread}
          onClose={() => setTuneOpen(false)}
        />
      ) : null}

      {newTagPrompt ? (
        <PromptSheet
          title="Name this tag"
          hint="then build the ordered fallback route"
          initialValue=""
          placeholder="opus, sonnet, research…"
          maxLength={40}
          onSubmit={createTagNamed}
          onClose={() => setNewTagPrompt(false)}
        />
      ) : null}

      {tagEditorDiscard ? (
        <ActionSheet
          preview="Discard the unsaved route changes?"
          options={[
            {
              label: 'Discard changes',
              danger: true,
              onPress: () => {
                setTagEditorDiscard(false);
                setTagEditorDirty(false);
                setTagEditor(null);
                setSettingsPage('tags');
              },
            },
          ]}
          onClose={() => setTagEditorDiscard(false)}
        />
      ) : null}

      {tagToDelete ? (
        <ActionSheet
          preview={`Delete the tag "${tagToDelete}"? Configs still referencing tag:${tagToDelete} will fall back to the Default tag until it is recreated.`}
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
        <ApprovalSheet
          request={approvals[0]!}
          pending={approvals.length - 1}
          onDecide={decision => {
            connection.send(encodeApprovalResponse(approvals[0]!.id, decision));
            setApprovals(current => current.slice(1));
          }}
          // Dismissing is not an answer: the call stays pending server-side until it times out
          // and is journalled as expired. Denying is a button, never a tap on the backdrop.
          onDismiss={() => setApprovals(current => current.slice(1))}
        />
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
          subtitle="public and per-workspace"
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
                else { const { since: saSince, leaf: saLeaf } = chatStore.getSyncState(view.threadId); connection.send(encodeSessionSync(view.threadId, saSince, saLeaf ?? undefined)).catch(() => {}); }
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

      {instructionsPageOpen ? (
        <>
          <SessionInstructionsScreen
            onClose={() => {
              sessionInstructionsStore.close();
              setInstructionsPageOpen(false);
            }}
            onPatch={patch => {
              const threadId = sessionInstructions.threadId;
              if (!threadId) return;
              sessionInstructionsStore.pending();
              connection.send(encodeSessionInstructionsSet(threadId, patch)).catch(() => {
                sessionInstructionsStore.fail('Failed to send the control');
              });
            }}
            onEditLayer={(workspace, file) => {
              instructionsStore.openEditor(workspace, file);
              setInstructionsPageEditing(true);
              connection.send(encodeInstructionsGet(workspace, file)).catch(() => {});
            }}
            onEditNested={item => {
              const threadId = sessionInstructions.threadId ?? undefined;
              const workspace = sessionInstructions.payload?.workspace ?? 'default';
              // The editor is addressed by the path the report listed, absolute included: the
              // server checks it against what this very conversation read.
              instructionsStore.openEditor(workspace, item.path);
              setInstructionsPageEditing(true);
              connection.send(encodeInstructionsGetNested(workspace, item.path, threadId)).catch(() => {});
            }}
          />
          {instructionsPageEditing && instructions.editor ? (
            // The editor is written for the settings stack, where the shell's container paints
            // and pads it; over this page it is a layer and has to carry its own stage.
            <ScreenLayer>
              <InstructionEditorScreen
                editor={instructions.editor}
                maxBytes={instructions.maxBytes}
                onBack={() => {
                  instructionsStore.closeEditor();
                  setInstructionsPageEditing(false);
                  // The report is stale the moment a file is saved: ask again rather than show
                  // sizes and origins that the edit just invalidated.
                  const threadId = sessionInstructions.threadId;
                  if (threadId) {
                    sessionInstructionsStore.open(threadId);
                    connection.send(encodeSessionInstructionsGet(threadId)).catch(() => {});
                  }
                }}
                onChange={draft => instructionsStore.edit(draft)}
                onSave={() => {
                  const editor = instructions.editor;
                  if (!editor) return;
                  instructionsStore.markSaving();
                  const threadId = sessionInstructions.threadId ?? undefined;
                  connection
                    .send(
                      editor.origin === 'nested'
                        ? encodeInstructionsSetNested(editor.workspace, editor.file, editor.draft, editor.sha ?? '', threadId)
                        : encodeInstructionsSet(editor.workspace, editor.file, editor.draft, editor.sha),
                    )
                    .catch(() => {});
                }}
                onReload={() => {
                  const editor = instructions.editor;
                  if (!editor) return;
                  const nested = editor.origin === 'nested';
                  instructionsStore.openEditor(editor.workspace, editor.file);
                  connection
                    .send(
                      nested
                        ? encodeInstructionsGetNested(editor.workspace, editor.file, sessionInstructions.threadId ?? undefined)
                        : encodeInstructionsGet(editor.workspace, editor.file),
                    )
                    .catch(() => {});
                }}
              />
            </ScreenLayer>
          ) : null}
        </>
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

      {/* Last, so it covers the sheets and the viewers that can open it. */}
      {selection ? <SelectionViewer target={selection} onClose={() => setSelection(null)} /> : null}
    </SafeAreaView>
    </TextSelectionContext.Provider>
  );
}

const createStyles = (palette: Palette) => ({
  safe: { flex: 1, backgroundColor: palette.bg },
  shell: { flex: 1, flexDirection: 'row' as const },
  container: {
    flex: 1,
    // A column in a row: without this a wide conversation pushes the list off the screen.
    minWidth: 0,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  containerSplit: { flexDirection: 'row' as const },
  chatPane: { flex: 1, minWidth: 0 },
  chatWrap: { flex: 1, minWidth: 0 },
  pageFull: { flex: 1 },
  pagePane: {
    width: 460,
    marginLeft: space.md,
    paddingLeft: space.md,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
  },
});
