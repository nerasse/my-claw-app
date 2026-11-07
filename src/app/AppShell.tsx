import type { FileKind } from '../core/fileKind';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Linking, Platform, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { connection } from '../core/connection';
import {
  chatStore,
  useWaitingSendsKey,
  useSpawnCards,
  useActiveRun,
  useCompacting,
  useHistoryPage,
  useUnreadThreads,
  useRunningThreads,
  type TextItem,
} from '../core/chat';
import { formatTranscript } from '../core/transcript';
import { retryDelayAfter, sendsToRetry } from '../core/sendRetry';
import { questionStore, useQuestionThreads } from '../core/questionStore';
import { useUndoPrompts, undoStore } from '../core/undoStore';
import { bootFrames, resumeFrames } from '../core/resume';
import { groupRoster, groupSharedRoster, spawnDoorsOf, spawnLiveOf, subAgentCallersStore, useSubAgentCallers, useSubAgents } from '../core/subagents';
import { backFrom, backLabel, reachableFrom, rostersFor, stackedOn } from '../core/subagentStack';
import { sessionStore, useArchivedSessions, useFolders, useSessions } from '../core/sessions';
import { workspaceOptions } from '../core/workspaceFilter';
import { isStopCommand, parseTagCommand } from '../core/commands';
import { prefs } from '../core/prefs';
import { flushDiagnostics, loadDiagnostics, recordDiag } from '../core/diagnostics';
import {
  encodeAccounts,
  type AccountKind,
  encodeApprovalResponse,
  encodeApprovalGrants,
  encodeQuestionReply,
  encodeUndoCancel,
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
  encodeAgentsRetrySet,
  encodeAgentsDefaultCapSet,
  encodeAgentFileGet,
  encodeAgentFileSet,
  encodeAgentFileCreate,
  encodeAgentFileDelete,
  encodeChatSend,
  encodeChatStop,
  encodeChatContinue,
  encodeSessionQuotaRetrySet,
  encodeSessionQuotaRetryNow,
  encodeSessionInstructionsGet,
  encodeSessionInstructionsSet,
  encodeInstructionsSetNested,
  encodeStatusUnwatch,
  encodeStatusWatch,
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
  encodeSessionFolder,
  encodeFolderCreate,
  encodeFolderRemove,
  encodeFolderRename,
  encodeFolderOrder,
  FOLDER_NAME_LIMIT,
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
  encodeToolsConfirm,
  encodeWorkspacesList,
  encodeWorkspacesAdd,
  encodeWorkspacesRemove,
  encodeWorkspacesRename,
  encodeWorkspacesSetPath,
  encodeJobsList,
  encodeJobsSave,
  encodeJobsDelete,
  encodeJobsRuns,
  encodeUiPrefsGet,
  encodeUiPrefsSet,
  encodeUpdateRun,
  MAX_TITLE_LENGTH,
  type AgentFileFieldsOut,
  type ApprovalRequestFrame,
  type ProviderInfo,
  type ApprovalHistoryResultFrame,
  type FileScopeMode,
  type FolderSummary,
  type JobEntry,
  type SubAgentEntry,
  type JobRunEntry,
  type JobFieldsOut,
  type LogsTailQuery,
  type McpEntry,
  type ModelOption,
  type BrowserUnblockResultFrame,
  type UnavailableModel,
  type SessionFileMeta,
  type SessionSummary,
  type SkillEntry,
  type StatusPayload,
  type SkillTarget,
  type ToolEntry,

  type UiPrefsResultFrame,
  type LocationInput,
  type WorkspaceEntry,
  encodeNotificationsChannels,
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
  encodeProvidersRenamePreview,
  encodeProvidersUpsert,
  type ProviderRenameRefs,
} from '../core/protocol';
import {
  dismissThreadNotification,
  parseNotificationLink,
  pushSupported,
  registerForPush,
  resetPushRegistration,
  subscribeToPushRegistration,
} from '../core/notifications';
import { contextPercent } from '../core/context';
import {
  catalogAnswered,
  declareModel,
  modelStore,
  undeclareModel,
  useModelCatalog,
  useThreadModel,
  withoutEndpoint,
} from '../core/model';
import { showsAgentsButton, showsModelButton } from './headerControls';
import { jobsStore } from '../core/jobs';
import { agentsStore, useAgentsConfig } from '../core/agents';
import { tagsStore, useTags } from '../core/tags';
import { deleteProviderCascadeLabel, deleteProviderPreview, renamePreviewText, tagRoutesSuffix, tagRoutesThroughProvider } from '../core/providerRefs';
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
import { deviceBridge, deviceEvents } from '../core/nativeBridge';
import type { OutgoingAttachment } from '../core/upload';
import type { WsStatusPayload } from '../core/types';
import { reduceUpdate, type UpdatePhase } from '../core/serverUpdate';
import { appUpdateAsks, appUpdateDecision, reduceAppUpdate, type AppUpdatePhase } from '../core/appUpdate';
import { appUpdateRuntime, appUpdateSupported } from '../core/appUpdateRuntime';
import { playAlertSound } from '../core/alertSound';
import { resetToolOutputAsks } from '../core/toolOutput';
import { dropReasoningAsks, knownReasoning } from '../core/reasoningFetch';
import { httpOrigin, uuid, withView } from '../core/utils';
import { ChatScreen } from './ChatScreen';
import { ContextMeter } from '../components/ContextMeter';
import {
  AgentIcon,
  ArchiveIcon,
  CalendarIcon,
  ChartIcon,
  CopyAllIcon,
  CopyIcon,
  DigestIcon,
  DocIcon,
  EraserIcon,
  FilesIcon,
  FolderIcon,
  GearIcon,
  InfoIcon,
  MoveToFolderIcon,
  OpenInNewIcon,
  PencilIcon,
  CheckIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  SiphonIcon,
  SlidersIcon,
  SparkIcon,
  TrashIcon,
  WaitResetIcon,
} from '../components/icons';
import { SettingsScreen } from './SettingsScreen';
import { AppearanceScreen } from './AppearanceScreen';
import { UpdatesScreen } from './UpdatesScreen';
import { AdvancedScreen } from './AdvancedScreen';
import { ServersScreen } from './ServersScreen';
import { multiServerSupported, serversStore } from '../core/servers';
import { NotificationsScreen } from './NotificationsScreen';
import { PairingScreen, usePairing } from './PairingScreen';
import { cancelPairing } from '../core/pairingClient';
import { subscribeAPNs, enableAPNs, subscribeNotificationOpen, setVisiblePushThread, invalidateAPNs } from '../core/apns';
import { setDraftScope } from '../core/drafts';
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
import { ModelsScreen } from './ModelsScreen';
import { useAccounts } from '../core/accounts';
import { useQuotaRetry, type QuotaRetryState } from '../core/quota';
import { formatReset } from '../components/QuotaCard';
import { ProviderScreen, type ProviderSearch } from './ProviderScreen';
import { ModelEditScreen } from './ModelEditScreen';
import { ProviderEditScreen, type ProviderPatch } from './ProviderEditScreen';
import { ProviderAddScreen } from './ProviderAddScreen';
import { NAME_TAKEN, nameTaken, type ProviderService } from '../core/providerServices';
import { ProviderEnvScreen } from './ProviderEnvScreen';
import { providerRenameStore, providersEnvStore, useProviderRenamePreview, useProvidersEnv } from '../core/providers';
import { EmptyCategoryScreen } from './EmptyCategoryScreen';
import { SkillsScreen } from './SkillsScreen';
import { DevicesScreen } from './DevicesScreen';
import { NodesScreen } from './NodesScreen';
import { NodeScreen } from './NodeScreen';
import { ServicesScreen } from './ServicesScreen';
import { EmbeddingsScreen } from './EmbeddingsScreen';
import { SETUP_WIDTH, SetupScreen, setupBanner, toggleSkip, useSetupSteps } from './SetupScreen';
import { AccountScreen } from './AccountScreen';
import { PageCloseContext } from '../components/CloseButton';
import { overlayStore } from '../core/overlay';
import { focusField, leaveField, menuOpen, useKeyNav } from '../core/keyNav';
import { MOVING_AROUND, SHORTCUTS, comboLabel, shortcutHint, type ShortcutId } from '../core/shortcuts';
import { modelReady, sendNeedsModel } from '../core/setup';
import { ToolsScreen } from './ToolsScreen';
import { SkillViewer } from './SkillViewer';
import { WorkspacesScreen } from './WorkspacesScreen';
import { FilesScreen } from './FilesScreen';
import type { MediaItem } from '../components/MediaCarousel';
import { ImageViewer } from './ImageViewer';
import { SelectionViewer } from './SelectionViewer';
import { TextViewer } from './TextViewer';
import { VideoViewer } from './VideoViewer';
import { SvgViewer } from './SvgViewer';
import { PdfViewer } from './PdfViewer';
import { HtmlViewer } from './HtmlViewer';
import { ArchiveViewer } from './ArchiveViewer';
import { FileViewer } from './FileViewer';
import { DiagnosticsScreen } from './DiagnosticsScreen';
import { ArchivesScreen } from './ArchivesScreen';
import { BrowserScreen } from './BrowserScreen';
import { browserFromLocation, closeShownWindow } from '../core/browserLive';
import { panes, readPanes } from '../core/panes';
import {
  closeViewer,
  readRightPane,
  rightPane,
  setSettingsPage,
  setAgentsGlobalOpen,
  setAgentsOpen,
  setApprovalsOpen,
  setArchivesOpen,
  setBrowserOpen,
  setFilesOpen,
  setInstructionsPageOpen,
  setJobsOpen,
  setSettingsOpen,
  setStatsOpen,
  setStatusOpen,
  setSystemFilesOpen,
  useRightPane,
} from '../core/rightPane';
import { PagePane, PinnedColumn, ViewerPane } from './DesktopColumns';
import { AgentsScreen } from './AgentsScreen';
import { StatusScreen } from './StatusScreen';
import { StatsScreen } from './StatsScreen';
import { ApprovalsScreen } from './ApprovalsScreen';
import { useApprovalGrants } from '../core/approvalGrants';
import { SystemFilesScreen } from './SystemFilesScreen';
import { JobsScreen } from './JobsScreen';
import { JobsEditorScreen } from './JobsEditorScreen';
import { JobSessionsScreen } from './JobSessionsScreen';
import { CONNECTION_LABEL, Drawer } from './Drawer';
import { PromptSheet } from '../components/PromptSheet';
import { ApprovalSheet } from '../components/ApprovalSheet';
import { UndoSheet } from '../components/UndoSheet';
import { ApprovalHistoryScreen } from './ApprovalHistoryScreen';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import { KeyboardShell } from '../components/KeyboardShell';
import { AppUpdateModal } from './AppUpdateModal';
import { OverlayHost } from '../components/OverlayHost';
import { ModelSheet, pickerStart, type PickerState } from '../components/ModelSheet';
import { SiphonSheet } from '../components/SiphonSheet';
import { ModelTuneSheet } from '../components/ModelTuneSheet';
import { space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useThemeControl } from '../theme/ThemeProvider';
import { statusStore } from '../core/status';
import { statsStore } from '../core/stats';
import { fsStore } from '../core/fsStore';
import { messageSelectionBody, TextSelectionContext, type SelectionTarget } from '../core/textSelection';
import { useLayout } from '../core/layout';
import { useHardwareBack } from '../core/hardwareBack';
import { useHotkeys } from '../core/hotkeys';
import { initialRoute, showThread, watchBack } from '../core/route';
import { isSubAgentThread, routeServerFrame, type ServerFrameHandlers } from '../core/frameRouter';
import {
  parentOf,
  readsAgentsConfig,
  PAGE_REQUESTS,
  READS_INSTRUCTIONS_PAGES,
  reopenPage,
} from './settingsPages';
import { closeTopLayer } from './backCascade';
import { AgentModelPickerPage } from './AgentModelPickerPage';
import { TagEditorPage } from './TagEditorPage';
import { setPageTitle } from '../core/pageTitle';

/** One page of replayed history, not a ceiling: scrolling past the oldest asks for the next. */
const HISTORY_LIMIT = 50;
/**
 * How long a send waits for its receipt before reading as undelivered. The receipt is sent before
 * the server does anything with the message, so a healthy link answers in milliseconds; the margin
 * is for a server whose loop is held by a large session opening.
 */
const RECEIPT_TIMEOUT_MS = 15_000;

/**
 * A frozen empty for the model list this shell hands to the provider page. A fresh `[]` reads the
 * same but is a new identity every render, which silently defeats the memo of whatever gets it.
 */
const EMPTY_MODELS: ModelOption[] = [];
Object.freeze(EMPTY_MODELS);
const EMPTY_UNAVAILABLE: UnavailableModel[] = [];
Object.freeze(EMPTY_UNAVAILABLE);

/**
 * Past this many workspaces the filter picker gets a search row. Below it, the list is short enough
 * to read, and a search field over three rows is a control that costs a tap and saves none.
 */
const WORKSPACE_SEARCH_FROM = 9;

/** The session-level actions both menus draw from; see `sessionEntries`. */
type SessionEntryKey = 'refresh' | 'model' | 'tune' | 'instructions' | 'files' | 'systemFiles' | 'status' | 'transcript';

/**
 * The chat on screen is a sub-agent rather than a conversation. Carries the parent so the header
 * can name it, so a send can declare which conversation it is driven from, and so the way back
 * lands where the owner came from.
 */
