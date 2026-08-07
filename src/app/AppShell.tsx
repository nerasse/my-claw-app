import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
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
  encodeChatSend,
  encodeChatStop,
  encodeCommandsList,
  encodeDiagSnapshot,
  encodeFileDelete,
  encodeFilesList,
  encodeLogsTail,
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
  encodeWorkspacesList,
  encodeVoiceModeGet,
  encodeVoiceModeSet,
  MAX_TITLE_LENGTH,
  type ApprovalRequestFrame,
  type AgentsConfigResultFrame,
  type LogsTailQuery,
  type SessionFileMeta,
  type SessionSummary,
  type SkillEntry,
  type ToolEntry,
  type VoiceMode,
  type VoiceModeResultFrame,
  type WorkspaceEntry,
} from '../core/protocol';
import { modelStore, useModelCatalog, useThreadModel } from '../core/model';
import { agentsStore, useAgentsConfig } from '../core/agents';
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
import { AgentsSettingsScreen } from './AgentsSettingsScreen';
import { AgentDetailScreen } from './AgentDetailScreen';
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
import { Drawer } from './Drawer';
import { PromptSheet } from '../components/PromptSheet';
import { ActionSheet, type SheetOption } from '../components/ActionSheet';
import { ModelSheet, ModelPickerSheet } from '../components/ModelSheet';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useThemeControl } from '../theme/ThemeProvider';

const HISTORY_LIMIT = 50;

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
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
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
  const instructions = useInstructions();
  const agentsConfig = agentsState.config;
  const streaming = items.some(item => item.kind === 'text' && item.streaming);

  // Frame handlers run outside React: they need the thread on screen right now, not the one
  // captured when the listener was registered.
  const activeThreadRef = useRef<string | null>(null);
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
          setToolsError(null);
          break;
        case 'workspaces.list.result':
          setWorkspaces(frame.workspaces);
          break;
        case 'model.result':
          modelStore.replaceThread(frame);
          break;
        case 'agents.config.result':
          agentsStore.receive(frame);
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
          chatStore.addCommandResult(
            frame.threadId,
            `cmd-${frame.replyToId ?? 'x'}-${Date.now()}`,
            frame.text,
            frame.replyToId,
          );
          noteActivity(frame.threadId, frame.text);
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
            } else if (frame.scope === 'agents') {
              agentsStore.fail(frame.message);
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
        if (settingsPage === 'instruction') {
          instructionsStore.closeEditor();
          setSettingsPage('instructions');
          return true;
        }
        if (settingsPage === 'instructions') {
          setSettingsPage(instructionsFrom === 'agent' ? 'agent' : 'index');
          return true;
        }
        if (settingsPage === 'diagnostics' || settingsPage === 'workspaces') {
          setSettingsPage('general');
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
    modelOpen,
    modelPath,
    selectThread,
    settingsOpen,
    settingsPage,
    skillViewer,
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

  // Same for the tools page: it is the only surface that shows the catalog, and plugins and
  // disabled tools change under hot-reload, so a list from earlier can already be wrong.
  useEffect(() => {
    if (!settingsOpen || settingsPage !== 'tools') return;
    connection.send(encodeToolsList()).catch(() => {});
  }, [settingsOpen, settingsPage]);

  // The agent defaults are asked for when the Agents page opens. A server that predates the
  // frames answers nothing at all (unknown frames are dropped silently), so the store flips to
  // "unsupported" after a beat instead of spinning forever.
  useEffect(() => {
    if (!settingsOpen || (settingsPage !== 'agents' && settingsPage !== 'agent')) return;
    agentsStore.request();
    connection.send(encodeAgentsConfigGet()).catch(() => {});
    const timer = setTimeout(() => agentsStore.markUnsupported(), 4000);
    return () => clearTimeout(timer);
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

  // Diagnostics is a page under General, not a screen of its own: reached from settings, the
  // back key has to land back on General instead of dropping the user two levels down.
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

  const threadActions: SheetOption[] = threadMenu
    ? [
        {
          label: 'Rename',
          onPress: () => {
            // Handing the menu straight to the sheet: closing first would drop the thread it
            // was opened for, and the sheet needs the current name to start from.
            setThreadToRename(threadMenu);
            setThreadMenu(null);
          },
        },
        threadMenu.archived
          ? {
              label: 'Unarchive',
              hint: 'put it back in the conversation list',
              onPress: () => setThreadArchived(threadMenu.threadId, false),
            }
          : {
              label: 'Archive',
              hint: 'file it away, nothing is deleted',
              onPress: () => setThreadArchived(threadMenu.threadId, true),
            },
        {
          label: 'Delete',
          danger: true,
          onPress: () => deleteThread(threadMenu.threadId),
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
        default:
          return false;
      }
    },
    [newThread, openModel, sessions],
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
    ...(activeThread
      ? [
          {
            label: 'Rename conversation…',
            onPress: () => {
              setThreadToRename({
                threadId: activeThread,
                title: sessionStore.titleOf(activeThread) ?? '',
                messageCount: 0,
                createdAt: '',
                lastActiveAt: '',
              });
              setCommandMenuOpen(false);
            },
          } satisfies SheetOption,
          {
            label: 'Archive',
            hint: 'file it away, nothing is deleted',
            onPress: () => {
              setThreadArchived(activeThread, true);
              setCommandMenuOpen(false);
            },
          } satisfies SheetOption,
          {
            label: 'Delete conversation',
            danger: true,
            onPress: () => {
              setConfirmDelete(activeThread);
              setCommandMenuOpen(false);
            },
          } satisfies SheetOption,
        ]
      : []),
    // New conversations live on the + in the drawer (and the /new command); Files has its
    // own header button. This menu stays for what acts on the conversation in front of you.
  ];

  const title =
    (activeThread ? sessionStore.titleOf(activeThread) : null) ??
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
                themeMode={themeControl.mode}
                onThemeModeChange={themeControl.setMode}
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
                onOpenDiagnostics={openDiagnostics}
                onOpenWorkspaces={() => setSettingsPage('workspaces')}
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
                />
              ) : (
                agentsPage
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
                onBack={() => setSettingsPage('general')}
              />
            ) : settingsPage === 'diagnostics' ? (
              <DiagnosticsScreen
                snapshot={diagSnapshot}
                logs={diagLogs}
                lastRun={lastRun}
                busy={diagBusy}
                onSnapshot={openDiagnostics}
                onLogs={fetchLogs}
                onBack={() => setSettingsPage('general')}
              />
            ) : settingsPage === 'tools' ? (
              <ToolsScreen
                tools={tools}
                error={toolsError ?? undefined}
                onBack={() => setSettingsPage('index')}
              />
            ) : settingsPage === 'mcps' ? (
              <EmptyCategoryScreen title="MCPs" onBack={() => setSettingsPage('index')} />
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
          preview={`Default effort — current: ${agentsConfig.defaultEffort || 'not set'}`}
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
