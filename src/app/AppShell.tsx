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
  useUnreadThreads,
  type TextItem,
} from '../core/chat';
import { sessionStore, useArchivedSessions, useSessions } from '../core/sessions';
import { commandStore } from '../core/commands';
import { prefs } from '../core/prefs';
import {
  encodeApprovalResponse,
  encodeAgentsConfigGet,
  encodeInstructionsGet,
  encodeInstructionsGetNested,
  encodeInstructionsList,
  encodeInstructionsSet,
  encodeAgentsEffortSet,
  encodeAgentsModelClear,
  encodeAgentsModelSet,
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
  encodeSessionUnarchive,
  encodeSkillsList,
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
  type JobRunEntry,
  type JobFieldsOut,
  type LogsTailQuery,
  type McpEntry,
  type SessionFileMeta,
  type SessionSummary,
  type SkillEntry,
  type ToolEntry,
  type VoiceMode,
  type VoiceModeResultFrame,
  type WorkspaceEntry,
  encodeNotificationsRegister,
  encodeNotificationsState,
} from '../core/protocol';
import {
  parseNotificationLink,
  pushSupported,
  registerForPush,
  subscribeToPushRegistration,
} from '../core/notifications';
import { modelStore, useModelCatalog, useThreadModel } from '../core/model';
import { jobsStore } from '../core/jobs';
import { agentsStore, useAgentsConfig } from '../core/agents';
import { agentsFileStore, useAgentsFile } from '../core/agentsFile';
import { instructionsStore, useInstructions } from '../core/instructions';
import { InstructionsScreen } from './InstructionsScreen';
import { InstructionEditorScreen } from './InstructionEditorScreen';
import { skillUrl } from '../core/skills';
import { getDeviceInfo, type DeviceInfo } from '../core/device';
import type { OutgoingAttachment } from '../core/upload';
import type { WsStatusPayload } from '../core/types';
import { httpOrigin, uuid } from '../core/utils';
import { ChatScreen } from './ChatScreen';
import { SettingsScreen } from './SettingsScreen';
import { GeneralSettingsScreen } from './GeneralSettingsScreen';
import { OtherSettingsScreen } from './OtherSettingsScreen';
import { AgentsSettingsScreen } from './AgentsSettingsScreen';
import { AgentDetailScreen } from './AgentDetailScreen';
import { AgentFileScreen } from './AgentFileScreen';
import { ScopeEditorScreen, type ScopeMode } from './ScopeEditorScreen';
import { WorkspacePickerScreen } from './WorkspacePickerScreen';
import { NumberEditorScreen } from './NumberEditorScreen';
import { NewAgentScreen } from './NewAgentScreen';
import { McpsScreen } from './McpsScreen';
import { ConfigScreen, type ConfigEditorState } from './ConfigScreen';
import { ProvidersScreen } from './ProvidersScreen';
import { ProviderScreen } from './ProviderScreen';
import { EmptyCategoryScreen } from './EmptyCategoryScreen';
import { SkillsScreen } from './SkillsScreen';
import { ToolsScreen } from './ToolsScreen';
import { SkillViewer } from './SkillViewer';
import { WorkspacesScreen } from './WorkspacesScreen';
import { FilesScreen } from './FilesScreen';
import { ImageViewer } from './ImageViewer';
import { TextViewer } from './TextViewer';
import { DiagnosticsScreen } from './DiagnosticsScreen';
import { ArchivesScreen } from './ArchivesScreen';
import { StatusScreen } from './StatusScreen';
import { JobsScreen } from './JobsScreen';
import { JobsEditorScreen } from './JobsEditorScreen';
import { JobSessionsScreen } from './JobSessionsScreen';
import { Drawer } from './Drawer';
import { PromptSheet } from '../components/PromptSheet';
import { ActionSheet, type SheetOption } from '../components/ActionSheet';
import { ModelSheet, ModelPickerSheet } from '../components/ModelSheet';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useThemeControl } from '../theme/ThemeProvider';
import { statusStore } from '../core/status';

const HISTORY_LIMIT = 50;

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
 * The model picker pointed at the server config instead of a session: "global" edits
 * llm.defaultModel, an agent key edits agents.<key>.llm. The root option hands an agent back
 * to its inheritance (clear), which is the "Use default" of the chat picker in reverse.
 */