type SubAgentView = {
  threadId: string;
  id: string;
  type: string;
  status: 'idle' | 'running';
  messageCount: number;
  parentThreadId: string;
  /** Where its tools work. Absent on an agent spawned before the server carried the field. */
  workspaceDir?: string;
  /** The sub-agent chat this one was opened from, when it was one: back returns there. */
  parent?: SubAgentView;
};

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
 * Ships the staged file's own history with an update failure.
 *
 * The message on screen says what a person needs ("the downloaded file is gone, download it
 * again"); who deleted what, and when, is what the server log is for. An app-update failure
 * otherwise arrives as a raw Java message with no history -- which is exactly why the ENOENT of
 * 2026-09-15 could not be attributed to the download, the installer or a clear. Owner's call: the
 * detail goes to the diagnostics, not into the dialog.
 */
function reportUpdateFailure(what: string, message: string): void {
  appUpdateRuntime
    .journal()
    .then(journal => {
      recordDiag({
        kind: 'js',
        at: Date.now(),
        message: `app update ${what}: ${message}`,
        ...(journal ? { stack: journal } : {}),
      });
    })
    .catch(() => {});
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
  const [identity, setDeviceInfo] = useState<DeviceInfo | null>(null);
  /** The server's media ticket (`media.ticket`), kept apart: it may arrive before the identity does. */
  const [mediaTicket, setMediaTicket] = useState<string | undefined>(undefined);
  const deviceInfo = useMemo(
    () => (identity ? { ...identity, ...(mediaTicket ? { ticket: mediaTicket } : {}) } : null),
    [identity, mediaTicket],
  );
  /** Native pairing state; the PairingScreen drives it and this screen chooses whether to show it. */
  const pairing = usePairing();
  const [pairingOpen, setPairingOpen] = useState(false);
  const unauthorizedHandled = useRef(false);
  /** The address setting's writer, defined further down, for the pairing effect below. */
  const changeUrlRef = useRef<(next: string) => void>(() => {});
  useEffect(() => {
    // The server-minted credentials are stored and the chat socket is reconnecting: leave the
    // pairing screen and show the chat.
    if (pairing.phase === 'granted') {
      setPairingOpen(false);
      unauthorizedHandled.current = false;
      // What was typed (`http://host:port`, or the QR's origin) becomes the socket address the app
      // now talks to: otherwise the Server page reads "still talking to …" right after joining.
      changeUrlRef.current(pairing.url);
      getDeviceInfo().then(setDeviceInfo).catch(() => setDeviceInfo(null));
    }
  }, [pairing]);
  useEffect(() => {
    // First launch, or a server that does not know this device: the socket answered 401, and no
    // Connect will ever get past it. The Join screen opens on every refusal that follows an
    // attempt; closed by the owner, it stays closed until the next one (Server, Connect or Join).
    // A browser does not pair here: its pairing is the server's /pair page.
    if (Platform.OS === 'web') return;
    if (status.state === 'disconnected' && status.reason === 'unauthorized' && !unauthorizedHandled.current) {
      unauthorizedHandled.current = true;
      invalidateAPNs();
      setDeviceInfo(null);
      setSettingsOpen(false);
      setPairingOpen(true);
    }
  }, [status]);
  // The active server profile follows the address, the conversation and the skipped steps.
  useEffect(() => prefs.subscribe(current => serversStore.syncActive(current)), []);
  /** Connect from the Server page: a refusal after it opens the Join screen again. */
  const connectByHand = useCallback(() => {
    unauthorizedHandled.current = false;
    connection.connect(url);
  }, [url]);
  const openJoin = useCallback(() => {
    // A completed attempt is kept at module scope; clear it before starting a new one so the
    // granted-state auto-close cannot dismiss this screen.
    if (pairing.phase === 'granted') cancelPairing();
    setSettingsOpen(false);
    setPairingOpen(true);
  }, [pairing.phase]);
  /** The running build's version name, read from the package once at boot. */
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Bumped by Ctrl+K; the drawer's search field reads it and takes the caret. */
  const [searchFocus, setSearchFocus] = useState(0);
  /**
   * The workspace the conversation list is narrowed to, and the sheet that picks it. Held here
   * rather than in the drawer: the panel, the pinned column and the home list are three mounts of
   * the same listing, and a filter each of them kept to itself would be three listings.
   */
  const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(null);
  const [workspaceFilterOpen, setWorkspaceFilterOpen] = useState(false);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const closeWorkspaceFilter = useCallback(() => {
    setWorkspaceFilterOpen(false);
    setWorkspaceQuery('');
  }, []);
  /**
   * Folders the owner folded away, remembered on the device. Kept in the shell for the same reason
   * the filter is -- three mounts, one list -- and in the settings bag for a different one: a fold
   * makes room on a phone, and having to redo it at every launch is the kind of small tax that
   * makes a list feel unlike a room.
   */
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>(prefs.get().collapsedFolders);
  useEffect(() => {
    const apply = () => setCollapsedFolders(prefs.get().collapsedFolders);
    apply();
    return prefs.subscribe(apply);
  }, []);
  const toggleFolder = useCallback((folderId: string) => {
    const current = prefs.get().collapsedFolders;
    prefs.set(
      'collapsedFolders',
      current.includes(folderId) ? current.filter(id => id !== folderId) : [...current, folderId],
    );
  }, []);

  /** The folder being made. `workspace` is the filter on screen: that is where the owner is. */
  const [folderToCreate, setFolderToCreate] = useState<{ workspace?: string } | null>(null);
  const [folderMenu, setFolderMenu] = useState<FolderSummary | null>(null);
  const [folderToRename, setFolderToRename] = useState<FolderSummary | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderSummary | null>(null);
  /** The conversation being filed. It decides what the picker offers as "where it is now". */
  const [threadToFile, setThreadToFile] = useState<SessionSummary | null>(null);

  /**
   * Files a conversation. The echo is local and immediate -- the server's listing follows and
   * confirms -- so the tap does not read as lost on a slow link.
   */
  const fileThread = useCallback((threadId: string, folderId: string | null) => {
    sessionStore.setFolder(threadId, folderId);
    connection.send(encodeSessionFolder(threadId, folderId)).catch(() => {});
  }, []);

  /** Same for the folders themselves: the order is echoed, then confirmed by the listing. */
  const reorderFolders = useCallback((order: string[]) => {
    sessionStore.setFolderOrder(order);
    connection.send(encodeFolderOrder(order)).catch(() => {});
  }, []);
  // The first run (docs: setup assistant): until it is finished or skipped, the setup page is the
  // whole app. Derived into settingsOpen, so nothing that closes settings can leave it.
  const [setupGate, setSetupGate] = useState(false);
  // The right-hand column, as one value: which page it holds. Opening a page replaces whatever
  // it held, so two pages can never be drawn at once -- the bug of 2026-10-26, where Settings
  // opened under Jobs and the browser stayed under the settings page. `docs/right-pane.md`.
  const right = useRightPane();
  const settingsOpen = right.page === 'settings' || setupGate;
  const filesOpen = right.page === 'files';
  const archivesOpen = right.page === 'archives';
  const browserOpen = right.page === 'browser';
  const statusOpen = right.page === 'status';
  const statsOpen = right.page === 'stats';
  const approvalsOpen = right.page === 'approvals';
  const systemFilesOpen = right.page === 'system-files';
  const instructionsPageOpen = right.page === 'instructions';
  const jobsOpen = right.window === 'jobs';
  const agentsOpen = right.window === 'agents';
  const agentsGlobalOpen = right.window === 'agents-global';
  // Where the default-model picker returns: the agents list, or the assistant that opened it.
  const [modelPickerFrom, setModelPickerFrom] = useState<'setup' | 'account' | null>(null);
  /** The get started opens Devices on its invitation, and Back returns to it. */
  const [devicesFrom, setDevicesFrom] = useState<'index' | 'setup'>('index');
  // The setup is reached from the banner on the index while it is unfinished, from Advanced after.
  const [setupFrom, setSetupFrom] = useState<'index' | 'advanced'>('index');
  // The subscription the account page shows (docs: subscription-accounts in the server repo).
  const [selectedAccount, setSelectedAccount] = useState<{ provider: string; kind: AccountKind }>({ provider: 'chatgpt', kind: 'codex' });
  const [accountPrompt, setAccountPrompt] = useState<
    { mode: 'add'; kind: AccountKind } | { mode: 'rename'; provider: string; current: string } | null
  >(null);
  // The account this window asked for: only it opens the page once the server has declared it.
  const pendingAccount = useRef<AccountKind | null>(null);
  // The service the provider form adds, chosen on the + page; absent for Custom.
  const [providerService, setProviderService] = useState<ProviderService | undefined>(undefined);
  // The provider just added, drawn on its page until the server's snapshot carries it: the page
  // opens at once on "asking for its models" rather than flashing the list in between.
  const [addedProvider, setAddedProvider] = useState<ProviderInfo | null>(null);
  // The provider page is reached from the list, or from a plan's page: Back returns there.
  const [providerFrom, setProviderFrom] = useState<'models' | 'account'>('models');
  const accountsFrame = useAccounts().frame;
  // An account this window added: open its page and start the sign-in, the next thing to do.
  useEffect(() => {
    const added = accountsFrame?.added;
    const kind = pendingAccount.current;
    if (!added || !kind) return;
    pendingAccount.current = null;
    setSelectedAccount({ provider: added, kind });
    setSettingsPage('account');
    connection.send(encodeAccounts({ type: 'accounts.login', provider: added })).catch(() => {});
  }, [accountsFrame]);
  /**
   * Which settings page is showing: the index lists the categories, every other value is a
   * page under it, and back always walks one level up.
   *
   * It lives in the right-pane store with the rest of the column, because it is what a reload
   * comes back to: reopening the index every time made the owner walk three levels again to
   * reach the screen he was working in (2026-10-26).
   */
  const settingsPage = right.settingsPage;
  /** The agent detail page shows this key, taken from the last agents.config.result. */
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
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
  const [providerToDelete, setProviderToDelete] = useState<{
    key: string;
    keyEnv?: string;
    /** Declared models under it, counted when the sheet opens: they are what the server refuses on. */
    declaredModels: string[];
    /**
     * Tags whose route steps through it, with the candidate that does. Counted here for the same
     * reason as the models: the server refuses on them too, and a cascade the owner was not shown
     * is a route that quietly stops meaning what it says.
     */
    tagRoutes: Array<{ tag: string; model: string }>;
  } | null>(null);
  /**
   * A provider key rename, staged until the server says what it touches. The sheet only opens on
   * the preview's answer; the rename itself runs when the owner confirms.
   */
  const [providerRename, setProviderRename] = useState<{
    from: string;
    to: string;
    patch: ProviderPatch;
    refs: ProviderRenameRefs | null;
  } | null>(null);
  const renamePreview = useProviderRenamePreview();
  /** The staged rename and its fallback timer: the answer, and an old server's silence, race them. */
  const renameStaged = useRef<{ from: string; to: string } | null>(null);
  const renameFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Which workspace the workspace page shows. The instruction editor and the layer screen hang
   *  under it, so it outlives them: back walks down to this page, not to a list. */
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('default');
  /** The workspace page is a page of the workspaces list, but the agent page links straight into
   *  the workspace it is pinned to: back has to return where the user came from. */
  const [workspaceFrom, setWorkspaceFrom] = useState<'workspaces' | 'agent'>('workspaces');
  // Where the prompt-file editor goes back to: its workspace page, or the assistant that opened it.
  const [instructionBack, setInstructionBack] = useState<'workspace' | 'setup'>('workspace');
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
  const [numberEditor, setNumberEditor] = useState<{ field: 'iterations' | 'contextcap'; agent: string } | { field: 'defaultcap' } | null>(null);
  const defaultCapEditor = numberEditor?.field === 'defaultcap';
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
  /** Server-owned display prefs: every device starts from the same layout choices. */
  const [uiPrefs, setUiPrefs] = useState<UiPrefsResultFrame | null>(null);
  /** Everything the update button knows. A phase, not booleans: see core/serverUpdate.ts. */
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>({ kind: 'idle' });
  /** The app update card: check, download, install. See core/appUpdate.ts. */
  const [appUpdatePhase, setAppUpdatePhase] = useState<AppUpdatePhase>({ kind: 'idle' });
  /** Mirror of appUpdatePhase for async callbacks: a stale closure must not re-download. */
  const appUpdatePhaseRef = useRef<AppUpdatePhase>({ kind: 'idle' });
  /**
   * Which download attempt owns the phase. A restart abandons the one in flight; its late answer
   * (a rejection from the cancel, or a resolved transfer) must never write the new one's state.
   */
  const appUpdateAttemptRef = useRef(0);
  useEffect(() => {
    appUpdatePhaseRef.current = appUpdatePhase;
  }, [appUpdatePhase]);
  /**
   * The decision the owner said "later" to, not the version. The dialog is modal, so it has to be
   * dismissible; dismissing one decision must not hide the next one -- and a download completing
   * into an install IS the next one (owner, 2026-09-15). Settings always shows the card.
   */
  const [appUpdateDismissed, setAppUpdateDismissed] = useState<string | null>(null);
  const dismissAppUpdate = useCallback(() => {
    setAppUpdateDismissed(appUpdateDecision(appUpdatePhaseRef.current));
  }, []);
  /** Shown for a decision only: an update to fetch, one ready to install, or a failure that explains itself.
   *  Never in a browser, which has nothing to install an APK with. */
  const appUpdateDialogOpen = appUpdateSupported && appUpdateAsks(appUpdatePhase, appUpdateDismissed);
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
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<SessionFileMeta | null>(null);
  /**
   * The viewer on screen, and whether it asked for the whole window.
   *
   * One value for ten viewers, because there is one slot: opening a film while a PDF is up
   * replaces it. That was already the rule, spelled as ten setters every opener had to call in the
   * right order; the shape of the value is where it belongs. The gallery, a text page and a film
   * are the same union, so "what is open" is one question with one answer -- and it is what a
   * reload comes back to.
   */
  const viewer = right.viewer;
  const viewerExpanded = right.expanded;

  // Each viewer as the pair its screen reads: its payload, or null.
  const imageViewer = viewer?.kind === 'image' ? viewer : null;
  const textViewer = viewer?.kind === 'text' ? viewer : null;
  const videoViewer = viewer?.kind === 'video' ? viewer : null;
  const svgViewer = viewer?.kind === 'svg' ? viewer : null;
  const pdfViewer = viewer?.kind === 'pdf' ? viewer : null;
  const htmlViewer = viewer?.kind === 'html' ? viewer : null;
  const officeViewer = viewer?.kind === 'office' ? viewer : null;
  const archiveViewer = viewer?.kind === 'archive' ? viewer : null;
  const fileViewer = viewer?.kind === 'file' ? viewer : null;
  const skillViewer = useMemo(
    () => (viewer?.kind === 'skill' ? { url: viewer.url, skill: viewer.skill as SkillEntry } : null),
    [viewer],
  );

  // Every opener is one write on the same slot: what was on screen is replaced, and the next
  // viewer starts beside the conversation (the toggle is the exception, not the promise). Stable
  // identities on purpose: the shell hands these to the memoized chat list, which stops holding
  // when one changes on every render.
  const openImage = useCallback((images: MediaItem[], index: number): void => {
    rightPane.openViewer({ kind: 'image', images, index });
  }, []);
  const openTextViewer = useCallback((target: { url: string; filename: string; kind?: FileKind }): void => {
    rightPane.openViewer({ kind: 'text', url: target.url, filename: target.filename, ...(target.kind ? { file: target.kind } : {}) });
  }, []);
  const openVideoViewer = useCallback((target: { url: string; filename: string }): void => {
    rightPane.openViewer({ kind: 'video', ...target });
  }, []);
  const openSvgViewer = useCallback((target: { url: string; filename: string }): void => {
    rightPane.openViewer({ kind: 'svg', ...target });
  }, []);
  const openPdfViewer = useCallback((target: { url: string; filename: string }): void => {
    rightPane.openViewer({ kind: 'pdf', ...target });
  }, []);
  const openHtmlViewer = useCallback((target: { url: string; filename: string }): void => {
    rightPane.openViewer({ kind: 'html', ...target });
  }, []);
  const openOfficeViewer = useCallback((target: { url: string; filename: string }): void => {
    rightPane.openViewer({ kind: 'office', ...target });
  }, []);
  const openArchiveViewer = useCallback((target: { url: string; filename: string }): void => {
    rightPane.openViewer({ kind: 'archive', ...target });
  }, []);
  const openFileViewer = useCallback((target: { url: string; filename: string; sizeBytes?: number }): void => {
    rightPane.openViewer({ kind: 'file', ...target });
  }, []);
  const openSkillViewer = useCallback((target: { url: string; skill: SkillEntry }): void => {
    rightPane.openViewer({ kind: 'skill', url: target.url, skill: target.skill });
  }, []);
  /** Closes whatever viewer is up, from one place: the back key, the cross of a viewer, a send. */
  const closeViewers = closeViewer;
  const [sessionFiles, setSessionFiles] = useState<SessionFileMeta[]>([]);
  const [filesTotal, setFilesTotal] = useState(0);
  // A web tab opened on the browser (every window, or one popped out) opens on it.
  const [browserLaunch] = useState(browserFromLocation);
  const browserWindow = browserLaunch?.window ?? null;
  // The browser page with the whole window to itself (owner, 2026-09-29: a tab with every screen).
  const [browserFull, setBrowserFull] = useState(browserLaunch !== null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [browserUnblock, setBrowserUnblock] = useState<BrowserUnblockResultFrame | null>(null);
  /** The More sheet in the drawer footer: Archived, Agents, Jobs, Browser, Statistics, Settings. */
  const [moreOpen, setMoreOpen] = useState(false);
  const [diagSnapshot, setDiagSnapshot] = useState('');
  const [diagLogs, setDiagLogs] = useState('');
  const [diagBusy, setDiagBusy] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [autoFocusHero, setAutoFocusHero] = useState(false);
  const [bubbleMenu, setBubbleMenu] = useState<TextItem | null>(null);
  // A reasoning the page left on the server is in the menu once it has been read.
  const openBubbleMenu = useCallback(
    (item: TextItem) => {
      const reasoning = item.reasoning ?? (activeThread ? knownReasoning(activeThread, item.id) : undefined);
      setBubbleMenu(reasoning ? { ...item, reasoning } : item);
    },
    [activeThread],
  );
  // The block a reader asked to select from. Held by the shell rather than by whoever opened it:
  // a tool card scrolled out of the window must not take the viewer with it.
  const [selection, setSelection] = useState<SelectionTarget | null>(null);
  const openSelection = useCallback((target: SelectionTarget) => setSelection(target), []);
  const [threadMenu, setThreadMenu] = useState<SessionSummary | null>(null);
  /**
   * Opening the menu re-reads the model state of the conversation it was opened on: the drawer can
   * show a conversation this device never opened, and Siphon's row names a pin that lives on that
   * conversation's own session. Without the read the row would answer for the wrong thread.
   */
  const openThreadMenu = useCallback((target: SessionSummary) => {
    setThreadMenu(target);
    connection.send(encodeModelGet(target.threadId)).catch(() => {});
  }, []);
  // The conversation menu's switch and the waiting pill read the server's own state: both fields
  // are pushed when they change, so two devices never disagree on whether a wait is armed.
  const threadMenuQuotaRetry = useQuotaRetry(threadMenu?.threadId ?? null);
  // Siphon's row names the pin, which lives on the conversation the menu was opened on.
  const threadMenuModel = useThreadModel(threadMenu?.threadId ?? null);
  const activeQuotaRetry = useQuotaRetry(activeThread);
  const [threadToRename, setThreadToRename] = useState<SessionSummary | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  /** Whether the effort/window sheet of the conversation is open (the tune sheet). */
  const [tuneOpen, setTuneOpen] = useState(false);
  /**
   * Siphon: the model picker opened as "one model for this whole tree" -- docs/siphon.md.
   *
   * Its own stack rather than a flag on `modelOpen`, because the two flows commit different
   * frames and only one of them may reach the effort and window steps.
   */
  const [siphonOpen, setSiphonOpen] = useState(false);
  const [siphonPicker, setSiphonPicker] = useState<PickerState>(pickerStart);
  /** Which group of the model picker is open: its own stack, walked by the back key. */
  const [modelPicker, setModelPicker] = useState<PickerState>(pickerStart);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  /** The instructions page of a conversation, and whether one of its files is being edited. */
  const [instructionsPageEditing, setInstructionsPageEditing] = useState(false);
  /** The job being edited: null = the list, 'new' = a blank editor, an entry = that job. */
  const [jobsEditor, setJobsEditor] = useState<JobEntry | 'new' | null>(null);
  const [jobsSaving, setJobsSaving] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<JobEntry | null>(null);
  /** The runs page of one job, stacked over the jobs list; a run opens as a chat over it. */
  const [jobSessions, setJobSessions] = useState<{ jobId: string; jobName: string } | null>(null);
  const [subagentView, setSubagentView] = useState<SubAgentView | null>(null);
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
  const approvalGrants = useApprovalGrants();
  // Which conversations hold a question waiting, for the badge in the thread list. The questions
  // themselves are read by the conversation that draws them, not here: a pending ask must not
  // re-render the shell of every page.
  const questionThreads = useQuestionThreads();
  const undoPrompts = useUndoPrompts(activeThread);
  const replyToQuestion = useCallback((id: string, answers: string[][]) => {
    // The card stays where it is, marked sending: the `question.resolved` frame is what drops it,
    // on this window and on every other one. Dropping it here would flicker ahead of the server.
    // A transport that refuses the frame outright is the one failure it can report, and the store
    // turns it straight back into a card that can be sent again instead of one stuck on Sending.
    connection.send(encodeQuestionReply(id, answers)).then(ok => {
      if (!ok) questionStore.replyFailed(id);
    });
  }, []);

  const historyPage = useHistoryPage(activeThread);
  const sessions = useSessions();
  const folders = useFolders();

  /**
   * The folder a conversation is in, by name: the menu says where it is before offering to move it.
   */
  const folderOf = useCallback(
    (thread: SessionSummary): string | undefined =>
      folders.find(folder => folder.id === thread.folderId)?.name,
    [folders],
  );
  const archivedSessions = useArchivedSessions();
  const unread = useUnreadThreads();
  /** Threads a run is answering on right now, for the folder badges. `running` is the one on screen. */
  const runningThreads = useRunningThreads();
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
  // `tags` is listed with the providers on the server and runs nothing: it is not one.
  const providerCount = agentsConfig ? agentsConfig.providers.filter(p => p.type !== 'tags').length : null;
  const setupProgress = setupBanner(useSetupSteps(deviceInfo?.deviceId ?? null, providerCount));
  // The Stop button is pinned to the run, not to a streaming bubble: it survives tool calls
  // and model turns, and only disappears when the run itself ends. A compaction the owner typed
  // holds the session for one to two minutes with no run behind it: the same button reaches it
  // (the server's stop aborts a compaction as it does a run).
  const running = useActiveRun(activeThread);
  const compacting = useCompacting(activeThread);
  const streaming = running || compacting !== undefined;
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

  /**
   * The three pages that belong to the conversation on screen: their body, with no navigation.
   *
   * Written here rather than in their openers because a conversation switch has to re-read them
   * for the new thread without opening anything else (`enterThread`), and two copies of "ask for
   * that thread's files" would drift the way every duplicated path in this shell has.
   */
  const openFilesInner = useCallback((threadId: string) => {
    setFilesError(null);
    rightPane.show('files');
    connection.send(encodeFilesList(threadId)).catch(() => {});
  }, []);
  const openInstructionsInner = useCallback((threadId: string) => {
    sessionInstructionsStore.open(threadId);
    setInstructionsPageEditing(false);
    rightPane.show('instructions');
    connection.send(encodeSessionInstructionsGet(threadId)).catch(() => {});
  }, []);

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

  /**
   * Puts a conversation on screen, sub-agent or not. The one door in.
   *
   * A sub-agent used to have its own opening path, and the two drifted: it asked for the history
   * and forgot the roster, the model pin and the notification, so `/model` inside a sub-agent
   * answered with the parent's model and a banner for the thread being read stayed in the tray.
   * Anything that must happen on the way in is written once, here.
   */
  const enterThread = useCallback(
    (threadId: string, view: SubAgentView | null) => {
      subagentRef.current = view;
      setSubagentView(view);
      selectThread(threadId);
      chatStore.markRead(threadId);
      setAutoFocusHero(false);
      setDrawerOpen(false);
      /**
       * The right-hand column, when the owner switches conversation.
       *
       * A page *about a conversation* (its files, its status, its instructions) is re-read for
       * the thread now on screen: leaving yesterday's files in the column while another
       * conversation is on the left is the one outcome nobody wants. A page about the install
       * (settings, statistics, the browser, the archives) has no thread in it and simply stays,
       * which is what the owner asked for -- "quand on switch de session ça garde ce qu'il y a à
       * droite". On a phone nothing stays: a page covers the conversation, so the tap would have
       * looked like it did nothing.
       */
      if (layout.pinnedDrawer || layout.sidePane) {
        if (filesOpen) openFilesInner(threadId);
        else if (statusOpen) {
          statusStore.open(threadId);
          connection.send(encodeStatusWatch(threadId)).catch(() => {});
        } else if (instructionsPageOpen) openInstructionsInner(threadId);
      } else {
        rightPane.close();
        statsStore.close();
      }
      // A page that took the window (jobs, the rosters) goes whichever window this is: it covers
      // the conversation, so a tap that landed on one must not leave it on top of the other. Read
      // from the store rather than from the render, or this callback changes identity every time
      // a page opens -- and everything that depends on `openThread` (the boot effect among them)
      // would run again, which reopened the route and closed the very page just opened.
      rightPane.closeWindow();
      // The run that raised a notification is the one now on screen: clear it, whichever way the
      // owner arrived. A tap cancels its own notification, the drawer and the deep link did not.
      dismissThreadNotification(threadId);
      // The parent's roster for the siblings the header offers, and the thread's own for what its
      // cards open: a sub-agent's browser tasks are private to it, so they are in no other roster,
      // and without it a card at level 2 or 3 opened nothing.
      for (const roster of rostersFor(threadId, view?.parentThreadId)) {
        connection.send(encodeSubAgentsList(roster)).catch(() => {});
      }
      // Sync the thread: asks for delta since last known entry, or full page if fresh.
      const { since, leaf } = chatStore.getSyncState(threadId);
      connection.send(encodeSessionSync(threadId, since, leaf ?? undefined));
      // The model of a conversation is per session: refresh it when the thread changes, so
      // the picker never shows the previous conversation's choice.
      connection.send(encodeModelGet(threadId));
    },
    [selectThread, filesOpen, instructionsPageOpen, layout.pinnedDrawer, layout.sidePane, openFilesInner, openInstructionsInner, statusOpen],
  );

  const openThread = useCallback((threadId: string) => enterThread(threadId, null), [enterThread]);

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

  /**
   * Settings opens on the page the owner left it on, which is what "garder ce qu'il y a à droite"
   * means (owner, 2026-10-26): coming back to the index every time meant walking three levels again
   * to reach the screen being worked in. A page that was a transient editor when it closed comes
   * back as its parent (`reopenPage`), because the draft it held is gone with it.
   */
  const openSettings = useCallback(() => {
    setSettingsPage(page => reopenPage(page));
    rightPane.show('settings');
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

  /**
   * The status page is watched server side from open to close: the watch answers with the report
   * and every change to it after that, so the page follows the conversation without asking. It
   * opens beside the conversation it reports on, so a thread named from the drawer is switched to
   * first, like the files page does.
   */
  const openStatus = useCallback(
    (threadId: string, report?: StatusPayload) => {
      if (activeThreadRef.current !== threadId) openThread(threadId);
      statusStore.open(threadId);
      if (report) statusStore.receive({ type: 'status.result', threadId, status: report });
      setStatusOpen(true);
      connection.send(encodeStatusWatch(threadId)).catch(() => {});
    },
    [openThread],
  );

  const closeStatus = useCallback(() => {
    statusStore.close();
    setStatusOpen(false);
    connection.send(encodeStatusUnwatch()).catch(() => {});
  }, []);

  /**
   * Nothing to unwatch: the statistics are answered once per request, so leaving the page is
   * only a matter of dropping the report. The screen asks again on its next opening, which is
   * what an install-wide figure that nothing pushes has to do to stay true.
   */
  const closeStats = useCallback(() => {
    statsStore.close();
    setStatsOpen(false);
  }, []);

  /**
   * The approvals page reads live state only (the pending queue, the journal, the grants), so
   * closing it drops nothing but the pane itself; opening it asks for both server-side lists.
   */
  const closeApprovals = useCallback(() => {
    setApprovalsOpen(false);
  }, []);

  const openApprovals = useCallback(() => {
    setMoreOpen(false);
    setDrawerOpen(false);
    setApprovalsOpen(true);
    connection.send(encodeApprovalHistory()).catch(() => {});
    connection.send(encodeApprovalGrants()).catch(() => {});
  }, []);

  /** Answering from the page: same frame the sheet sends, the server broadcasts the resolution. */
  const decideApproval = useCallback((id: string, decision: Parameters<typeof encodeApprovalResponse>[1]) => {
    connection.send(encodeApprovalResponse(id, decision)).catch(() => {});
    setApprovals(current => current.filter(entry => entry.id !== id));
  }, []);

  /**
   * Closed by its own function for the same reason the statistics page is: what it held (the
   * listing, the open file, the watch) is dropped with it, so a later opening starts from the
   * machine rather than from a stale drawing of it.
   */
  const closeSystemFiles = useCallback(() => {
    fsStore.close();
    setSystemFilesOpen(false);
  }, []);

  /**
   * What this conversation is loaded with. Asked on every opening like the status page: the
   * report is composed on demand server side, so a cached one would age into a lie the moment a
   * file is edited from anywhere.
   */
  const openSessionInstructions = useCallback(
    (threadId: string) => {
      if (activeThreadRef.current !== threadId) openThread(threadId);
      sessionInstructionsStore.open(threadId);
      setInstructionsPageEditing(false);
      setInstructionsPageOpen(true);
      connection.send(encodeSessionInstructionsGet(threadId)).catch(() => {});
    },
    [openThread],
  );

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
    // The id cursor is preferred: the count drifts when the session grows between two loads,
    // and the client trims its oldest items past its cap -- the id names the oldest held item
    // and the page is the one before it. Both are sent; old servers use the count, new ones
    // answer the id. Resolved false, never rejected: a `.catch` here never ran, and the
    // pagination stayed locked on a spinner that nothing could clear.
    connection
      .send(encodeSessionHistory(threadId, HISTORY_LIMIT, page.nextBefore, page.oldestId ?? undefined))
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
      // Stacked on the sub-agent on screen when that is where it was opened from: a cron run, its
      // volet, the volet's browser task, and back one level at a time.
      const view = stackedOn<SubAgentView>(
        {
          threadId: entry.threadId,
          id: entry.id,
          type: entry.type,
          status: entry.status,
          messageCount: entry.messageCount,
          parentThreadId,
          ...(entry.workspaceDir ? { workspaceDir: entry.workspaceDir } : {}),
        },
        subagentRef.current,
      );
      enterThread(entry.threadId, view);
    },
    [enterThread],
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
    if (!view) return;
    const back = backFrom(view);
    // One level up: the sub-agent this was opened from comes back as itself, header and all.
    if ('view' in back) {
      enterThread(back.view.threadId, back.view);
      return;
    }
    subagentRef.current = null;
    setSubagentView(null);
    openThread(back.threadId);
  }, [enterThread, openThread]);

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

  /**
   * The in-app ring, and the one condition that keeps it from doubling the tray.
   *
   * The frame handlers only know the thread, and the open thread does not change when the app
   * goes away: the JS keeps running behind the foreground service, so a run finishing with the
   * phone in a pocket rang here *and* was pushed -- the server only skips a device it was told
   * is `foreground` on that thread. Two sounds for one event, screen off.
   *
   * `AppState` is exactly the boolean the app reports to the server, read at the moment of the
   * frame, so the ring fires on precisely the runs the push skips.
   */
  const ringOnScreen = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    playAlertSound().catch(() => {});
  }, []);

  useEffect(() => {
    const offState = connection.onState(next => {
      setStatus(next);
      if (next.state !== 'connected') {
        // A server's version belongs to its socket: gone with it, or a reconnect to a newer
        // server would show yesterday's label.
        setServerVersion(null);
        setLocationEnabled(false);
        // So are the reads it carried: an ask for a folded run's work or a clipped tool output
        // that left on this socket will never be answered, and the guards against asking twice
        // would otherwise refuse to ask again -- a skeleton, or a "Show more", stuck for good.
        chatStore.dropInflightHydration();
        resetToolOutputAsks();
        dropReasoningAsks();
      }
      if (next.state === 'connected') {
        for (const frame of resumeFrames(activeThreadRef.current)) {
          connection.send(frame).catch(() => {});
        }
        // The foreground the server last heard about can be stale: a state change that lands
        // while the socket is down is swallowed by the send above, and nothing re-asserts it.
        // Its skipDevice decision is read from that store, so a phone that is actually watching
        // the run rings here *and* is pushed there -- the double sound. One small frame on every
        // connect keeps the two clocks from drifting, in both directions (a phone that left for
        // another app would otherwise never be told again, and miss every run silently).
        if (pushSupported) {
          connection
            .send(
              encodeNotificationsState({
                foreground: AppState.currentState === 'active',
                ...(activeThreadRef.current ? { threadId: activeThreadRef.current } : {}),
              }),
            )
            .catch(() => {});
        }
        // Server-owned display prefs shape the conversation as soon as it loads,
        // not when the owner first opens Settings: a fresh tab must render with the same layout
        // choices a phone already applied. The Settings screens re-ask when they open, so the
        // fetch here is only the boot value.
        connection.send(encodeUiPrefsGet()).catch(() => {});
      }
    });
    const offPending = connection.onPending(setPending);
    const instance = Platform.OS === 'ios' ? deviceEvents.addListener('claw:instance', ({ origin }: { origin: string }) => {
      setDraftScope(origin);
      chatStore.clearAll(); sessionStore.replace([]); modelStore.reset(); questionStore.clear();
      activeThreadRef.current = null;
      setActiveThread(null); setApprovals([]); setApprovalHistory(null); setServerVersion(null);
      getDeviceInfo().then(setDeviceInfo).catch(() => setDeviceInfo(null));
    }) : null;

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
      setMediaTicket,
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
      openStatusPage: openStatus,
      openThread,
      setModelOpen,
      setJobsEditor,
      setJobsSaving,
      setJobsError,
      setJobRuns,
      setRunsError,
      setBrowserError,
      setBrowserUnblock,
      setApprovals,
      setApprovalHistory,
      onQuestionAskOnActiveThread: () => {
        // The card is appearing in the thread the owner is looking at: ring once. A question on
        // any other thread, or a device behind, is the push's business (server-side skipDevice
        // keeps a foreground device on the right thread silent on the tray and loud here).
        ringOnScreen();
      },
      onRunEndOnActiveThread: () => {
        // The run finished on the thread on screen: the same ring a question plays. The push
        // skips this device (foreground on that thread), so the ring stands in for the
        // notification here -- the tray and the sound never double up.
        ringOnScreen();
      },
      onUndoPromptOnActiveThread: () => {
        // The sheet is opening on the thread on screen: no ring, it is already the owner's focus.
      },
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
      // What was on the desk last time: the width of both columns and the page in the right one.
      // Read here, once, because the device bag is the only place that outlives the tab. On a
      // phone neither is restored: a page there covers the conversation, and the app opens on the
      // list so the owner picks where to go (the rule `lastThreadId` already follows).
      if (layout.pinnedDrawer) {
        panes.hydrate(readPanes(stored.panes));
        rightPane.hydrate(readRightPane(stored.rightPane));
      }
      serversStore.hydrate().catch(() => {});
      if (Platform.OS === 'ios') {
        getDeviceInfo().then(storedIdentity => {
          setDeviceInfo(storedIdentity);
          if (!storedIdentity.deviceId || !storedIdentity.token) setPairingOpen(true);
        }).catch(() => setPairingOpen(true));
      }
      // A link wins over everything: the address is what the owner asked for. With none, the
      // app boots on the home screen (the session list) and the owner picks a conversation,
      // instead of silently reopening the last one. Always null on Android.
      const target = initialRoute().threadId;
      if (target) openThread(target);
      // No address yet (a new install: none is built in): ask for one before anything connects.
      if (!stored.serverUrl && Platform.OS !== 'web') {
        unauthorizedHandled.current = true;
        setPairingOpen(true);
        return undefined;
      }
      return connection.getState().then(state => {
        setStatus({ state });
        if (stored.serverUrl && state !== 'connected' && state !== 'connecting')
          connection.connect(stored.serverUrl);
        for (const frame of bootFrames(state, activeThreadRef.current)) {
          connection.send(frame).catch(() => {});
        }
      });
    });
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
      instance?.remove();
    };
    // `layout` is read once at boot on purpose: a window resized later must not re-run the boot
    // sequence (reconnect, re-ask every catalogue, reload the thread).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openThread, openStatus, selectThread, ringOnScreen]);

  /**
   * Closes the topmost layer, and says whether there was one.
   *
   * Written once, read by three inputs that all mean the same thing: Android's back key, the
   * browser's Back button and the Escape key. `false` is "nothing left to close", which is what
   * lets the platform do its own thing (leave the app, leave the page).
   *
   * The order of the layers is `backCascade.ts`; what stays here is when the snapshot it reads is
   * taken, which is what the dependency list below decides. `docs/back-cascade.md`.
   */
  const handleBack = useCallback(
    (): boolean =>
      closeTopLayer({
        selection,
        setSelection,
        subagentAction,
        setSubagentAction,
        subagentMenuOpen,
        setSubagentMenuOpen,
        handoff,
        setHandoff,
        agentsOpen,
        setAgentsOpen,
        agentsGlobalOpen,
        setAgentsGlobalOpen,
        statusOpen,
        closeStatus,
        instructionsPageOpen,
        setInstructionsPageOpen,
        instructionsPageEditing,
        setInstructionsPageEditing,
        jobToDelete,
        setJobToDelete,
        jobsOpen,
        setJobsOpen,
        jobsEditor,
        setJobsEditor,
        jobSessions,
        setJobSessions,
        jobSessionsRef,
        setJobRuns,
        imageViewer,
        setImageViewer: closeViewers,
        textViewer,
        setTextViewer: closeViewers,
        videoViewer,
        setVideoViewer: closeViewers,
        fileViewer,
        setFileViewer: closeViewers,
        approvalCount: approvals.length,
        setApprovals,
        fileToDelete,
        setFileToDelete,
        confirmDelete,
        setConfirmDelete,
        workspacePicker,
        setWorkspacePicker,
        tagEditorDiscard,
        setTagEditorDiscard,
        threadToRename,
        setThreadToRename,
        modelOpen,
        setModelOpen,
        modelPicker,
        setModelPicker,
        siphonOpen,
        setSiphonOpen,
        siphonPicker,
        setSiphonPicker,
        tuneOpen,
        setTuneOpen,
        newTagPrompt,
        setNewTagPrompt,
        tagToDelete,
        setTagToDelete,
        providerToDelete,
        setProviderToDelete,
        commandMenuOpen,
        setCommandMenuOpen,
        moreOpen,
        setMoreOpen,
        bubbleMenu,
        setBubbleMenu,
        threadMenu,
        setThreadMenu,
        folderMenu,
        setFolderMenu,
        folderToDelete,
        setFolderToDelete,
        threadToFile,
        setThreadToFile,
        workspaceFilterOpen,
        closeWorkspaceFilter,
        drawerOpen,
        setDrawerOpen,
        pinnedDrawer: layout.pinnedDrawer,
        skillMenu,
        setSkillMenu,
        skillTargets,
        setSkillTargets,
        skillReplace,
        setSkillReplace,
        skillViewer,
        setSkillViewer: closeViewers,
        setSkillsNotice,
        settingsOpen,
        setSettingsOpen,
        settingsPage,
        setSettingsPage,
        agentPicker,
        setAgentPicker,
        agentModelFor,
        setAgentModelFor,
        tagEditor,
        setTagEditor,
        tagEditorDirty,
        providerSearch,
        providerEdit,
        setProviderEdit,
        setModelEdit,
        scopeEditor,
        setScopeEditor,
        tagContextEditor,
        defaultCapEditor,
        workspaceFrom,
        instructionBack,
        modelPickerFrom,
        setupFrom,
        devicesFrom,
        providerFrom,
        setLayerTarget,
        archivesOpen,
        setArchivesOpen,
        browserOpen,
        setBrowserOpen,
        statsOpen,
        closeStats,
        approvalsOpen,
        closeApprovals,
        systemFilesOpen,
        closeSystemFiles,
        filesOpen,
        setFilesOpen,
        subagentRef,
        leaveSubAgent,
        fromArchivesRef,
        fromJobSessionsRef,
        activeThreadRef,
        selectThread,
      }),
    [
      approvals.length,
      agentModelFor,
      agentPicker,
      agentsGlobalOpen,
      agentsOpen,
      archivesOpen,
      browserOpen,
      bubbleMenu,
      closeStatus,
      commandMenuOpen,
      confirmDelete,
      drawerOpen,
      fileToDelete,
      filesOpen,
      handoff,
      imageViewer,
      moreOpen,
      instructionsPageEditing,
      instructionsPageOpen,
      workspaceFrom,
      instructionBack,
      modelPickerFrom,
      setupFrom,
      devicesFrom,
      providerFrom,
      workspacePicker,
      jobSessions,
      jobsEditor,
      jobsOpen,
      jobToDelete,
      modelOpen,
      modelPicker,
      siphonOpen,
      siphonPicker,
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
      statsOpen,
      closeStats,
      approvalsOpen,
      closeApprovals,
      systemFilesOpen,
      closeSystemFiles,
      subagentAction,
      subagentMenuOpen,
      leaveSubAgent,
      tagContextEditor,
      defaultCapEditor,
      tagEditor,
      tagEditorDirty,
      tagEditorDiscard,
      tagToDelete,
      textViewer,
      threadMenu,
      threadToRename,
      folderMenu,
      folderToDelete,
      threadToFile,
      workspaceFilterOpen,
      closeWorkspaceFilter,
      videoViewer,
      fileViewer,
      closeViewers,
      layout.pinnedDrawer,
    ],
  );

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

  // Only where there are columns to take the window from, and only while the browser is the page
  // shown (settings come before it in the page chain).
  const browserFullNow = browserFull && browserOpen && !settingsOpen && layout.pinnedDrawer;
  // Leaves the settings stack in one press, wherever in it (the cross of every settings page). The
  // per-page state the back key clears level by level is cleared here at once; a tag editor with
  // changes still asks first, as its own back does.
  const closeSettings = useCallback(() => {
    if (settingsPage === 'tag-editor' && tagEditorDirty) {
      setTagEditorDiscard(true);
      return;
    }
    agentsFileStore.close();
    instructionsStore.closeLayer();
    instructionsStore.closeEditor();
    setLayerTarget(null);
    setScopeEditor(null);
    setModelEdit(null);
    setProviderEdit(null);
    setTagEditor(null);
    setAgentModelFor(null);
    setModelPickerFrom(null);
    setSkillsNotice(null);
    setSettingsOpen(false);
  }, [settingsPage, tagEditorDirty]);
  const closeJobs = useCallback(() => {
    setJobsEditor(null);
    setJobSessions(null);
    jobSessionsRef.current = null;
    setJobRuns(null);
    setJobsOpen(false);
  }, []);
  // Shift+Escape: every page and menu, back to the conversation (a sub-agent's included, which is a
  // conversation too). The gate of a first run is not a page and stays.
  const closeEverything = useCallback(() => {
    overlayStore.close();
    setMoreOpen(false);
    setCommandMenuOpen(false);
    setModelOpen(false);
    setSiphonOpen(false);
    setTuneOpen(false);
    if (settingsOpen) closeSettings();
    if (jobsOpen) closeJobs();
    setArchivesOpen(false);
    setBrowserOpen(false);
    setBrowserFull(false);
    setFilesOpen(false);
    if (systemFilesOpen) closeSystemFiles();
    if (statsOpen) closeStats();
    if (approvalsOpen) closeApprovals();
    if (statusOpen) closeStatus();
    setAgentsOpen(false);
    setAgentsGlobalOpen(false);
    if (!layout.pinnedDrawer) setDrawerOpen(false);
  }, [settingsOpen, jobsOpen, systemFilesOpen, statsOpen, approvalsOpen, statusOpen, closeSettings, closeJobs, closeSystemFiles, closeStats, closeApprovals, closeStatus, layout.pinnedDrawer]);
  // The cross of a settings page (the index has none: its Back is that already); the jobs layers
  // get their own below, which they sit inside. Not during the first run: the setup is the app.
  const settingsClose = useMemo(
    () => (settingsOpen && !setupGate ? { close: closeSettings, label: 'Close settings' } : null),
    [settingsOpen, setupGate, closeSettings],
  );
  const jobsClose = useMemo(() => ({ close: closeJobs, label: 'Leave jobs' }), [closeJobs]);

  /**
   * Something other than the conversation is showing: a page in the column, or one that took the
   * window (jobs, the agent rosters). One list, because a phone decides the same question -- is
   * the conversation on screen? -- for both kinds.
   */
  const pageOpen =
    pairingOpen ||
    right.page !== 'none' ||
    right.window !== null;
  // The pairing screen is a page too: on a first launch there is no conversation, and the list
  // would cover it.
  const homeList = !layout.pinnedDrawer && !layout.sidePane && !pageOpen && !pairingOpen && activeThread === null;
  const openSessions = (): void => {
    // The conversation list is the palette: it searches, and on a desktop it is already there
    // (unfolded, if the owner had folded it away). On the home screen it is the screen: opening
    // the slide-over on top of it gave the focus to a search field nobody could see.
    if (layout.pinnedDrawer) panes.setDrawerCollapsed(false);
    else if (!homeList) setDrawerOpen(true);
    setSearchFocus(count => count + 1);
  };
  const SHORTCUT_ACTIONS: Record<ShortcutId, () => void> = {
    new: () => newThread(),
    sessions: openSessions,
    compose: () => {
      closeEverything();
      // After the pages are gone: the composer of the conversation is the one on screen then.
      requestAnimationFrame(() => focusField('Message to send'));
    },
    model: () => openModel(),
    attachments: () => {
      const thread = activeThreadRef.current;
      if (thread) openFilesFor(thread);
    },
    files: () => {
      fsStore.open();
      setSystemFilesOpen(true);
    },
    browser: () => {
      setBrowserError(null);
      setBrowserOpen(true);
    },
    jobs: () => openJobs(),
    commands: () => setCommandMenuOpen(true),
    settings: () => openSettings(),
    sidebar: () => {
      if (layout.pinnedDrawer) panes.toggleDrawer();
    },
    closeAll: () => closeEverything(),
    help: () => openShortcuts(),
  };
  const openShortcuts = (): void => {
    overlayStore.open({
      kind: 'sheet',
      preview: `Keyboard shortcuts\n${MOVING_AROUND}`,
      options: SHORTCUTS.map(entry => ({
        key: entry.id,
        label: entry.label,
        hint: entry.hint || undefined,
        shortcut: entry.combos.slice(0, entry.id === 'compose' || entry.id === 'help' ? 1 : 2).map(comboLabel).join('  '),
        onPress: () => SHORTCUT_ACTIONS[entry.id](),
      })),
    });
  };
  const hotkeys: Record<string, () => void> = {
    escape: () => {
      // A field lets go of the keyboard first: the next press goes back.
      if (leaveField()) return;
      // Out of full screen first: the page stays open, back in its pane. A window shown large goes
      // back to the wall before that.
      if (browserFullNow) {
        if (!closeShownWindow()) setBrowserFull(false);
      } else handleBack();
    },
  };
  for (const entry of SHORTCUTS) {
    for (const combo of entry.combos) {
      hotkeys[combo] = () => {
        // The first run's setup is the whole app until it is finished: nothing opens beside it.
        if (setupGate && entry.id !== 'help') return;
        // An open menu has the keyboard: a shortcut does not open a page under it.
        if (menuOpen() && entry.id !== 'closeAll') return;
        SHORTCUT_ACTIONS[entry.id]();
      };
    }
  }
  useHotkeys(hotkeys);
  useKeyNav();

  // The roster of the conversation in play: while inside a sub-agent that is still the parent's,
  // because that is the scope the server answered for.
  const rosterThread = subagentView?.parentThreadId ?? activeThread;
  // Who called the sub-agent on screen, for the hand-back sheet. Pulled when that menu opens, so
  // it is idle for every conversation that never opens it.
  const handoffCallers = useSubAgentCallers(subagentView?.threadId ?? null);
  const roster = useSubAgents(rosterThread);
  // What the cards on screen can open: this thread's own sub-agents, then its parent's.
  const ownRoster = useSubAgents(activeThread);
  const cardAgents = useMemo(() => reachableFrom(ownRoster.agents, roster.agents), [ownRoster.agents, roster.agents]);
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
  const subagentDoors = useMemo(() => spawnDoorsOf(spawnCards, cardAgents), [spawnCards, cardAgents]);
  const spawnLive = useMemo(() => spawnLiveOf(spawnCards), [spawnCards]);

  const openSubAgentFromCard = useCallback(
    (toolItemId: string) => {
      const card = spawnCards.find(entry => entry.id === toolItemId);
      const claimed = card && typeof card.args.name === 'string' ? card.args.name : '';
      const agent =
        (card?.subagentId ? cardAgents.find(entry => entry.id === card.subagentId) : undefined) ??
        cardAgents.find(entry => entry.displayName === claimed);
      if (!agent || !activeThread) {
        // Not in a roster yet (a task started a moment ago): ask again, the next tap opens it.
        if (activeThread) connection.send(encodeSubAgentsList(activeThread)).catch(() => {});
        return;
      }
      openSubAgent(agent, activeThread);
    },
    [spawnCards, cardAgents, activeThread, openSubAgent],
  );

  // A fresh install: the server answered and has no model that runs. The assistant takes the whole
  // app, once per launch, until it is finished or skipped; a skip is kept on this device. A second
  // device of a configured server never sees it: its server has a model.
  const setupShown = useRef(false);
  // Decided on the launch's first answer only: a model lost mid-session (a sign-out, a key removed)
  // must not pull the owner off the page they are on.
  useEffect(() => {
    if (setupShown.current || !catalogAnswered(catalog)) return;
    setupShown.current = true;
    if (modelReady(catalog.defaultModel, catalog.unavailable)) return;
    if (prefs.get().setupSkipped.includes('model')) return;
    setSettingsPage('setup');
    setSetupGate(true);
  }, [catalog]);
  const leaveSetup = useCallback((skip: boolean) => {
    if (skip && !prefs.get().setupSkipped.includes('model')) toggleSkip('model');
    setSetupGate(false);
    setSettingsOpen(false);
    setSettingsPage('index');
  }, []);

  /**
   * Sends into a named conversation. Explicit rather than always the active one, because handing a
   * sub-agent's answer to its parent posts into the parent while the sub-agent is still on screen.
   */
  const sendChatTo = useCallback(
    async (threadId: string, text: string, attachments?: OutgoingAttachment[], location?: LocationInput, again?: string) => {
      // No model that runs: a send would fail on an empty provider or a missing key. The setup
      // assistant opens on its model step instead of posting into a conversation nobody answers.
      // On the server's answer only: a catalogue not received yet is not "no model".
      if (sendNeedsModel(catalogAnswered(catalog), catalog.defaultModel, catalog.unavailable)) {
        setSettingsPage('setup');
        setSettingsOpen(true);
        return;
      }
      // `again` is a message sent before that never got its receipt: same id, so the server takes
      // it once whatever happened to the first try, and the bubble already on screen is the one.
      const sendingOrigin = httpOrigin(prefs.get().serverUrl);
      const id = again ?? uuid();
      if (!again) {
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
        if (!isSubAgentThread(threadId)) sessionStore.touch(threadId, text || (isVoiceNote ? '(voice message)' : location ? '(location)' : '(attachment)'));
      }
      // Armed before the send, never after: a fast receipt would otherwise land on a bubble not yet
      // waiting and the wait would run out on a message that did arrive. Only on a link that calls
      // itself open: a send parked in the outbox is delivered when the link comes back, minutes
      // later maybe, and is not undelivered for that. A server without receipts is not waited for.
      if (chatStore.serverReceipts() && (await connection.getState()) === 'connected') {
        chatStore.expectReceipt(threadId, id, RECEIPT_TIMEOUT_MS);
      }
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
      // Neither sent nor queued by the device: the app holds it now and retries it itself, so the
      // bubble waits instead of claiming the message is lost.
      if (!delivered) chatStore.markUndelivered(threadId, id);
      else if (Platform.OS === 'ios') {
        for (const attachment of attachments ?? []) {
          if (attachment.uri) deviceBridge.acknowledgeVoiceDraft(attachment.uri, sendingOrigin).catch(() => {});
        }
      }
    },
    [catalog],
  );

  const sendChat = useCallback(
    async (text: string, attachments?: OutgoingAttachment[], location?: LocationInput) => {
      const threadId = activeThreadRef.current ?? uuid();
      // A `/stop` typed and sent as a message (the arrow, or a word after the command) rather
      // than picked from the slash-menu above: while a stop is already in flight the request is
      // consumed -- nothing sent, and no bubble drawn for it. The server answers nothing to a
      // second request while the abort of the cycle travels, so a bubble left behind would have
      // nothing at all to resolve it.
      if (!attachments?.length && !location && isStopCommand(text) && !chatStore.claimStop(threadId)) {
        return;
      }
      if (!activeThreadRef.current) selectThread(threadId);
      return sendChatTo(threadId, text, attachments, location);
    },
    [selectThread, sendChatTo],
  );

  /** The bubble's own copy is what goes again: the uploads it names are already on the server. */
  const resendChat = useCallback(
    (item: TextItem) => {
      const threadId = activeThreadRef.current;
      if (!threadId || item.role !== 'user') return;
      sendChatTo(
        threadId,
        item.text,
        item.attachments.map(attachment => ({
          id: attachment.id,
          type: attachment.type,
          uri: attachment.uri,
          filename: attachment.filename,
          ...(attachment.audioAsVoice ? { audioAsVoice: true } : {}),
          ...(attachment.durationMs === undefined ? {} : { durationMs: attachment.durationMs }),
        })),
        item.location,
        item.id,
      ).catch(() => {});
    },
    [sendChatTo],
  );

  const waitingKey = useWaitingSendsKey(activeThread);

  /**
   * The sends the server never got, retried by the app itself.
   *
   * A socket that dies under a NAT timeout or a VPN switch stays OPEN for the browser, so a message
   * leaves and nothing comes back. The bubble holds what the owner typed, and the same id goes out
   * again -- the server takes a repeated id once, so a first try that did arrive is not answered
   * twice. The attempt chain lives as long as there is something waiting: it starts when the send
   * fails, keeps going while the set of waiting sends is the same, and dies with the last receipt.
   * The delay opens up with the wait, and never stops, because the receipt is the only proof
   * (2026-09-16).
   */
  useEffect(() => {
    if (!activeThread || waitingKey === '') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (stopped) return;
      const now = Date.now();
      const waiting = sendsToRetry(chatStore.getItems(activeThread));
      if (waiting.length === 0) return;
      for (const item of waiting) resendChat(item);
      const waited = now - Math.min(...waiting.map(item => item.queuedSince ?? now));
      timer = setTimeout(tick, retryDelayAfter(waited));
    };
    timer = setTimeout(tick, retryDelayAfter(0));
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [waitingKey, activeThread, resendChat]);


  useEffect(() => subscribeAPNs(), []);

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

  /**
   * The owner allowing notifications, from the tap that is the only thing a browser accepts as
   * consent. The subscription that follows travels to the server through the effect above, so
   * this is the whole of it: ask, and let the registration path do its job.
   */
  const allowNotifications = useCallback(async () => {
    if (Platform.OS === 'ios') { await enableAPNs(); return; }
    const key = vapidRef.current;
    if (!key) return;
    resetPushRegistration();
    await registerForPush(key);
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
    setVisiblePushThread(AppState.currentState === 'active' ? activeThreadRef.current : null);
    report(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => { setVisiblePushThread(state === 'active' ? activeThreadRef.current : null); report(state === 'active'); });
    return () => subscription.remove();
  }, [activeThread]);

  /**
   * The channel names the server publishes on follow the sounds picked in Settings, and only the
   * device knows them: the name is derived natively at boot, without JS, because a channel is
   * frozen at creation and a change of sound is a change of channel. Sent on every connection,
   * like the state above -- a name that changed while the socket was down is otherwise missing
   * server-side until the next sound change.
   */
  const sendNotificationChannels = useCallback(
    (channels: { ordinary: string; ring: string }) => {
      connection.send(encodeNotificationsChannels(deviceInfo?.deviceId ?? '', channels)).catch(() => {});
    },
    [deviceInfo],
  );

  useEffect(() => {
    if (!pushSupported || status.state !== 'connected' || !deviceInfo) return;
    let cancelled = false;
    deviceBridge
      .getNotificationSounds()
      .then(sounds => {
        if (!cancelled && sounds) sendNotificationChannels(sounds.channels);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status.state, deviceInfo, sendNotificationChannels]);

  // A notification tap opens the thread or the jobs page it came from. The cold start (the app
  // was killed and the tap launched it) is the initial URL; a live app gets the event.
  useEffect(() => {
    const handle = (link: string | null) => {
      const target = parseNotificationLink(link);
      if (!target) return;
      // Another server's notification: the app restarts on that server, where the link is opened.
      if (multiServerSupported && target.server && target.server !== serversStore.get().active) {
        if (!serversStore.get().list.some(profile => profile.id === target.server)) return;
        deviceBridge.prefsSet('pendingLink', link).catch(() => {});
        serversStore.switchTo(target.server).catch(() => {});
        return;
      }
      switch (target.kind) {
        case 'thread':
          openThread(target.threadId);
          return;
        case 'job': {
          // The job's own runs when the app knows it, the jobs page otherwise.
          const job = jobsStore.getSnapshot().jobs.find(entry => entry.id === target.jobId);
          openJobs();
          if (job) openJobSessions(job);
          return;
        }
        default: {
          const unhandled: never = target;
          return unhandled;
        }
      }
    };
    const unsubscribeNative = subscribeNotificationOpen(handle);
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    // A link that switched servers is opened once the app is back on the right one.
    if (multiServerSupported) {
      serversStore
        .whenHydrated()
        .then(() => deviceBridge.prefsGetAll())
        .then(stored => {
          if (!stored.pendingLink) return;
          deviceBridge.prefsSet('pendingLink', null).catch(() => {});
          handle(stored.pendingLink);
        })
        .catch(() => {});
    }
    const subscription = Linking.addEventListener('url', event => handle(event.url));
    return () => { subscription.remove(); unsubscribeNative(); };
  }, [openThread, openJobs, openJobSessions]);

  // Asked for when the screen opens rather than at boot: it is the only place that shows it,
  // and a stale answer from an hour ago would render a switch that no longer matches the server.
  useEffect(() => {
    if (!settingsOpen) return;
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
    if (!settingsOpen || (settingsPage !== 'models' && settingsPage !== 'provider')) return;
    connection.send(encodeModelList()).catch(() => {});
    // The subscriptions section reads where each sign-in stands.
    if (settingsPage === 'models') connection.send(encodeAccounts({ type: 'accounts.get' })).catch(() => {});
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

  /** Commits the staged APK for `version`; the file is the authority, not the phase. */
  const installAppUpdate = useCallback(async (version: string) => {
    setAppUpdatePhase({ kind: 'installing', version });
    // The file is the authority, not the phase: a staged APK the system reclaimed used to leave
    // Install on screen forever, and every tap flashed back to the same button.
    const disk = await appUpdateRuntime.staged().catch(() => ({ staged: false, size: 0, version: '' }));
    if (!disk.staged) {
      setAppUpdatePhase(prev =>
        reduceAppUpdate(prev, { type: 'failed', message: 'the downloaded file is gone, download it again', staged: false }),
      );
      return;
    }
    // No permission pre-check: canRequestPackageInstalls() is cached per process, so right after
    // the owner grants it and comes back it still reads false, and refusing here blocks an install
    // the system would accept. Android shows its own dialog when the permission is missing; only a
    // SecurityException coming back means it was really refused.
    try {
      await appUpdateRuntime.install();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'install failed';
      // The file is the authority, not the flow's hope. This used to pass `staged: true` ("the APK
      // is still on disk"), while the native refusal path deletes a staged APK it will not install
      // (not newer, unsigned) and a rejected install leaves nothing: the dialog then offered
      // Install for a file that was gone (owner, 2026-09-15).
      const afterFailure = await appUpdateRuntime.staged().catch(() => ({ staged: false, size: 0, version: '' }));
      reportUpdateFailure('install', message);
      setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'failed', message, staged: afterFailure.staged }));
      if (/security|permission|unknown/i.test(message)) appUpdateRuntime.openInstallSettings();
    }
  }, []);

  /**
   * Downloads the APK for `version`, then installs when asked. Shared by the tap, the auto path
   * and the restart; `thenInstall` is the one-tap flow (download, then the system confirmation).
   */
  const downloadAppUpdate = useCallback(
    async (version: string, apkSize: number, thenInstall: boolean) => {
      const attempt = appUpdateAttemptRef.current + 1;
      appUpdateAttemptRef.current = attempt;
      setAppUpdatePhase({ kind: 'downloading', version, apkSize, progress: 0 });
      try {
        await appUpdateRuntime.download(mediaBase, deviceInfo, `app-update-${version}`, version, apkSize);
        if (appUpdateAttemptRef.current !== attempt) return;
        if (thenInstall) {
          await installAppUpdate(version);
          return;
        }
        setAppUpdatePhase({ kind: 'ready', version });
      } catch (err) {
        if (appUpdateAttemptRef.current !== attempt) return;
        const message = err instanceof Error ? err.message : 'download failed';
        // A download that failed left nothing usable behind: drop it, so the next tap downloads
        // instead of offering an install for a file that is not there.
        await appUpdateRuntime.clearStaged().catch(() => {});
        reportUpdateFailure('download', message);
        setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'failed', message, staged: false }));
      }
    },
    [mediaBase, deviceInfo, installAppUpdate],
  );

  /** The stuck-download escape: abandon the transfer, drop the partial file, start over. */
  const restartAppUpdate = useCallback(() => {
    const state = appUpdatePhaseRef.current;
    if (state.kind !== 'downloading') return;
    const { version, apkSize } = state;
    // Bumped before anything else: the abandoned attempt's late answer must find a different token.
    appUpdateAttemptRef.current += 1;
    (async () => {
      await appUpdateRuntime.cancelDownload().catch(() => {});
      await appUpdateRuntime.clearStaged().catch(() => {});
      await downloadAppUpdate(version, apkSize, true);
    })().catch(() => {});
  }, [downloadAppUpdate]);

  const runAppUpdate = useCallback(() => {
    if (!appUpdateSupported) return;
    // A stale closure must never re-download what the auto-download already staged: read the
    // ref, and ignore taps that land while a transfer or an install is already in flight.
    const state = appUpdatePhaseRef.current;
    if (state.kind === 'downloading' || state.kind === 'installing') return;
    const wanted = state.kind === 'ready' ? state.version : state.kind === 'error' ? state.staged : undefined;
    if (wanted) {
      installAppUpdate(wanted).catch(() => {});
      return;
    }
    if (state.kind === 'available') {
      // One tap, whole update: the download runs into the system confirmation (owner, 2026-10-15).
      downloadAppUpdate(state.version, state.apkSize, true).catch(() => {});
      return;
    }
    if (state.kind === 'error') {
      // Nothing staged: find out what the server has, then fetch it.
      setAppUpdatePhase({ kind: 'checking' });
      (async () => {
        const result = await appUpdateRuntime.check(mediaBase, deviceInfo);
        const next = reduceAppUpdate({ kind: 'idle' }, { type: 'checked', result, current: appVersion ?? '' });
        if (next.kind === 'available') await downloadAppUpdate(next.version, next.apkSize, true);
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
  }, [mediaBase, deviceInfo, appVersion, downloadAppUpdate, installAppUpdate]);

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
    setUpdatePhase(phase => reduceUpdate(phase, { type: 'socket', connected: status.state === 'connected', now: Date.now() }));
  }, [status.state]);

  // App self-update: check at launch, then every hour, auto-download on wifi (or on mobile
  // data when the owner allows it), and follow the install status the system reports.
  //
  // The check is a plain fetch on the server relay; it does not need the chat socket. Gating it
  // on `connected` made every cold start wait for the WS handshake on top of the bridge answers
  // (identity + version), which is a few seconds the update modal had no reason to add. The
  // connection is only a guard against checking with no server at all, and the WS state settles
  // within a second of the fetch being possible. A failed fetch retries with backoff.
  useEffect(() => {
    if (!appUpdateSupported) return;
    if (status.state === 'idle') return;
    if (appVersion === null || appVersion === '') return;
    let cancelled = false;
    let transferId: string | null = null;
    let retryDelay = 5_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

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
      const attempt = appUpdateAttemptRef.current + 1;
      appUpdateAttemptRef.current = attempt;
      setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'downloadStarted', version, apkSize }));
      try {
        await appUpdateRuntime.download(mediaBase, deviceInfo, transferId, version, apkSize);
        if (cancelled || appUpdateAttemptRef.current !== attempt) return;
        setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'downloadDone', version }));
      } catch (err) {
        // A restart abandoned this attempt: its failure must not clear the new download's file.
        if (cancelled || appUpdateAttemptRef.current !== attempt) return;
        await appUpdateRuntime.clearStaged().catch(() => {});
        reportUpdateFailure('download', err instanceof Error ? err.message : 'download failed');
        setAppUpdatePhase(prev => reduceAppUpdate(prev, {
          type: 'failed',
          message: err instanceof Error ? err.message : 'download failed',
          staged: false,
        }));
      } finally {
        transferId = null;
      }
    };

    const scheduleRetry = () => {
      if (cancelled) return;
      retryDelay = Math.min(retryDelay * 2, 60_000);
      retryTimer = setTimeout(() => check(), retryDelay);
    };

    const check = async () => {
      const result = await appUpdateRuntime.check(mediaBase, deviceInfo);
      if (cancelled) return;
      // A check that cannot reach the relay is not worth an error card at every boot: retry
      // quietly with backoff, and only surface something once the relay answered. The manual
      // button path still reports a real failure the reducer turns into an error phase.
      if (!result.ok) {
        scheduleRetry();
        return;
      }
      retryDelay = 5_000;
      // An APK downloaded before the app was last closed is still on disk: offer the install
      // rather than spending 45 MB again. Only the file itself can say so.
      const disk = await appUpdateRuntime.staged().catch(() => ({ staged: false, size: 0, version: '' }));
      if (cancelled) return;
      const current = appVersion ?? '';
      if (disk.staged && result.ok && disk.version && disk.version === result.version) {
        // A staged file for the version we already run is a leftover of an install that
        // succeeded while the JS side never heard it (the process was replaced first). Offering
        // it would send the user to install what they already have. Drop it and carry on.
        if (disk.version === current) {
          await appUpdateRuntime.clearStaged().catch(() => {});
        } else {
          setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'stagedFound', version: disk.version }));
          return;
        }
      }
      // Staged, but for a version the server has since replaced: it is dead weight.
      if (disk.staged && result.ok && disk.version && disk.version !== result.version) {
        await appUpdateRuntime.clearStaged().catch(() => {});
      }
      // The reducer refuses to reset an in-flight download/install; mirror that here for the
      // auto-download branch, which runs off its own computed state.
      setAppUpdatePhase(prev => reduceAppUpdate(prev, { type: 'checked', result, current }));
      const afterCheck = appUpdatePhaseRef.current;
      if (afterCheck.kind !== 'ready' && afterCheck.kind !== 'installing' && afterCheck.kind !== 'downloading') {
        // The reducer is the one judge of what a check means here: an error that still has the
        // APK staged becomes `ready` (install, no download); anything else becomes `available`
        // and may auto-download on wifi.
        const after = reduceAppUpdate(afterCheck, { type: 'checked', result, current });
        if (after.kind === 'available') {
          maybeAutoDownload(after.version, after.apkSize);
        }
      }
    };

    check();
    const timer = setInterval(() => check(), 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (retryTimer) clearTimeout(retryTimer);
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


  const changeUiPrefs = useCallback((next: { expandTools?: boolean; expandReasoning?: boolean }) => {
    // No optimistic write either: the server broadcasts the stored state to every window, and
    // this one rewrites itself from that (frameRouter.setUiPrefs).
    connection.send(encodeUiPrefsSet(next)).catch(() => {});
  }, []);

  // Diagnostics is a page under Advanced, not a screen of its own: reached from settings, the
  // back key has to land back on Advanced instead of dropping the user two levels down.
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

  /** The same root rule for Siphon's picker: its own stack, opened from the conversation menu. */
  const openSiphon = useCallback(() => {
    setSiphonPicker(pickerStart);
    setSiphonOpen(true);
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
    if (Platform.OS === 'ios') setDeviceInfo(null);
    setUrl(next);
    prefs.set('serverUrl', next);
    if (Platform.OS === 'ios') getDeviceInfo().then(nextIdentity => {
      if (prefs.get().serverUrl === next) setDeviceInfo(nextIdentity);
    }).catch(() => { if (prefs.get().serverUrl === next) setDeviceInfo(null); });
  }, []);

  changeUrlRef.current = changeUrl;

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

  // Declared here rather than beside the header that shows them: the menu entries below name the
  // current model in their hints, and a const cannot be read above its declaration.
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

  /**
   * What a copied transcript is titled. A sub-agent is named by its id rather than by a title: it
   * has none, and the id is what the roster and the header already show.
   */
  const transcriptTitleOf = useCallback(
    (threadId: string): string =>
      subagentRef.current?.threadId === threadId
        ? subagentRef.current.id.replace(/^subagent\//, '')
        : runTitlesRef.current[threadId] ?? sessionStore.titleOf(threadId) ?? 'conversation',
    [],
  );

  /**
   * One definition per session-level action, composed by each menu in its own order.
   *
   * A sub-agent is a real session, and the server resolves its handle to that session for every
   * one of these: the model pin, the stop, the status command and the instructions report all go
   * through `resolveSessionId`. They were simply never offered inside a sub-agent, so reading a
   * busy agent's context or changing its model meant leaving the chat.
   *
   * Written once rather than per menu because two hand-kept lists of the same actions drift. That
   * is the failure `enterThread` exists for, on the way in; this is the same rule for the way out.
   * A record and not an array: the two menus order them differently, and neither has to inherit
   * the other's order to share the definitions.
   *
   * `threadId` is nullable for the command menu alone, which the keyboard opens on the home screen
   * where no conversation is picked yet. Only the two pickers are composed there, and they act on
   * the sheets, which read the conversation on screen themselves. Everything else is composed from
   * a menu that has a target, and says so rather than acting on the wrong one.
   */
  const sessionEntries = useCallback(
    (threadId: string | null, close: () => void): Record<SessionEntryKey, SheetEntry> => ({
      refresh: {
        label: 'Refresh',
        icon: <RefreshIcon size={15} tone="muted" />,
        hint: 'resync this conversation with the server',
        onPress: () => {
          if (threadId) refreshThread(threadId);
          close();
        },
      },
      model: {
        label: 'Model…',
        icon: <SlidersIcon size={15} tone="muted" />,
        shortcut: shortcutHint('model'),
        hint: currentModelLabel
          ? `current: ${currentModelLabel}${currentModelOrigin ? ` · ${currentModelOrigin}` : ''}`
          : undefined,
        onPress: () => {
          close();
          openModel();
        },
      },
      tune: {
        label: 'Effort / window…',
        icon: <SlidersIcon size={15} tone="muted" />,
        hint: currentModelLabel ? `tune ${currentModelLabel}` : undefined,
        onPress: () => {
          close();
          setTuneOpen(true);
        },
      },
      instructions: {
        label: 'Instructions',
        icon: <DocIcon size={15} tone="muted" />,
        hint: 'every layer it loads, nested files included',
        onPress: () => {
          close();
          if (threadId) openSessionInstructions(threadId);
        },
      },
      files: {
        label: 'Session files',
        icon: <FilesIcon size={15} tone="muted" />,
        shortcut: shortcutHint('attachments'),
        onPress: () => {
          close();
          if (threadId) openFilesFor(threadId);
        },
      },
      systemFiles: {
        // Distinct from "Session files", which is this conversation's own attachments: this one is
        // the machine, and it starts where the session works -- docs/files-page.md.
        label: 'System files',
        icon: <FolderIcon size={15} tone="muted" />,
        hint: 'the machine this runs on',
        shortcut: shortcutHint('files'),
        onPress: () => {
          close();
          if (threadId) fsStore.openFromSession(threadId);
          setSystemFilesOpen(true);
        },
      },
      status: {
        label: 'Status',
        icon: <InfoIcon size={15} tone="muted" />,
        hint: 'context, tokens, cost',
        onPress: () => {
          close();
          if (threadId) openStatus(threadId);
        },
      },
      transcript: {
        label: 'Copy transcript',
        icon: <CopyIcon size={15} tone="muted" />,
        hint: 'messages and tool results, as markdown',
        onPress: () => {
          if (threadId) {
            Clipboard.setString(formatTranscript(transcriptTitleOf(threadId), chatStore.getItems(threadId)));
          }
          close();
        },
      },
    }),
    [refreshThread, currentModelLabel, currentModelOrigin, openModel, openSessionInstructions, openFilesFor, openStatus, transcriptTitleOf],
  );

  const refreshAction = useCallback(
    (target: SessionSummary, close: () => void): SheetEntry => sessionEntries(target.threadId, close).refresh,
    [sessionEntries],
  );

  /** What Siphon's row says: the pinned model by name, or that nothing is pinned. */
  const siphonHint = useCallback(
    (pin: string | undefined): string => {
      if (!pin) return 'off · each run picks its own model';
      const bare = withoutEndpoint(pin);
      return `on · ${catalog.models.find(model => model.id === bare)?.label ?? bare}, every agent`;
    },
    [catalog.models],
  );

  const conversationActions = useCallback(
    (
      target: SessionSummary,
      retry: QuotaRetryState | undefined,
      siphon: string | undefined,
      close: () => void,
    ): SheetEntry[] => {
      const shared = sessionEntries(target.threadId, close);
      return [
      // What the conversation reads comes before what it produced: the instructions decide every
      // answer in it, the files are one of their outputs.
      shared.instructions,
      shared.files,
                shared.systemFiles,
      {
        label: 'Change workspace',
        icon: <MoveToFolderIcon size={15} tone="muted" />,
        hint: `current: ${workspaceOf(target.threadId)}`,
        onPress: () => {
          setWorkspacePicker({ threadId: target.threadId });
          connection.send(encodeWorkspacesList()).catch(() => {});
          close();
        },
      },
      { type: 'separator' },
      {
        label: 'Retry when the quota returns',
        icon: <WaitResetIcon size={15} tone="muted" />,
        hint: retry?.waiting
          ? `waiting · retry at ${formatReset(retry.waiting.at)}`
          : (retry?.enabled ?? target.quotaRetry === true)
            ? 'on · waits for the provider reset'
            : 'off',
        selected: retry?.enabled ?? target.quotaRetry === true,
        onPress: () => {
          const enabled = retry?.enabled ?? target.quotaRetry === true;
          connection.send(encodeSessionQuotaRetrySet(target.threadId, !enabled)).catch(() => {});
          close();
        },
      },
      {
        // Siphon: the model is not picked here, the sheet is -- and it opens on this
        // conversation's root, which is the only session that carries the pin.
        label: 'Siphon',
        icon: <SiphonIcon size={15} tone="muted" />,
        hint: siphonHint(siphon),
        selected: siphon !== undefined,
        onPress: () => {
          if (target.threadId !== activeThreadRef.current) openThread(target.threadId);
          openSiphon();
          close();
        },
      },
      { type: 'separator' },
      {
        label: 'Move to folder…',
        icon: <MoveToFolderIcon size={15} tone="muted" />,
        hint: folderOf(target) ?? 'not in a folder',
        onPress: () => {
          setThreadToFile(target);
          close();
        },
      },
      {
        label: 'Rename…',
        icon: <PencilIcon size={15} tone="muted" />,
        onPress: () => {
          // The rename sheet needs the current name to start from, so it is handed the thread
          // as a value: closing the menu first would drop the one it was opened for.
          setThreadToRename(target);
          close();
        },
      },
      shared.status,
      shared.transcript,
      target.archived
        ? {
            label: 'Unarchive',
            icon: <RefreshIcon size={15} tone="muted" />,
            hint: 'put it back in the list',
            onPress: () => {
              setThreadArchived(target.threadId, false);
              close();
            },
          }
        : {
            label: 'Archive',
            icon: <FilesIcon size={15} tone="muted" />,
            hint: 'file it away, nothing is deleted',
            onPress: () => {
              setThreadArchived(target.threadId, true);
              close();
            },
          },
      // A destructive action goes last, alone, behind its own rule: thirteen entries in four
      // groups put Delete one slip below Archive, and both are one tap.
      { type: 'separator' },
      {
        label: 'Delete',
        icon: <TrashIcon size={15} tone="danger" />,
        danger: true,
        onPress: () => {
          // Always through the confirmation: the drawer used to delete on the first tap.
          setConfirmDelete(target.threadId);
          close();
        },
      },
      ];
    },
    [folderOf, openSiphon, openThread, sessionEntries, setThreadArchived, siphonHint, workspaceOf],
  );

  const threadActions: SheetEntry[] = threadMenu
    ? [
        refreshAction(threadMenu, () => setThreadMenu(null)),
        ...conversationActions(threadMenu, threadMenuQuotaRetry, threadMenuModel?.siphon, () => setThreadMenu(null)),
      ]
    : [];

  /** Every workspace the listing has conversations in: what the filter picker offers. */
  const workspaceChoices = useMemo(() => workspaceOptions(sessions), [sessions]);

  /**
   * The filter sheet: what is in use now, and the way back to all of it.
   *
   * Built from the listing, so a workspace the owner declared and never used is not offered --
   * there is nothing to filter, and a picker that lists those is a picker of settings. The count
   * is what tells him which one is worth narrowing to before he narrows to it.
   */
  const workspaceFilterOptions: SheetEntry[] = useMemo(() => {
    const needle = workspaceQuery.trim().toLowerCase();
    return [
      {
        key: 'all',
        label: 'All workspaces',
        icon: <FolderIcon size={15} tone="muted" />,
        selected: workspaceFilter === null,
        onPress: () => {
          setWorkspaceFilter(null);
          setWorkspaceFilterOpen(false);
        },
      },
      ...workspaceChoices
        .filter(option => !needle || option.key.toLowerCase().includes(needle))
        .map((option): SheetEntry => ({
          key: option.key,
          label: option.key,
          hint: `${option.count} conversation${option.count === 1 ? '' : 's'}`,
          selected: workspaceFilter === option.key,
          onPress: () => {
            setWorkspaceFilter(option.key);
            setWorkspaceFilterOpen(false);
          },
        })),
    ];
  }, [workspaceChoices, workspaceFilter, workspaceQuery]);

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
          icon: <GearIcon size={15} tone="muted" />,
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
          // One stop per cycle, typed command included: while an abort is in flight the command
          // is consumed without sending anything -- no frame, and no bubble, since it never
          // becomes a message.
          if (threadId && chatStore.claimStop(threadId)) connection.send(encodeChatStop(threadId));
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
    ...(activeSummary ? [refreshAction(activeSummary, () => setCommandMenuOpen(false))] : []),
    ...(() => {
      const shared = sessionEntries(activeThread, () => setCommandMenuOpen(false));
      // The model picker is a control of the title bar wherever the bar has room for it, and the
      // entry leaves this menu on exactly that condition (owner, 2026-11-04: "on le vire de la
      // liste du menu … quand il est affiché"). One predicate, `app/headerControls.ts`: two would let
      // the picker live in both places on one window and in neither on the next.
      //
      // Stop is gone from here (owner, 2026-11-04: "vire l'action stop du menu de session … on a
      // déjà le bouton stop en bas"). The composer's corner is where a run is interrupted, and it
      // is on screen exactly when the action applies; repeating it one tap deeper, in a menu that
      // covers the very button it duplicates, was a second door onto one action. The drawer's own
      // conversation menu never had it either.
      return [...(showsModelButton(layout.width) ? [] : [shared.model]), shared.tune];
    })(),
    // The roster, where the title bar dropped its badge. Same rule as the model picker one line up:
    // `showsAgentsButton` admits the counter, and this entry exists on exactly the windows that
    // said no. A phone header cannot afford a 50 pt badge that also costs the model name its tail,
    // and the owner never reached for the counter there anyway (2026-11-05: "c'est useless d'avoir
    // le bouton de la liste des sous-agents tout en haut sur mobile, je l'utilise jamais").
    ...(activeThread && !showsAgentsButton(layout.width) && subagentCount.total > 0
      ? [
          {
            label: 'Sub-agents',
            icon: <AgentIcon size={15} tone="muted" />,
            hint:
              subagentCount.running > 0
                ? `${subagentCount.total} · ${subagentCount.running} running`
                : `${subagentCount.total} in this conversation`,
            onPress: () => {
              setCommandMenuOpen(false);
              setAgentsOpen(true);
            },
          } satisfies SheetEntry,
        ]
      : []),
    // Model and Stop sit here because only the conversation on screen can answer for them: the
    // app knows the live model and the running turn of the one in front of it, not of a thread
    // picked in the drawer. Everything below is the shared conversation list.
    ...(activeSummary
      ? conversationActions(activeSummary, activeQuotaRetry, threadModel?.siphon, () => setCommandMenuOpen(false))
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
  // A healthy link says nothing: it is the normal case, and the space is worth more to the one
  // number that moves on its own. How full the window is decides when the conversation has to be
  // compacted, so it belongs where the owner already looks. Degraded states keep the word.
  const contextShare = contextPercent(threadModel?.context);
  // What runs here, said the way a model is named: provider first, because two providers serve
  // the same id and `opus-5` alone does not say whose. The share closes the line -- it is the one
  // number that moves on its own, and it is what decides when this conversation has to compact.
  const modelProvider = threadModel
    ? catalog.models.find(model => model.id === threadModel.model)?.provider
    : undefined;
  const effortLabel = threadModel?.effort?.level || null;
  const subtitle = [
    offline ? status.state : null,
    threadModel ? (modelProvider ? `${modelProvider} / ${currentModelLabel}` : currentModelLabel) : null,
    effortLabel,
    // "N items" is gone (owner, 2026-11-04: "le x item dans le header de session est useless").
    // The count was a size, not a state: the thread is on screen and scrollable, so it never told
    // anyone anything they could act on, and on a phone it was the last thing pushing the share
    // out of the one line that can afford it.
    pending > 0 ? `${pending} pending` : null,
    // Where the model came from, when this conversation did not choose it. The picker no longer
    // carries it as a hint -- the menu row that held it is gone wherever the title bar has the
    // button -- and without it, picking the global default looks like a no-op with no explanation,
    // which is how the incident hid for two days.
    currentModelOrigin,
  ]
    .filter(Boolean)
    .join(' · ');
  // The share lives in exactly one place. Where the gauge is drawn (560 pt and up) it is already
  // there, three figures wide; repeating it on the facts line put the same number twice in one
  // strip. Below that the gauge is gone and this is the only place left for it -- handed over as
  // its own run so that a long provider id truncates the name and never the figure (2026-11-04).
  const shareLabel =
    contextShare === null || layout.width >= 560 ? undefined : `${contextShare.toFixed(1)}%`;
  const meter =
    threadModel?.context?.used !== undefined && threadModel.context.effective !== undefined && contextShare !== null ? (
      <ContextMeter
        used={threadModel.context.used}
        effective={threadModel.context.effective}
        percent={contextShare}
        // Effort and window, not the model picker: the picker has its own button in this same bar,
        // and the gauge is the reading these two overrides act on. The menu's "Effort / window…"
        // row and this tap are the same sheet from two places, which is the point.
        onPress={() => setTuneOpen(true)}
      />
    ) : undefined;
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
    agentsConfig?.providers.find(provider => provider.key === selectedProvider) ??
    (addedProvider?.key === selectedProvider ? addedProvider : null);
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
  /**
   * The declarations a provider would take with it, by id. Read off both halves of the catalogue,
   * because the server refuses on `llm.models` entries and an unavailable one is still an entry:
   * counting only the runnable half would offer a cascade that removes fewer models than the
   * refusal was about.
   */
  const declaredModelIds = useCallback(
    (key: string): string[] =>
      [...catalog.models, ...(catalog.unavailable ?? [])]
        .filter(model => model.declared === true && (model.provider ?? agentsConfig?.defaultProvider) === key)
        .map(model => model.id),
    [agentsConfig?.defaultProvider, catalog.models, catalog.unavailable],
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
          icon: <FolderIcon size={15} tone="muted" />,
          hint: 'shared tier, visible from every workspace',
        },
        ...workspaces.map(workspace => ({
          target: { source: 'workspace' as const, workspace: workspace.key },
          label: `Workspace · ${workspace.key}`,
          icon: <FolderIcon size={15} tone="muted" />,
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
      if (mode === 'move') closeViewer();
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
        icon: <CopyIcon size={15} tone="muted" />,
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
              icon: <MoveToFolderIcon size={15} tone="muted" />,
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

  const openInstruction = (workspace: string, file: string, back: 'workspace' | 'setup' = 'workspace'): void => {
    setInstructionBack(back);
    if (back === 'setup') setSelectedWorkspace(workspace);
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
  // Each opener clears the others: the number page draws whichever editor is set, and one left over
  // from a page closed with Back would be the one drawn.
  const openTagContextEditor = (name: string): void => {
    setNumberEditor(null);
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
      onBack={() => setSettingsPage(parentOf('agents'))}
      onOpenAgent={key => {
        setSelectedAgent(key);
        setSettingsPage('agent');
      }}
      onNewAgent={() => setSettingsPage('newagent')}
    />
  );
  const modelsPage = (
    <ModelsScreen
      config={agentsConfig}
      providers={agentsConfig?.providers ?? []}
      error={providersEnvState.error}
      onBack={() => setSettingsPage(parentOf('models'))}
      onOpenDefaultModel={() => {
        setAgentPicker(pickerStart);
        setModelPickerFrom(null);
        setAgentModelFor('global');
        setSettingsPage('model-picker');
      }}
      onOpenFallback={() => {
        setAgentPicker(pickerStart);
        setModelPickerFrom(null);
        setAgentModelFor('fallback');
        setSettingsPage('model-picker');
      }}
      // One tap, no confirmation: the switch is its own feedback, and the server answers with the
      // whole snapshot so the row can never disagree with what was stored.
      onSetRetry={enabled => connection.send(encodeAgentsRetrySet(enabled)).catch(() => {})}
      onOpenContextCap={() => openDefaultCapEditor()}
      onOpenTags={() => setSettingsPage('tags')}
      onNewProvider={() => setSettingsPage('provider-add')}
      onOpenAccount={(provider, kind) => {
        setSelectedAccount({ provider, kind });
        setSettingsPage('account');
      }}
      onOpenProvider={key => {
        setSelectedProvider(key);
        setProviderFrom('models');
        setSettingsPage('provider');
      }}
    />
  );
  const tagsPage = (
    <TagsScreen
      tags={tagsState.tags}
      status={tagsState.status}
      error={tagsState.error}
      onBack={() => setSettingsPage(parentOf('tags'))}
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
    setTagContextEditor(null);
    setNumberEditor({ field, agent: selectedAgent });
    setSettingsPage('number');
  };
  const openDefaultCapEditor = (): void => {
    setTagContextEditor(null);
    setNumberEditor({ field: 'defaultcap' });
    setSettingsPage('number');
  };
  const saveDefaultCap = (value: number | null): void => {
    connection.send(encodeAgentsDefaultCapSet(value)).catch(() => {});
    setSettingsPage('models');
    setNumberEditor(null);
  };
  const saveNumber = (value: number | null): void => {
    if (!numberEditor || numberEditor.field === 'defaultcap') return;
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
  /** Sends everything a save does, once the rename it carries (if any) has been agreed to. */
  const commitProviderEdit = (patch: ProviderPatch): void => {
    const from = providerEdit?.key ?? null;
    setProviderBusy(true);
    if (from !== null && from !== patch.key) {
      connection.send(encodeProvidersRename(from, patch.key)).catch(() => {});
    }
    // The key before the declaration: the discovery the declaration starts then finds it.
    if (patch.apiKeyEnv && patch.envValue) {
      connection.send(encodeProvidersEnvSet(patch.apiKeyEnv, patch.envValue)).catch(() => {});
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
    setProviderEdit(null);
    // Added: its page, where the models it lists (or the reason it lists none) appear once the
    // server has asked it. Edited: back to that same page.
    if (providerEdit?.mode === 'create') {
      setAddedProvider({
        key: patch.key,
        type: patch.providerType,
        ...(patch.group ? { group: patch.group } : {}),
        ...(patch.baseUrl ? { baseUrl: patch.baseUrl } : {}),
        discover: patch.discover,
        models: 0,
        ...(patch.discover ? { discovery: { state: 'pending' as const } } : {}),
        ...(patch.apiKeyEnv ? { keyEnv: patch.apiKeyEnv } : {}),
        keyPresent: patch.envValue !== '',
      });
      setProviderFrom('models');
    }
    setSelectedProvider(patch.key);
    setSettingsPage('provider');
  };
  const cancelProviderRename = (): void => {
    if (renameFallback.current) {
      clearTimeout(renameFallback.current);
      renameFallback.current = null;
    }
    renameStaged.current = null;
    providerRenameStore.reset();
    setProviderRename(null);
    setProviderBusy(false);
  };
  const confirmProviderRename = (): void => {
    if (!providerRename) return;
    const { patch } = providerRename;
    if (renameFallback.current) {
      clearTimeout(renameFallback.current);
      renameFallback.current = null;
    }
    renameStaged.current = null;
    providerRenameStore.reset();
    setProviderRename(null);
    commitProviderEdit(patch);
  };
  const saveProviderEdit = (patch: ProviderPatch): void => {
    if (!providerEdit || providerBusy) return;
    const from = providerEdit.key;
    if (from !== null && from !== patch.key) {
      // A key is an address: tags, agent pins, cron jobs, conversations and the sign-in file all
      // carry it. The server answers what a rename would touch (0.7.118+), and the sheet says it
      // before anything is written. A server that never answers falls back to committing after a
      // beat, exactly like before this existed.
      setProviderBusy(true);
      renameStaged.current = { from, to: patch.key };
      providerRenameStore.expect(from, patch.key);
      connection.send(encodeProvidersRenamePreview(from, patch.key)).catch(() => {});
      setProviderRename({ from, to: patch.key, patch, refs: null });
      if (renameFallback.current) clearTimeout(renameFallback.current);
      renameFallback.current = setTimeout(() => {
        const staged = renameStaged.current;
        if (!staged || staged.from !== from || staged.to !== patch.key) return;
        const answered = providerRenameStore.getSnapshot().refs;
        if (answered && answered.from === from && answered.to === patch.key) return;
        cancelProviderRename();
        commitProviderEdit(patch);
      }, 2500);
      return;
    }
    commitProviderEdit(patch);
  };
  // The preview's answer, once it lands: it can only fill the sheet for the rename still staged.
  useEffect(() => {
    const refs = renamePreview.refs;
    const staged = renameStaged.current;
    if (!refs || !staged || staged.from !== refs.from || staged.to !== refs.to) return;
    setProviderRename(current => (current ? { ...current, refs: refs.refs } : current));
  }, [renamePreview]);
  const deleteProviderConfirmed = (removeKeyToo: boolean, withModels: boolean): void => {
    if (!providerToDelete) return;
    const { key, keyEnv } = providerToDelete;
    // The failure has to land somewhere the reader is looking: the answer arrives after this
    // screen is gone, and the providers list is what renders a refusal.
    providersEnvStore.clearError();
    connection.send(encodeProvidersRemove(key, withModels)).catch(() => {});
    if (removeKeyToo && keyEnv) {
      connection.send(encodeProvidersEnvRemove(keyEnv)).catch(() => {});
    }
    setProviderToDelete(null);
    setSelectedProvider(null);
    setProviderEdit(null);
    setSettingsPage('models');
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
  // The .env line itself goes away; the claim falls back to the captured pin. The server
  // broadcasts a fresh providers.env.result right after the write.
  const removeEnvLine = (name: string): void => {
    if (providerBusy) return;
    setProviderBusy(true);
    connection.send(encodeProvidersEnvRemove(name)).catch(() => {});
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
  const confirmTool = (name: string, confirm: boolean): void => {
    setToolsSaving(true);
    connection.send(encodeToolsConfirm(name, confirm)).catch(() => {});
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
            share={shareLabel}
            meter={meter}
            connectionState={status.state}
            locationEnabled={locationEnabled}
            mediaBase={mediaBase}
            deviceInfo={deviceInfo}
            hint={hint}
            autoFocusHero={autoFocusHero}
            onOpenDrawer={() => setDrawerOpen(true)}
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
                    parentTitle: backLabel(subagentView, parentTitleOf),
                  },
                  // Its own prop, not the drawer's: the way back used to be the hamburger slot
                  // wearing a chevron, which is why it read as the odd one out of every header.
                  onBack: leaveSubAgent,
                  onSubAgentMenu: () => setSubagentMenuOpen(true),
                }
              : {})}
            onBubbleMenu={openBubbleMenu}
            onResend={resendChat}
            onOpenImage={openImage}
            onOpenText={openTextViewer}
            onOpenVideo={openVideoViewer}
            onOpenSvg={openSvgViewer}
            onOpenPdf={openPdfViewer}
            onOpenHtml={openHtmlViewer}
            onOpenOffice={openOfficeViewer}
            onOpenArchive={openArchiveViewer}
            onOpenFile={openFileViewer}
            onOpenMenu={() => setCommandMenuOpen(true)}
            onOpenModel={openModel}
            onCommandEntered={dispatchCommand}
            onQuestionReply={replyToQuestion}
            onTagCommand={dispatchTagCommand}
            streaming={streaming}
            onStop={() => {
              // The composer's own stop follows the same one-per-cycle rule as the menu entry:
              // while one is in flight the press sends nothing.
              if (activeThread && chatStore.claimStop(activeThread)) connection.send(encodeChatStop(activeThread));
            }}
            onContinue={() => {
              // A sub-agent's chat names the conversation it is driven from, as a send does.
              if (!activeThread) return;
              const parent = subagentRef.current?.threadId === activeThread ? subagentRef.current.parentThreadId : undefined;
              connection.send(encodeChatContinue(activeThread, parent)).catch(() => {});
            }}
            quotaWait={activeQuotaRetry?.waiting}
            onQuotaCancel={() => {
              if (activeThread) connection.send(encodeSessionQuotaRetrySet(activeThread, false)).catch(() => {});
            }}
            onQuotaRetryNow={() => {
              if (activeThread) connection.send(encodeSessionQuotaRetryNow(activeThread)).catch(() => {});
            }}
            onNewThread={newThread}
            onLoadOlder={loadOlderHistory}
            loadingOlder={historyPage.loading}
            uiPrefs={uiPrefs}
          />
  );

  const setupPage = (
    <SetupScreen
      deviceId={deviceInfo?.deviceId ?? null}
      providers={providerCount}
      gate={setupGate ? { onFinish: () => leaveSetup(false), onSkip: () => leaveSetup(true) } : undefined}
      onBack={() => setSettingsPage(setupFrom)}
      onOpen={step => {
        if (step.key === 'profile') openInstruction('default', 'USER.md', 'setup');
        else if (step.page === 'model-picker') {
          setAgentPicker(pickerStart);
          setAgentModelFor('global');
          setModelPickerFrom('setup');
          setSettingsPage('model-picker');
        } else if (step.page === 'devices') {
          setDevicesFrom('setup');
          setSettingsPage('devices');
        } else if (step.page) setSettingsPage(step.page);
      }}
    />
  );

  // The browser in full screen, or the first-run setup: the page has the window to itself.
  const fullPage = browserFullNow || setupGate;
  const split = layout.sidePane && !fullPage;

  /**
   * Where the viewer on screen draws, and the one switch that moves it.
   *
   * Beside the conversation on a wide window (the same `split` a page opens under), over the
   * window everywhere else -- and the toggle exists only when both do, so a phone never shows a
   * control that changes nothing. `viewerLayers` is built once and mounted in exactly one of
   * the two places, never both.
   */
  const anyViewerOpen = Boolean(
    imageViewer || textViewer || videoViewer || svgViewer || pdfViewer || htmlViewer || officeViewer || archiveViewer || fileViewer || skillViewer,
  );
  const viewerInPane = split && anyViewerOpen && !viewerExpanded;
  const toggleViewerFullscreen = useCallback((): void => rightPane.setExpanded(!rightPane.get().expanded), []);
  const fullscreenToggle = split ? toggleViewerFullscreen : undefined;
  const viewerLayers = (
    <>
      {imageViewer ? (
        <ImageViewer
          images={imageViewer.images}
          index={imageViewer.index}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {textViewer ? (
        <TextViewer
          url={textViewer.url}
          filename={textViewer.filename}
          kind={textViewer.file}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {videoViewer ? (
        <VideoViewer
          url={videoViewer.url}
          filename={videoViewer.filename}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {svgViewer ? (
        <SvgViewer
          url={svgViewer.url}
          filename={svgViewer.filename}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {pdfViewer ? (
        <PdfViewer
          url={pdfViewer.url}
          filename={pdfViewer.filename}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {htmlViewer ? (
        <HtmlViewer
          url={htmlViewer.url}
          filename={htmlViewer.filename}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {officeViewer ? (
        <TextViewer
          url={withView(officeViewer.url, 'text')}
          downloadUrl={officeViewer.url}
          filename={officeViewer.filename}
          kind="text"
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {archiveViewer ? (
        <ArchiveViewer
          url={withView(archiveViewer.url, 'list')}
          rawUrl={archiveViewer.url}
          filename={archiveViewer.filename}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {fileViewer ? (
        <FileViewer
          filename={fileViewer.filename}
          url={fileViewer.url}
          sizeBytes={fileViewer.sizeBytes}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
        />
      ) : null}

      {skillViewer ? (
        <SkillViewer
          url={skillViewer.url}
          skill={skillViewer.skill}
          embedded={viewerInPane}
          onToggleFullscreen={fullscreenToggle}
          onClose={closeViewers}
          onActions={() => setSkillMenu(skillViewer.skill)}
        />
      ) : null}
    </>
  );

  return (
    // Every block inside the thread reaches the selection viewer through here, rather than
    // through a callback threaded down to the tool cards. See docs/text-selection.md.
    <TextSelectionContext.Provider value={openSelection}>
    <PageCloseContext.Provider value={settingsClose}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={palette.bg}
      />
      {/* The shell's keyboard inset, from an answer rather than a memory: KeyboardShell re-asks the
          platform on every return to the foreground, which is what the platform component could not
          do -- it kept the last keyboard event and padded by a keyboard that had gone while the app
          was in the background. See docs/keyboard-avoidance.md. */}
      <KeyboardShell style={styles.safe}>
        {/* A row with one child on a phone, two on a desktop: the conversation list stops being
            an overlay and becomes a column, and the pages beside it lose nothing. */}
        <View style={styles.shell}>
        {layout.pinnedDrawer && !fullPage ? (
          <PinnedColumn
            onNewThread={newThread}
            onOpenSettings={openSettingsFromDrawer}
            drawer={
          <Drawer
            pinned
            open
            onCollapse={() => panes.setDrawerCollapsed(true)}
            focusSearch={searchFocus}
            sessions={sessions}
            folders={folders}
            unread={unread}
            running={runningThreads}
            questionThreads={questionThreads}
            workspaceFilter={workspaceFilter}
            collapsedFolders={collapsedFolders}
            activeThread={activeThread}
            connectionState={status.state}
            pending={pending}
            onClose={() => {}}
            onOpenThread={openThreadFromDrawer}
            onNewThread={newThread}
            onThreadMenu={openThreadMenu}
            onOpenWorkspaceFilter={() => setWorkspaceFilterOpen(true)}
            onClearWorkspaceFilter={() => setWorkspaceFilter(null)}
            onToggleFolder={toggleFolder}
            onNewFolder={() => setFolderToCreate({ workspace: workspaceFilter ?? undefined })}
            onFolderMenu={setFolderMenu}
            onMoveToFolder={fileThread}
            onReorderFolders={reorderFolders}
            onOpenMore={() => setMoreOpen(true)}
            approvalCount={approvals.length}
            onOpenSettings={openSettingsFromDrawer}
            onHome={handleHome}
          />
            }
          />
        ) : null}
        {/* The home list is a full-bleed panel: the container's md padding would paint a band
            of bg around its surface, a frame the phone does not ask for. It belongs to the
            shell, not to the padded column. */}
        {homeList ? (
          <Drawer
            home
            open
            focusSearch={searchFocus}
            sessions={sessions}
            folders={folders}
            unread={unread}
            running={runningThreads}
            questionThreads={questionThreads}
            workspaceFilter={workspaceFilter}
            collapsedFolders={collapsedFolders}
            activeThread={activeThread}
            connectionState={status.state}
            pending={pending}
            onClose={() => {}}
            onOpenThread={openThreadFromDrawer}
            onNewThread={newThread}
            onThreadMenu={openThreadMenu}
            onOpenWorkspaceFilter={() => setWorkspaceFilterOpen(true)}
            onClearWorkspaceFilter={() => setWorkspaceFilter(null)}
            onToggleFolder={toggleFolder}
            onNewFolder={() => setFolderToCreate({ workspace: workspaceFilter ?? undefined })}
            onFolderMenu={setFolderMenu}
            onMoveToFolder={fileThread}
            onReorderFolders={reorderFolders}
            onOpenMore={() => setMoreOpen(true)}
            approvalCount={approvals.length}
            onOpenSettings={openSettingsFromDrawer}
            onHome={handleHome}
          />
        ) : (
        <View style={[styles.container, split && styles.containerSplit]}>
        {/* Wide enough for both: a page opens beside the conversation instead of over it, which
            is the difference between reading the two and remembering one. */}
        {split ? <View style={styles.chatPane}>{activeThread === null ? <View style={styles.pageFull} testID="home-placeholder" /> : chatScreen}</View> : null}
        {split && !pageOpen ? null : (
        <PagePane
          split={split}
          hidden={viewerInPane}
          style={[
            styles.pageFull,
            // Full screen is the whole window: the cap of a page of controls would undo it.
            layout.pinnedDrawer && !browserFullNow && { maxWidth: layout.pageWidth, alignSelf: 'center' as const, width: '100%' as const },
            // The setup alone in the window reads as one column, whatever page it opened.
            setupGate && { maxWidth: SETUP_WIDTH, alignSelf: 'center' as const, width: '100%' as const },
          ]}>
          {settingsOpen ? (
            settingsPage === 'index' && setupGate ? (
              setupPage
            ) : settingsPage === 'index' ? (
              <SettingsScreen
                skillsCount={skills.length}
                toolsCount={tools.length}
                setup={setupProgress}
                nativeApp={Platform.OS !== 'web'}
                onBack={() => setSettingsOpen(false)}
                onOpen={page => {
                  if (page === 'setup') setSetupFrom('index');
                  if (page === 'devices') setDevicesFrom('index');
                  setSettingsPage(page);
                }}
              />
            ) : settingsPage === 'appearance' ? (
              <AppearanceScreen
                themeId={themeControl.themeId}
                onThemeIdChange={themeControl.setThemeId}
                custom={themeControl.custom}
                onCustomChange={themeControl.setCustom}
                themeMode={themeControl.mode}
                onThemeModeChange={themeControl.setMode}
                chatFontScale={chatFontScale}
                onChatFontScaleChange={changeChatFontScale}
                uiPrefs={uiPrefs}
                onUiPrefsChange={changeUiPrefs}
                onBack={() => setSettingsPage(parentOf('appearance'))}
              />
            ) : settingsPage === 'updates' ? (
              <UpdatesScreen
                connected={status.state === 'connected'}
                serverVersion={serverVersion}
                appVersion={appVersion}
                updatePhase={updatePhase}
                appUpdatePhase={appUpdatePhase}
                now={updateNow}
                updateOnMobileData={updateOnMobileData}
                onUpdateOnMobileDataChange={value => {
                  prefs.set('updateOnMobileData', value);
                  setUpdateOnMobileData(value);
                }}
                onUpdateServer={runServerUpdate}
                onAppUpdate={runAppUpdate}
                onAppUpdateRestart={restartAppUpdate}
                onAppUpdateInstallSettings={openAppUpdateInstallSettings}
                onBack={() => setSettingsPage(parentOf('updates'))}
              />
            ) : settingsPage === 'advanced' ? (
              <AdvancedScreen
                deviceInfo={deviceInfo}
                appVersion={appVersion}
                status={status}
                serverVersion={serverVersion}
                pending={pending}
                onClearOutbox={() => {
                  connection.clearOutbox();
                  setPending(0);
                }}
                onOpenDiagnostics={openDiagnostics}
                onOpenConfig={() => setSettingsPage('config')}
                onOpenSetup={() => {
                  setSetupFrom('advanced');
                  setSettingsPage('setup');
                }}
                onBack={() => setSettingsPage(parentOf('advanced'))}
              />
            ) : settingsPage === 'notifications' ? (
              <NotificationsScreen
                onBack={() => setSettingsPage(parentOf('notifications'))}
                onChannelsChange={sendNotificationChannels}
                onEnableNotifications={allowNotifications}
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
                    // The picker returns where it was opened from: the models page for the
                    // global default and the fallback, the agent page for an agent key.
                    const from = modelPickerFrom ?? (agentModelFor === 'global' || agentModelFor === 'fallback' ? 'models' : 'agent');
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
                  defaultCap={
                    agentsConfig?.contextCap
                      ? agentsConfig.contextCap.value ?? agentsConfig.contextCap.default
                      : undefined
                  }
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
                    setSettingsPage(instructionBack);
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
            ) : settingsPage === 'models' ? (
              modelsPage
            ) : settingsPage === 'account' ? (
              <AccountScreen
                provider={selectedAccount.provider}
                kind={selectedAccount.kind}
                onOpenModels={() => {
                  setSelectedProvider(selectedAccount.provider);
                  setProviderFrom('account');
                  setSettingsPage('provider');
                }}
                onRename={current => setAccountPrompt({ mode: 'rename', provider: selectedAccount.provider, current })}
                needsModel={!modelReady(catalog.defaultModel, catalog.unavailable)}
                onBack={() => setSettingsPage(parentOf('account'))}
                onPickModel={() => {
                  setAgentPicker(pickerStart);
                  setAgentModelFor('global');
                  setModelPickerFrom('account');
                  setSettingsPage('model-picker');
                }}
              />
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
                  onToggleDisabled={disabled => {
                    // One tap, like every switch on the settings pages. A refusal (the provider
                    // carrying the global default) lands on the providers list's error row.
                    connection.send(encodeProvidersUpsert(selectedProviderInfo.key, { disabled })).catch(() => {});
                  }}
                  onBack={() => setSettingsPage(providerFrom === 'account' ? 'account' : 'models')}
                />
              ) : (
                modelsPage
              )
            ) : settingsPage === 'provider-add' ? (
              <ProviderAddScreen
                onBack={() => setSettingsPage(parentOf('provider-add'))}
                onPlan={kind => setAccountPrompt({ mode: 'add', kind })}
                onService={service => {
                  setProviderBusy(false);
                  setProviderService(service);
                  setProviderEdit({ mode: 'create', key: null });
                  setSettingsPage('provider-edit');
                }}
                onCustom={() => {
                  setProviderBusy(false);
                  setProviderService(undefined);
                  setProviderEdit({ mode: 'create', key: null });
                  setSettingsPage('provider-edit');
                }}
              />
            ) : settingsPage === 'model-edit' ? (
              modelEdit ? (
                <ModelEditScreen
                  mode={modelEdit.mode}
                  model={modelEdit.model}
                  provider={modelEdit.provider}
                  providerType={agentsConfig?.providers.find(p => p.key === modelEdit.provider)?.type}
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
                modelsPage
              )
            ) : settingsPage === 'provider-edit' ? (
              providerEdit ? (
                <ProviderEditScreen
                  // A fresh form per service: its fields are seeded once, from the row picked.
                  key={providerEdit.mode === 'create' ? `create:${providerService?.id ?? 'custom'}` : `edit:${providerEdit.key}`}
                  mode={providerEdit.mode}
                  service={providerEdit.mode === 'create' ? providerService : undefined}
                  providers={agentsConfig?.providers ?? []}
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
                      declaredModels: declaredModelIds(providerEdit.key ?? ''),
                      tagRoutes: tagRoutesThroughProvider(
                        tagsState.tags ?? [],
                        providerEdit.key ?? '',
                        (agentsConfig?.providers ?? []).map(provider => provider.key),
                      ),
                      ...(providerEdit.key
                        ? { keyEnv: agentsConfig?.providers.find(p => p.key === providerEdit.key)?.keyEnv }
                        : {}),
                    })
                  }
                  onOpenEnv={() => setSettingsPage('provider-env')}
                  onBack={() => {
                    if (providerEdit.mode === 'create') setSettingsPage('provider-add');
                    else setSettingsPage('provider');
                    setProviderEdit(null);
                  }}
                  onEnvSet={saveEnvValue}
                  onEnvRemove={removeEnvLine}
                />
              ) : (
                modelsPage
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
                modelsPage
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
                    setModelPickerFrom(null);
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
              numberEditor?.field === 'defaultcap' ? (
                <NumberEditorScreen
                  backLabel="Back to models"
                  title="Context cap"
                  hint={`ceiling for every agent, tag and conversation without its own · 0 lifts it · default ${agentsConfig?.contextCap?.default ?? 512000}`}
                  value={agentsConfig?.contextCap?.value ?? null}
                  placeholder="0 lifts the ceiling, blank = server default"
                  min={1}
                  allowZero
                  error={agentsState.error}
                  saving={false}
                  onBack={() => setSettingsPage('models')}
                  onSave={saveDefaultCap}
                />
              ) : numberEditor && selectedAgentInfo ? (
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
                  backLabel="Back to tags"
                  title={`Tag ${tagContextEditor} · context cap`}
                  hint="ceiling for runs through this tag"
                  value={tagsState.tags?.find(tag => tag.name === tagContextEditor)?.contextCap ?? null}
                  placeholder="blank = agent/global setting"
                  min={1}
                  allowZero={false}
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
                  onBack={() => setSettingsPage(parentOf('config'))}
                  onChange={draft => setConfigEditor(current => (current ? { ...current, draft, error: null } : current))}
                  onSave={saveConfig}
                  onReload={reloadConfig}
                />
              ) : (
                <EmptyCategoryScreen title="Config" onBack={() => setSettingsPage(parentOf('config'))} />
              )
            ) : settingsPage === 'approvals' ? (
              <ApprovalHistoryScreen
                history={approvalHistory}
                onBack={() => setSettingsPage(parentOf('approvals'))}
                onRefresh={() => connection.send(encodeApprovalHistory())}
              />
            ) : settingsPage === 'devices' ? (
              <DevicesScreen
                onBack={() => {
                  setSettingsPage(devicesFrom === 'setup' ? 'setup' : parentOf('devices'));
                  setDevicesFrom('index');
                }}
                startInviting={devicesFrom === 'setup'}
                connected={status.state === 'connected'}
                serverOrigin={httpOrigin(url)}
              />
            ) : settingsPage === 'nodes' ? (
              <NodesScreen
                onBack={() => setSettingsPage(parentOf('nodes'))}
                onOpenNode={nodeId => {
                  setSelectedNode(nodeId);
                  setSettingsPage('node');
                }}
                connected={status.state === 'connected'}
                serverOrigin={httpOrigin(url)}
              />
            ) : settingsPage === 'node' && selectedNode ? (
              <NodeScreen
                nodeId={selectedNode}
                onBack={() => setSettingsPage('nodes')}
                connected={status.state === 'connected'}
                serverVersion={serverVersion ?? undefined}
              />
            ) : settingsPage === 'servers' ? (
              <ServersScreen
                url={url}
                onUrlChange={changeUrl}
                status={status}
                serverVersion={serverVersion}
                onConnect={connectByHand}
                onDisconnect={() => connection.disconnect()}
                onJoin={Platform.OS === 'web' ? undefined : openJoin}
                onBack={() => setSettingsPage(parentOf('servers'))}
              />
            ) : settingsPage === 'services' ? (
              <ServicesScreen onBack={() => setSettingsPage(parentOf('services'))} />
            ) : settingsPage === 'embeddings' ? (
              <EmbeddingsScreen onBack={() => setSettingsPage(parentOf('embeddings'))} />
            ) : settingsPage === 'setup' ? (
              setupPage
            ) : settingsPage === 'skills' ? (
              <SkillsScreen
                skills={skills}
                workspaces={workspaces}
                error={skillsError ?? undefined}
                notice={skillsNotice ?? undefined}
                onBack={() => {
                  setSkillsNotice(null);
                  setSettingsPage(parentOf('skills'));
                }}
                onOpenSkill={skill => {
                  if (!deviceInfo) return;
                  openSkillViewer({
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
                onBack={() => setSettingsPage(parentOf('workspaces'))}
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
                backLabel="Back to advanced"
                onBack={() => setSettingsPage(parentOf('diagnostics'))}
              />
            ) : settingsPage === 'tools' ? (
              <ToolsScreen
                tools={tools}
                missing={toolsMissing}
                error={toolsError ?? undefined}
                saving={toolsSaving}
                onBack={() => setSettingsPage(parentOf('tools'))}
                onToggle={toggleTool}
                onConfirm={confirmTool}
                onOpenMcps={() => setSettingsPage('mcps')}
                onOpenApprovals={() => setSettingsPage('approvals')}
              />
            ) : settingsPage === 'mcps' ? (
              <McpsScreen
                servers={mcpServers}
                error={mcpError}
                busy={mcpBusy}
                onBack={() => setSettingsPage(parentOf('mcps'))}
                onAdd={addMcp}
                onRemove={removeMcp}
                onEnable={enableMcp}
              />
            ) : (
              <EmptyCategoryScreen title="Settings" onBack={() => setSettingsPage('index')} />
            )
          ) : browserOpen ? (
            <BrowserScreen
              error={browserError}
              unblock={browserUnblock}
              connected={status.state === 'connected'}
              initialWindow={browserWindow}
              fullScreen={browserFullNow}
              onToggleFullScreen={layout.pinnedDrawer ? () => setBrowserFull(full => !full) : undefined}
              onClose={() => {
                setBrowserOpen(false);
                setBrowserFull(false);
                // A result is a moment, not a state: reopening the page shows where to connect,
                // not what a button did last time.
                setBrowserUnblock(null);
              }}
            />
          ) : archivesOpen ? (
            <ArchivesScreen
              sessions={archivedSessions}
              onBack={() => setArchivesOpen(false)}
              onOpenThread={openThreadFromArchives}
              onThreadMenu={openThreadMenu}
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
              onOpenImage={openImage}
              onOpenText={openTextViewer}
              onOpenVideo={openVideoViewer}
              onOpenSvg={openSvgViewer}
              onOpenPdf={openPdfViewer}
              onOpenHtml={openHtmlViewer}
              onOpenOffice={openOfficeViewer}
              onOpenArchive={openArchiveViewer}
            />
          ) : statusOpen ? (
            <StatusScreen onClose={closeStatus} />
          ) : statsOpen ? (
            <StatsScreen onClose={closeStats} />
          ) : approvalsOpen ? (
            <ApprovalsScreen
              approvals={approvals}
              history={approvalHistory}
              grants={approvalGrants}
              onDecide={decideApproval}
              onBack={closeApprovals}
              onRefreshHistory={() => connection.send(encodeApprovalHistory()).catch(() => {})}
            />
          ) : systemFilesOpen ? (
            <SystemFilesScreen deviceInfo={deviceInfo} onClose={closeSystemFiles} />
          ) : instructionsPageOpen ? (
            instructionsPageEditing && instructions.editor ? (
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
            ) : (
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
            )
          ) : (
            pairingOpen ? (
              <PairingScreen
                serverUrl={url}
                onUrlChange={changeUrl}
                pairing={pairing}
                unknownDevice={status.state === 'disconnected' && status.reason === 'unauthorized'}
                onClose={() => {
                  setPairingOpen(false);
                  setSettingsOpen(true);
                  setSettingsPage('servers');
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
        </PagePane>
        )}
        {viewerInPane ? <ViewerPane>{viewerLayers}</ViewerPane> : null}
        </View>
        )}
        </View>
      </KeyboardShell>

      {layout.pinnedDrawer ? null : (
      <Drawer
        open={drawerOpen}
        focusSearch={searchFocus}
        sessions={sessions}
        folders={folders}
        unread={unread}
        running={runningThreads}
        questionThreads={questionThreads}
        workspaceFilter={workspaceFilter}
        collapsedFolders={collapsedFolders}
        activeThread={activeThread}
        connectionState={status.state}
        pending={pending}
        onClose={() => setDrawerOpen(false)}
        onOpenThread={openThreadFromDrawer}
        onNewThread={newThread}
        onThreadMenu={openThreadMenu}
        onOpenWorkspaceFilter={() => setWorkspaceFilterOpen(true)}
        onClearWorkspaceFilter={() => setWorkspaceFilter(null)}
        onToggleFolder={toggleFolder}
        onNewFolder={() => setFolderToCreate({ workspace: workspaceFilter ?? undefined })}
        onFolderMenu={setFolderMenu}
        onMoveToFolder={fileThread}
        onReorderFolders={reorderFolders}
        onOpenMore={() => setMoreOpen(true)}
        approvalCount={approvals.length}
        onOpenSettings={openSettingsFromDrawer}
        onHome={handleHome}
      />
      )}

      {viewerInPane ? null : viewerLayers}

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
              icon: <RefreshIcon size={15} tone="danger" />,
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

      {bubbleMenu ? (() => {
        // A voice note keeps its words beside the file, so the menu's preview and its copies read
        // the transcript: a bubble that is only a recording used to open a sheet with nothing in
        // it and copy an empty string (owner, 2026-11-07).
        const copyText = messageSelectionBody({
          text: bubbleMenu.text,
          attachments: bubbleMenu.attachments,
          transcripts: bubbleMenu.transcripts,
        });
        return (
        <ActionSheet
          preview={copyText}
          options={[
            // Handing an answer to the parent is a message in the parent conversation, so it is a
            // plain send there: the server injects it into a running parent or starts a fresh run,
            // exactly as it would for anything typed by hand.
            ...(subagentView && bubbleMenu.role === 'agent' && bubbleMenu.text.trim()
              ? [
                  {
                    label: 'Hand back to…',
                    icon: <AgentIcon size={15} tone="muted" />,
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
            // The answer alone. The reasoning has its own row below, so leaving it in here would
            // copy it twice and make "with thinking" mean nothing (owner, 2026-11-04).
            {
              label: 'Copy text',
              icon: <CopyIcon size={15} tone="muted" />,
              hint: 'the answer, without the reasoning',
              onPress: () => {
                Clipboard.setString(copyText);
                setBubbleMenu(null);
              },
            },
            // Both halves at once, which is what a reader pasting a debugging exchange into an
            // issue wants. Gated on the reasoning alone: a message that only carries a summary
            // would make this row copy exactly what the row above copies.
            ...(bubbleMenu.reasoning?.trim()
              ? [
                  {
                    label: 'Copy with thinking',
                    icon: <CopyAllIcon size={15} tone="muted" />,
                    hint: 'the answer and the reasoning that led to it',
                    onPress: () => {
                      const item = bubbleMenu;
                      Clipboard.setString(messageSelectionBody({ ...item, details: undefined }));
                      setBubbleMenu(null);
                    },
                  },
                ]
              : []),
            // The whole message, reasoning and summary included, as the source it was written
            // in: the viewer is the only place a selection can cross from one block to the next.
            {
              label: 'Select text',
              icon: <SearchIcon size={15} tone="muted" />,
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
                    icon: <SparkIcon size={15} tone="muted" />,
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
                    icon: <DigestIcon size={15} tone="muted" />,
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
        );
      })() : null}

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
              // A note, not a row: it says what the sheet is waiting for, it is not something to
              // press, and as an option it announced itself as a button that does nothing.
              ...(handoffCallers.status !== 'ready' || handoffCallers.callers.length === 0
                ? [{
                    type: 'note' as const,
                    key: 'state',
                    text: handoffCallers.status === 'loading'
                      ? 'Looking up who called this sub-agent…'
                      : handoffCallers.status === 'refused'
                        ? 'This sub-agent is no longer reachable from here'
                        : 'Nothing has called this sub-agent yet',
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
                type: 'note' as const,
                key: caller.sessionId,
                text: `${caller.title ?? caller.sessionId} · conversation is gone`,
              })),
              { type: 'separator' as const, key: 'actions' },
              {
                key: 'ask',
                label: count > 0 ? `Send for action (${count})` : 'Send for action',
                icon: <SendIcon size={15} tone="muted" />,
                hint: 'lands as a message, so the agent there acts on it',
                onPress: () => deliver('ask'),
              },
              {
                key: 'note',
                label: count > 0 ? `File as a note (${count})` : 'File as a note',
                icon: <InfoIcon size={15} tone="muted" />,
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
            // The session actions first, in the order the conversation menu uses them, then what
            // belongs to an agent alone. Archive, Rename and Change workspace are absent on
            // purpose: a sub-agent is not in the drawer, so they would act on nothing visible.
            ...(() => {
              const shared = sessionEntries(subagentView.threadId, () => setSubagentMenuOpen(false));
              return [
                shared.model,
                shared.tune,
                // No Stop here either: the composer's corner has it while a run is live, and the
                // sub-agent's own conversation draws that composer.
                shared.instructions,
                shared.files,
      shared.systemFiles,
                shared.status,
                shared.refresh,
                shared.transcript,
              ];
            })(),
            { type: 'separator' as const },
            {
              label: 'Copy id',
              icon: <CopyIcon size={15} tone="muted" />,
              onPress: () => {
                Clipboard.setString(subagentView.id);
                setSubagentMenuOpen(false);
              },
            },
            ...(subagentView.workspaceDir
              ? [
                  {
                    label: 'Workspace',
                    // A copy, not a folder: the row puts the path on the clipboard, and beside
                    // Copy id above it the two read as one pair of copies.
                    icon: <CopyIcon size={15} tone="muted" />,
                    hint: subagentView.workspaceDir,
                    onPress: () => {
                      // The path, not a browser: it answers "where does this agent write", which
                      // is the question a multi-repo workspace actually raises.
                      if (subagentView.workspaceDir) Clipboard.setString(subagentView.workspaceDir);
                      setSubagentMenuOpen(false);
                    },
                  },
                ]
              : []),
            {
              label: 'Clear memory',
              icon: <EraserIcon size={15} tone="muted" />,
              hint: 'archives the transcript, keeps the agent and its workspace',
              onPress: () => {
                setSubagentMenuOpen(false);
                setSubagentAction('reset');
              },
            },
            {
              label: 'Delete',
              icon: <TrashIcon size={15} tone="danger" />,
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

      {workspaceFilterOpen ? (
        <ActionSheet
          preview="Filter by workspace"
          options={workspaceFilterOptions}
          search={
            workspaceChoices.length >= WORKSPACE_SEARCH_FROM
              ? { value: workspaceQuery, onChange: setWorkspaceQuery, placeholder: 'Search workspaces' }
              : null
          }
          onClose={closeWorkspaceFilter}
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
              icon: <ArchiveIcon size={15} tone="muted" />,
              hint: archivedSessions.length > 0 ? `${archivedSessions.length} conversations` : undefined,
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                setArchivesOpen(true);
              },
            },
            {
              // Sub-agents, not "Agents": the orchestrator is the conversation itself, and the
              // Agents settings page is where every agent, the orchestrator included, is set.
              label: 'Sub-agents',
              icon: <AgentIcon size={15} tone="muted" />,
              hint: 'shared workers',
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                setAgentsGlobalOpen(true);
              },
            },
            {
              label: 'Jobs',
              icon: <CalendarIcon size={15} tone="muted" />,
              hint: 'scheduled tasks',
              shortcut: shortcutHint('jobs'),
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                openJobs();
              },
            },
            {
              label: 'Browser',
              icon: <OpenInNewIcon size={15} tone="muted" />,
              hint: 'take the session over',
              shortcut: shortcutHint('browser'),
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                setBrowserError(null);
                setBrowserOpen(true);
              },
            },
            {
              // Beside Settings rather than beside the conversation actions: this reads the whole
              // install, deleted conversations included, and belongs to no thread at all.
              label: 'Statistics',
              icon: <ChartIcon size={15} tone="muted" />,
              hint: 'every conversation, deleted included',
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                setStatsOpen(true);
              },
            },
            {
              // Every prompt waiting on him, every machine, plus the calls allowed for good. Here
              // rather than in Settings because it is a queue he has to clear, not a preference.
              label: 'Approvals',
              icon: <CheckIcon size={15} tone={approvals.length > 0 ? 'accent' : 'muted'} />,
              hint: approvals.length > 0 ? `${approvals.length} waiting` : 'waiting, past, and always allowed',
              onPress: openApprovals,
            },
            {
              // Beside the statistics rather than beside the conversation actions: this reads the
              // machine my-claw runs on, not the thread on screen. Opened from a session it starts
              // at that session's workspace instead, which is the only difference between the two
              // entries -- docs/files-page.md.
              label: 'Files',
              icon: <FolderIcon size={15} tone="muted" />,
              hint: 'every file on this machine',
              shortcut: shortcutHint('files'),
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                fsStore.open();
                setSystemFilesOpen(true);
              },
            },
            {
              label: 'Settings',
              icon: <GearIcon size={15} tone="muted" />,
              hint: `${CONNECTION_LABEL[status.state]}${pending > 0 ? ` · ${pending} pending` : ''}`,
              shortcut: shortcutHint('settings'),
              onPress: () => {
                setMoreOpen(false);
                setDrawerOpen(false);
                openSettings();
              },
            },
            // Where a keyboard is: the list of every key, each row runs its action.
            ...(Platform.OS === 'web'
              ? [
                  {
                    label: 'Keyboard shortcuts',
                    icon: <InfoIcon size={15} tone="muted" />,
                    shortcut: shortcutHint('help'),
                    onPress: () => {
                      setMoreOpen(false);
                      setDrawerOpen(false);
                      openShortcuts();
                    },
                  },
                ]
              : []),
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

      {siphonOpen && activeThread ? (
        <SiphonSheet
          threadId={activeThread}
          state={siphonPicker}
          onStateChange={setSiphonPicker}
          onClose={() => setSiphonOpen(false)}
        />
      ) : null}

      {tuneOpen ? (
        <ModelTuneSheet
          threadId={activeThread}
          onClose={() => setTuneOpen(false)}
        />
      ) : null}

      {accountPrompt ? (
        <PromptSheet
          title={
            accountPrompt.mode === 'rename'
              ? 'Rename this account'
              : accountPrompt.kind === 'codex'
                ? 'Name this ChatGPT account'
                : 'Name this Claude account'
          }
          hint={accountPrompt.mode === 'add' ? 'how it reads in the model picker: "perso", "work"…' : undefined}
          initialValue={accountPrompt.mode === 'rename' ? accountPrompt.current : ''}
          placeholder={accountPrompt.mode === 'add' && accountPrompt.kind === 'claude' ? 'Claude perso' : 'ChatGPT perso'}
          confirmLabel={accountPrompt.mode === 'rename' ? 'Rename' : 'Add'}
          maxLength={40}
          invalid={value =>
            nameTaken(value, agentsConfig?.providers ?? [], accountPrompt.mode === 'rename' ? accountPrompt.provider : undefined)
              ? NAME_TAKEN
              : null
          }
          onSubmit={value => {
            const name = value.trim();
            if (!name) return;
            if (accountPrompt.mode === 'rename') {
              connection.send(encodeAccounts({ type: 'accounts.rename', provider: accountPrompt.provider, name })).catch(() => {});
            } else {
              pendingAccount.current = accountPrompt.kind;
              connection.send(encodeAccounts({ type: 'accounts.add', kind: accountPrompt.kind, name })).catch(() => {});
            }
          }}
          onClose={() => setAccountPrompt(null)}
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
              icon: <TrashIcon size={15} tone="danger" />,
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
              icon: <TrashIcon size={15} tone="danger" />,
              danger: true,
              onPress: deleteTagConfirmed,
            },
          ]}
          onClose={() => setTagToDelete(null)}
        />
      ) : null}

      {providerToDelete ? (
        <ActionSheet
          preview={`${deleteProviderPreview(providerToDelete)}${tagRoutesSuffix(providerToDelete.tagRoutes)}`}
          options={[
            ...(providerToDelete.declaredModels.length > 0 || providerToDelete.tagRoutes.length > 0
              ? [
                  {
                    label: deleteProviderCascadeLabel(providerToDelete),
                    danger: true,
                    onPress: () => deleteProviderConfirmed(false, true),
                  },
                ]
              : [
                  {
                    label: 'Delete',
                    icon: <TrashIcon size={15} tone="danger" />,
                    danger: true,
                    onPress: () => deleteProviderConfirmed(false, false),
                  },
                ]),
            ...(providerToDelete.keyEnv
              ? [
                  {
                    label: 'Delete and remove its key from .env',
                    icon: <TrashIcon size={15} tone="danger" />,
                    danger: true,
                    onPress: () => deleteProviderConfirmed(true, false),
                  },
                ]
              : []),
          ]}
          onClose={() => setProviderToDelete(null)}
        />
      ) : null}

      {providerRename && providerRename.refs ? (
        <ActionSheet
          preview={renamePreviewText(providerRename.from, providerRename.to, providerRename.refs)}
          options={[
            {
              label: `Rename to "${providerRename.to}"`,
              icon: <PencilIcon size={15} tone="muted" />,
              onPress: confirmProviderRename,
            },
          ]}
          onClose={cancelProviderRename}
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

      {undoPrompts.length > 0 ? (
        <UndoSheet
          id={undoPrompts[undoPrompts.length - 1]!.id}
          turnPreview={undoPrompts[undoPrompts.length - 1]!.turnPreview}
          diff={undoPrompts[undoPrompts.length - 1]!.diff}
          onClose={() => {
            // Dismissing is a cancel: nothing runs, the server resolves the prompt.
            const last = undoPrompts[undoPrompts.length - 1]!;
            connection.send(encodeUndoCancel(last.id)).catch(() => {});
            undoStore.resolve(last.id);
          }}
        />
      ) : null}

      {folderToCreate ? (
        <PromptSheet
          title="Name this folder"
          hint="It holds conversations. The ones inside keep running, and deleting it deletes none of them."
          placeholder="CubeFlow"
          confirmLabel="Create"
          maxLength={FOLDER_NAME_LIMIT}
          onSubmit={value => {
            const name = value.trim();
            if (name) connection.send(encodeFolderCreate(name, folderToCreate.workspace)).catch(() => {});
          }}
          onClose={() => setFolderToCreate(null)}
        />
      ) : null}

      {folderToRename ? (
        <PromptSheet
          title="Rename this folder"
          initialValue={folderToRename.name}
          confirmLabel="Rename"
          maxLength={FOLDER_NAME_LIMIT}
          onSubmit={value => {
            const name = value.trim();
            if (name) connection.send(encodeFolderRename(folderToRename.id, name)).catch(() => {});
          }}
          onClose={() => setFolderToRename(null)}
        />
      ) : null}

      {folderMenu ? (
        <ActionSheet
          preview={folderMenu.name}
          options={[
            {
              label: 'Rename',
              icon: <PencilIcon size={15} tone="muted" />,
              onPress: () => {
                setFolderToRename(folderMenu);
                setFolderMenu(null);
              },
            },
            {
              label: 'Delete folder',
              icon: <TrashIcon size={15} tone="danger" />,
              onPress: () => {
                setFolderToDelete(folderMenu);
                setFolderMenu(null);
              },
            },
            { label: 'Cancel', onPress: () => setFolderMenu(null) },
          ]}
          onClose={() => setFolderMenu(null)}
        />
      ) : null}

      {folderToDelete ? (
        <ActionSheet
          // A folder holds nothing: the conversations in it are the ones already listed, and they
          // outlive it. The question says so before the answer is given.
          preview={`Delete the folder ${folderToDelete.name}? Its conversations stay in the list.`}
          options={[
            {
              label: 'Delete',
              icon: <TrashIcon size={15} tone="danger" />,
              danger: true,
              onPress: () => {
                connection.send(encodeFolderRemove(folderToDelete.id)).catch(() => {});
                setFolderToDelete(null);
              },
            },
            { label: 'Cancel', onPress: () => setFolderToDelete(null) },
          ]}
          onClose={() => setFolderToDelete(null)}
        />
      ) : null}

      {threadToFile ? (
        <ActionSheet
          preview={`Move "${threadToFile.title}" to`}
          options={[
            ...folders.map(folder => ({
              label: folder.name,
              icon: <FolderIcon size={15} tone="muted" />,
              hint: folder.id === threadToFile.folderId ? 'current' : undefined,
              onPress: () => {
                fileThread(threadToFile.threadId, folder.id);
                setThreadToFile(null);
              },
            })),
            {
              label: 'No folder',
              icon: <FolderIcon size={15} tone="muted" />,
              hint: threadToFile.folderId ? undefined : 'current',
              onPress: () => {
                fileThread(threadToFile.threadId, null);
                setThreadToFile(null);
              },
            },
            { label: 'Cancel', onPress: () => setThreadToFile(null) },
          ]}
          onClose={() => setThreadToFile(null)}
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
              icon: <TrashIcon size={15} tone="danger" />,
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
              icon: <TrashIcon size={15} tone="danger" />,
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

      {jobsOpen ? (
        <PageCloseContext.Provider value={jobsClose}>
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
              deleting={jobToDelete !== null}
            />
          ) : null}
        </PageCloseContext.Provider>
      ) : null}

      {jobToDelete ? (
        <ActionSheet
          preview={`Delete "${jobToDelete.name}"? The task stops running, its output stays on the server.`}
          options={[
            {
              label: 'Delete',
              icon: <TrashIcon size={15} tone="danger" />,
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

      {/* The menus a small control opens (a download arrow in a row, a chip, a viewer's bar), and
          the line that says what they did: over everything, the selection viewer included. */}
      <OverlayHost />
    </SafeAreaView>
    </PageCloseContext.Provider>
    </TextSelectionContext.Provider>
  );
}

const createStyles = (palette: Palette) => ({
  safe: { flex: 1, minHeight: 0, backgroundColor: palette.bg },
  shell: { flex: 1, minHeight: 0, overflow: 'hidden' as const, flexDirection: 'row' as const },
  container: {
    flex: 1,
    minHeight: 0,
    // A column in a row: without this a wide conversation pushes the list off the screen.
    minWidth: 0,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  containerSplit: { flexDirection: 'row' as const },
  chatPane: { flex: 1, minWidth: 0, minHeight: 0 },
  chatWrap: { flex: 1, minWidth: 0 },
  pageFull: { flex: 1 },
});