function AgentModelPickerSheet({
  target,
  config,
  path,
  onPathChange,
  onClose,
}: {
  /** "global" or an agent key. */
  target: string;
  config: AgentsConfigResultFrame | null;
  path: string[];
  onPathChange: (path: string[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const agent = target === 'global' ? null : config?.agents.find(entry => entry.key === target) ?? null;
  const activeId = agent ? agent.model : config?.defaultModel ?? '';
  const defaultLabel =
    catalog.models.find(model => model.id === config?.defaultModel)?.label ??
    config?.defaultModel ??
    'global default';
  const orchestratorLabel =
    config?.agents.find(entry => entry.key === 'orchestrator')?.model ?? defaultLabel;

  return (
    <ModelPickerSheet
      title={agent ? `Model for ${agent.label}` : 'Default model'}
      models={catalog.models}
      activeId={activeId}
      path={path}
      onPathChange={onPathChange}
      onClose={onClose}
      onSelect={modelId => {
        connection.send(encodeAgentsModelSet(target, modelId)).catch(() => {});
      }}
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
              },
            }
          : null
      }
      effort={null}
    />
  );
}

export function AppShell(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette, dark } = useTheme();
  const themeControl = useThemeControl();

  const [url, setUrl] = useState(prefs.get().serverUrl);
  const [status, setStatus] = useState<WsStatusPayload>({ state: 'idle' });
  const [pending, setPending] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
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
    | 'skills'
    | 'workspaces'
    | 'instructions'
    | 'instruction'
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
  >('index');
  /** The agent detail page shows this key, taken from the last agents.config.result. */
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  /** The provider page shows this key's models, filtered from the shared catalog. */
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  /** Instructions is a top-level category, but the agent page links into it: back has to return
   *  where the user came from rather than dropping them at the index. */
  const [instructionsFrom, setInstructionsFrom] = useState<'index' | 'agent'>('index');
  /** The model picker is open for "global" or an agent key: its group stack, walked by back. */
  const [agentModelFor, setAgentModelFor] = useState<string | null>(null);
  const [agentModelPath, setAgentModelPath] = useState<string[]>([]);
  const [agentsEffortOpen, setAgentsEffortOpen] = useState(false);
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
  const [newAgentBusy, setNewAgentBusy] = useState(false);
  const [configEditor, setConfigEditor] = useState<ConfigEditorState | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspacesBusy, setWorkspacesBusy] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillViewer, setSkillViewer] = useState<{
    url: string;
    skill: SkillEntry;
  } | null>(null);
  const [voice, setVoice] = useState<VoiceModeResultFrame | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<SessionFileMeta | null>(null);
  const [imageViewer, setImageViewer] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [textViewer, setTextViewer] = useState<{
    url: string;
    filename: string;
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
  const [modelPath, setModelPath] = useState<string[]>([]);
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
  const sessions = useSessions();
  const archivedSessions = useArchivedSessions();
  const unread = useUnreadThreads();
  const mediaBase = useMemo(() => httpOrigin(url), [url]);
  const catalog = useModelCatalog();
  const threadModel = useThreadModel(activeThread);
  const agentsState = useAgentsConfig();
  const agentsFile = useAgentsFile();
  const instructions = useInstructions();
  const agentsConfig = agentsState.config;
  const streaming = items.some(item => item.kind === 'text' && item.streaming);

  // Frame handlers run outside React: they need the thread on screen right now, not the one
  // captured when the listener was registered.
  const activeThreadRef = useRef<string | null>(null);
  // The server's push key, kept for a re-registration after the distributor rotates the
  // endpoint (the "registered" event can fire long after the frame that triggered it).
  const vapidRef = useRef<string | null>(null);
  // A run opened from the job's runs page goes back there, like the archives flow.
  const fromJobSessionsRef = useRef(false);
  // Where the thread on screen came from: the hardware back press sends a conversation
  // opened from the archived list back to that list, instead of exiting the app.
  const fromArchivesRef = useRef(false);
  const selectThread = useCallback((threadId: string | null) => {
    activeThreadRef.current = threadId;
    setActiveThread(threadId);
    prefs.set('lastThreadId', threadId);
  }, []);

  const openThread = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      chatStore.markRead(threadId);
      setAutoFocusHero(false);
      setDrawerOpen(false);
      setSettingsOpen(false);
      setArchivesOpen(false);
      connection.send(encodeSessionHistory(threadId, HISTORY_LIMIT));
      // The model of a conversation is per session: refresh it when the thread changes, so
      // the picker never shows the previous conversation's choice.
      connection.send(encodeModelGet(threadId));
    },
    [selectThread],
  );

  const newThread = useCallback(() => {
    fromArchivesRef.current = false;
    selectThread(uuid());
    // The composer is the whole screen on a fresh thread: focus it, but only from the + tap,
    // never when the app boots into an empty list.
    setAutoFocusHero(true);
    setDrawerOpen(false);
    setSettingsOpen(false);
  }, [selectThread]);

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
      sessionStore.ensure(threadId, text);
    };

    const offState = connection.onState(next => {
      setStatus(next);
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
        case 'chat.message':
          chatStore.addAgentMessage(
            frame.threadId,
            frame.id,
            frame.text,
            frame.attachments,
            frame.replyToId,
          );
          noteActivity(frame.threadId, frame.text);
          break;
        case 'chat.stream.start':
          chatStore.startStream(frame.threadId, frame.id, frame.replyToId);
          noteActivity(frame.threadId, '');
          break;
        case 'chat.stream.delta':
          chatStore.appendDelta(frame.threadId, frame.id, frame.text);
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
          // Land straight in a conversation instead of an empty screen, but never in one the
          // owner filed away: those are only reached from the archived list.
          if (!activeThreadRef.current) {
            const first = frame.sessions.find(summary => !summary.archived);
            if (first) openThread(first.threadId);
            else selectThread(uuid());
          }
          break;
        case 'commands.list.result':
          commandStore.replace(frame.commands);
          break;
        case 'diag.snapshot.result':
          setDiagSnapshot(frame.text);
          setDiagBusy(false);
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
          chatStore.seedHistory(frame.threadId, frame.messages);
          chatStore.markRead(frame.threadId);
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
        case 'chat.command.result':
          if (frame.status) {
            // A /status answered by the server: the page replaces the bubble, so the report
            // never takes space in the conversation.
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

    getDeviceInfo()
      .then(setDeviceInfo)
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
        // The picker's groups are a stack of their own: back walks out of a group before it
        // closes the sheet, which otherwise threw away the whole menu on the first press.
        if (modelPath.length > 0) {
          setModelPath(current => current.slice(0, -1));
          return true;
        }
        setModelOpen(false);
        return true;
      }
      if (agentsEffortOpen) {
        setAgentsEffortOpen(false);
        return true;
      }
      if (agentModelFor) {
        if (agentModelPath.length > 0) {
          setAgentModelPath(current => current.slice(0, -1));
          return true;
        }
        setAgentModelFor(null);
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
        if (settingsPage === 'agent') {
          setSettingsPage('agents');
          return true;
        }
        if (settingsPage === 'provider') {
          setSettingsPage('providers');
          return true;
        }
        if (settingsPage === 'providers') {
          setSettingsPage('agents');
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
          setSettingsPage('agent');
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
        if (settingsPage === 'instruction') {
          instructionsStore.closeEditor();
          setSettingsPage('instructions');
          return true;
        }
        if (settingsPage === 'instructions') {
          setSettingsPage(instructionsFrom === 'agent' ? 'agent' : 'index');
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
    agentModelPath,
    agentsEffortOpen,
    archivesOpen,
    bubbleMenu,
    commandMenuOpen,
    drawerOpen,
    fileToDelete,
    filesOpen,
    imageViewer,
    instructionsFrom,
    jobSessions,
    jobsEditor,
    jobsOpen,
    modelOpen,
    modelPath,
    scopeEditor,
    selectThread,
    settingsOpen,
    settingsPage,
    skillViewer,
    statusOpen,
    textViewer,
    threadMenu,
    threadToRename,
  ]);

  const sendChat = useCallback(
    async (text: string, attachments?: OutgoingAttachment[]) => {
      const threadId = activeThreadRef.current ?? uuid();
      if (!activeThreadRef.current) selectThread(threadId);
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
      );
      const isVoiceNote = attachments?.some(attachment => attachment.audioAsVoice) ?? false;
      sessionStore.ensure(threadId, text || (isVoiceNote ? '(voice message)' : '(attachment)'));
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
        ),
      );
      if (!delivered) chatStore.markSendFailed(threadId, id);
    },
    [selectThread],
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
        connection.send(encodeNotificationsRegister({ endpoint: '' })).catch(() => {});
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
  // catalogs as the settings pages: ask for them when the jobs page opens too.
  useEffect(() => {
    if (!jobsOpen) return;
    connection.send(encodeSkillsList()).catch(() => {});
    connection.send(encodeToolsList()).catch(() => {});
    connection.send(encodeMcpList()).catch(() => {});
    connection.send(encodeWorkspacesList()).catch(() => {});
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

  // The workspaces page owns the CRUD: asked for on every visit, like the other lists, because
  // config.workspaces hot-reloads under it.
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

  // The MCP list is the wire version of /mcp: asked for on the MCPs page and alongside the
  // agent pages, where the scope editor and the file editor offer its names.
  useEffect(() => {
    if (!settingsOpen) return;
    if (settingsPage !== 'mcps' && settingsPage !== 'agents' && settingsPage !== 'agent' && settingsPage !== 'file') return;
    connection.send(encodeMcpList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The agent defaults are asked for when the Agents page opens. A server that predates the
  // frames answers nothing at all (unknown frames are dropped silently), so the store flips to
  // "unsupported" after a beat instead of spinning forever.
  useEffect(() => {
    if (!settingsOpen || (settingsPage !== 'agents' && settingsPage !== 'agent')) return;
    agentsStore.request();
    connection.send(encodeAgentsConfigGet()).catch(() => {});
    // The scope editor and the workspace picker need the dynamic lists too: they are the whole
    // point of the page. The skills list doubles as the catalog those editors check names against.
    connection.send(encodeSkillsList()).catch(() => {});
    connection.send(encodeWorkspacesList()).catch(() => {});
    const timer = setTimeout(() => agentsStore.markUnsupported(), 4000);
    return () => clearTimeout(timer);
  }, [settingsOpen, settingsPage]);

  // The agent file editor asks for its file when the page opens; a stale sha answers a conflict.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'file' || !selectedAgent) return;
    agentsFileStore.open(selectedAgent);
    connection.send(encodeAgentFileGet(selectedAgent)).catch(() => {});
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
  useEffect(() => {
    if (!settingsOpen || (settingsPage !== 'providers' && settingsPage !== 'provider')) return;
    connection.send(encodeModelList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // Same guard as the agents page: a server without the instructions frames answers nothing,
  // and the page must say so rather than spin. The list is re-asked on every visit because the
  // agent edits AGENTS.md too, so a list from ten minutes ago can already be wrong.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'instructions') return;
    instructionsStore.request();
    connection.send(encodeInstructionsList()).catch(() => {});
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
    setModelPath([]);
    setModelOpen(true);
  }, []);

  const fetchLogs = useCallback((query: LogsTailQuery) => {
    setDiagBusy(true);
    connection.send(encodeLogsTail(query));
  }, []);

  const openFiles = useCallback(() => {
    const threadId = activeThreadRef.current;
    if (!threadId) return;
    setFilesOpen(true);
    connection.send(encodeFilesList(threadId));
  }, []);

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
    (target: SessionSummary, close: () => void): SheetOption[] => [
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
    [openStatus, setThreadArchived],
  );

  const threadActions: SheetOption[] = threadMenu
    ? conversationActions(threadMenu, () => setThreadMenu(null))
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

  const commandMenuOptions: SheetOption[] = [
    {
      label: 'Model…',
      hint: currentModelLabel ? `current: ${currentModelLabel}` : undefined,
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
          } satisfies SheetOption,
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
    // New conversations live on the + in the drawer (and the /new command); Files has its
    // own header button. This menu stays for what acts on the conversation in front of you.
  ];

  const title =
    (activeThread ? runTitlesRef.current[activeThread] ?? sessionStore.titleOf(activeThread) : null) ??
    'new conversation';
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
  const providerModels = selectedProvider
    ? catalog.models.filter(
        model => (model.provider ?? agentsConfig?.defaultProvider) === selectedProvider,
      )
    : [];
  const openInstruction = (workspace: string, file: string): void => {
    instructionsStore.openEditor(workspace, file);
    setSettingsPage('instruction');
    connection.send(encodeInstructionsGet(workspace, file)).catch(() => {});
  };
  const instructionsPage = (
    <InstructionsScreen
      entries={instructions.entries}
      nested={instructions.nested}
      status={instructions.status}
      error={instructions.error}
      backLabel={instructionsFrom === 'agent' ? 'Back to agent' : 'Back to settings'}
      onBack={() => setSettingsPage(instructionsFrom === 'agent' ? 'agent' : 'index')}
      onOpen={entry => openInstruction(entry.workspace, entry.file)}
      onOpenNested={item => {
        instructionsStore.openEditor(item.workspace, item.path);
        setSettingsPage('instruction');
        connection.send(encodeInstructionsGetNested(item.workspace, item.path)).catch(() => {});
      }}
    />
  );
  // Both pages double as the fallback when a detail page has no subject yet (config not loaded,
  // or a key that no longer exists), so they are built once here.
  const agentsPage = (
    <AgentsSettingsScreen
      config={agentsConfig}
      status={agentsState.status}
      error={agentsState.error}
      onBack={() => setSettingsPage('index')}
      onOpenDefaultModel={() => {
        setAgentModelPath([]);
        setAgentModelFor('global');
      }}
      onOpenDefaultEffort={() => setAgentsEffortOpen(true)}
      onOpenProviders={() => setSettingsPage('providers')}
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
      onBack={() => setSettingsPage('agents')}
      onOpenProvider={key => {
        setSelectedProvider(key);
        setSettingsPage('provider');
      }}
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
                onBack={() => setSettingsOpen(false)}
                onOpenCategory={category => {
                  // Reaching a category from the index resets where its back button leads: a
                  // previous visit from the agent page must not keep sending it there.
                  if (category === 'instructions') setInstructionsFrom('index');
                  setSettingsPage(category);
                }}
              />
            ) : settingsPage === 'general' ? (
              <GeneralSettingsScreen
                url={url}
                onUrlChange={changeUrl}
                voice={voice}
                onVoiceModeChange={changeVoiceMode}
                status={status}
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
            ) : settingsPage === 'instructions' ? (
              instructionsPage
            ) : settingsPage === 'instruction' ? (
              instructions.editor ? (
                <InstructionEditorScreen
                  editor={instructions.editor}
                  maxBytes={instructions.maxBytes}
                  onBack={() => {
                    instructionsStore.closeEditor();
                    setSettingsPage('instructions');
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
                instructionsPage
              )
            ) : settingsPage === 'providers' ? (
              providersPage
            ) : settingsPage === 'provider' ? (
              selectedProviderInfo ? (
                <ProviderScreen
                  provider={selectedProviderInfo}
                  models={providerModels}
                  defaultModel={agentsConfig?.defaultModel ?? ''}
                  error={agentsState.error}
                  onSetDefault={modelId => {
                    connection.send(encodeAgentsModelSet('global', modelId)).catch(() => {});
                  }}
                  onBack={() => setSettingsPage('providers')}
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
                    setAgentModelPath([]);
                    setAgentModelFor(selectedAgent);
                  }}
                  onOpenInstructions={() => {
                    setInstructionsFrom('agent');
                    setSettingsPage('instructions');
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
                  available={
                    scopeEditor.kind === 'skills'
                      ? skills.map(s => ({ name: s.name, description: s.description }))
                      : mcpServers.map(s => ({
                          name: s.name,
                          description: `${s.transport} · ${s.state}${s.state === 'failed' ? ` · ${s.lastError ?? ''}` : ''}`,
                        }))
                  }
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
              ) : (
                agentsPage
              )
            ) : settingsPage === 'file' ? (
              agentsFile.editor ? (
                <AgentFileScreen
                  editor={agentsFile.editor}
                  skills={skills.map(s => ({ name: s.name, description: s.description }))}
                  mcpServers={mcpServers.map(s => ({ name: s.name, description: `${s.transport} · ${s.state}` }))}
                  error={agentsFile.error}
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
                onBack={() => setSettingsPage('index')}
                onOpenSkill={skill => {
                  if (!deviceInfo) return;
                  setSkillViewer({
                    url: skillUrl(mediaBase, deviceInfo, skill.source, skill.name, skill.workspace),
                    skill,
                  });
                }}
              />
            ) : settingsPage === 'workspaces' ? (
              <WorkspacesScreen
                workspaces={workspaces}
                error={workspacesError}
                busy={workspacesBusy}
                onBack={() => setSettingsPage('index')}
                onAdd={(key, path) => {
                  setWorkspacesBusy(true);
                  connection.send(encodeWorkspacesAdd(key, path)).catch(() => {});
                }}
                onRemove={key => {
                  setWorkspacesBusy(true);
                  connection.send(encodeWorkspacesRemove(key)).catch(() => {});
                }}
                onRename={(from, to) => {
                  setWorkspacesBusy(true);
                  connection.send(encodeWorkspacesRename(from, to)).catch(() => {});
                }}
                onSetPath={(key, path) => {
                  setWorkspacesBusy(true);
                  connection.send(encodeWorkspacesSetPath(key, path)).catch(() => {});
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
              onOpenThread={threadId => {
                fromArchivesRef.current = true;
                openThread(threadId);
              }}
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
            />
          ) : (
            <ChatScreen
              threadId={activeThread ?? ''}
              title={title}
              subtitle={subtitle}
              connectionState={status.state}
              items={items}
              mediaBase={mediaBase}
              deviceInfo={deviceInfo}
              hint={hint}
              autoFocusHero={autoFocusHero}
              onOpenDrawer={() => setDrawerOpen(true)}
              onStatusPress={openSettings}
              onFilesPress={openFiles}
              onSend={sendChat}
              onBubbleMenu={setBubbleMenu}
              onOpenImage={setImageViewer}
              onOpenText={setTextViewer}
              onOpenMenu={() => setCommandMenuOpen(true)}
              onCommandEntered={dispatchCommand}
              streaming={streaming}
              onStop={() => {
                if (activeThread) connection.send(encodeChatStop(activeThread));
              }}
              onNewThread={newThread}
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
        onOpenThread={threadId => {
          fromArchivesRef.current = false;
          openThread(threadId);
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

      {skillViewer ? (
        <SkillViewer
          url={skillViewer.url}
          skill={skillViewer.skill}
          onClose={() => setSkillViewer(null)}
        />
      ) : null}

      {bubbleMenu ? (
        <ActionSheet
          preview={bubbleMenu.text}
          options={[
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

      {modelOpen ? (
        <ModelSheet
          threadId={activeThread}
          path={modelPath}
          onPathChange={setModelPath}
          onClose={() => setModelOpen(false)}
        />
      ) : null}

      {agentModelFor ? (
        <AgentModelPickerSheet
          target={agentModelFor}
          config={agentsConfig}
          onPathChange={setAgentModelPath}
          path={agentModelPath}
          onClose={() => setAgentModelFor(null)}
        />
      ) : null}

      {agentsEffortOpen && agentsConfig ? (
        <ActionSheet
          preview={`Default effort · current: ${agentsConfig.defaultEffort || 'not set'}`}
          options={[
            ...agentsConfig.effortLevels.map(level => ({
              label: level,
              selected: level === agentsConfig.defaultEffort,
              onPress: () => {
                connection.send(encodeAgentsEffortSet(level)).catch(() => {});
              },
            })),
            {
              label: 'Not set',
              selected: agentsConfig.defaultEffort === '',
              onPress: () => {
                connection.send(encodeAgentsEffortSet('')).catch(() => {});
              },
            },
          ]}
          onClose={() => setAgentsEffortOpen(false)}
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
            onEdit={job => {
              setJobsError(null);
              setJobsEditor(job);
            }}
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
