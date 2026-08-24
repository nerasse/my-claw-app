import { connection } from './connection';
import { chatStore } from './chat';
import { subAgentStore } from './subagents';
import { sessionStore } from './sessions';
import { commandStore } from './commands';
import { acknowledgeDiagnostics } from './diagnostics';
import { devicesStore } from './devices';
import { modelStore } from './model';
import { jobsStore } from './jobs';
import { agentsStore } from './agents';
import { tagsStore } from './tags';
import { agentsFileStore } from './agentsFile';
import { instructionsStore } from './instructions';
import { sessionInstructionsStore } from './sessionInstructions';
import { providersEnvStore } from './providers';
import { statusStore } from './status';
import { locationPreview } from './locationPreview';
import { applyRemoteDraft } from './drafts';
import { registerForPush } from './notifications';
import { uuid } from './utils';
import {
  encodeAgentsConfigGet,
  encodeModelGet,
  encodeSubAgentsList,
  type ApprovalRequestFrame,
  type ApprovalHistoryResultFrame,
  type ConfigResultFrame,
  type ConfigSavedFrame,
  type JobEntry,
  type JobRunEntry,
  type McpEntry,
  type ServerFrame,
  type SessionFileMeta,
  type SkillEntry,
  type ToolEntry,
  type UpdateResultFrame,
  type UiPrefsResultFrame,
  type VoiceModeResultFrame,
  type WorkspaceEntry,
} from './protocol';

/**
 * A sub-agent handle is a thread id, but it is not a conversation: it must never be listed in the
 * drawer nor restored at boot, because reached that way it would open as a plain chat -- no parent
 * to go back to, and a send with no `parentThreadId`, which a private sub-agent refuses outright.
 */
export function isSubAgentThread(threadId: string): boolean {
  return /^sub-[0-9a-f]{16}$/.test(threadId);
}

/**
 * What the shell hands the router so the frames that touch its own state can be served: the
 * reads it does outside React's render, the navigation, and one entry per piece of local state
 * a frame lands in. Everything a frame does to a store is the router's own business and takes
 * nothing from here.
 */
export interface ServerFrameHandlers {
  /** The thread on screen right now, not the one captured when the listener was registered. */
  activeThreadId: () => string | null;
  /** The parent conversation of the sub-agent on screen, null when a conversation is showing. */
  subagentParent: () => string | null;
  /** The runs page currently open, checked before a late answer is accepted. */
  jobSessionsPage: () => { jobId: string; jobName: string } | null;
  /** Whether a job save or delete is in flight, which is what the fresh listing answers. */
  jobsSaving: () => boolean;
  markJobsSaving: (value: boolean) => void;
  /** Workspace a brand-new thread picked before the server knew the conversation existed. */
  pendingWorkspace: Map<string, string>;
  setRunTitles: (titles: Record<string, string>) => void;
  setVapidKey: (key: string) => void;
  openThread: (threadId: string) => void;
  selectThread: (threadId: string | null) => void;
  setLastRun: (run: string) => void;
  setLocationEnabled: (enabled: boolean) => void;
  setServerVersion: (version: string) => void;
  setDiagSnapshot: (text: string) => void;
  setDiagLogs: (text: string) => void;
  setDiagBusy: (busy: boolean) => void;
  setSessionFiles: (files: SessionFileMeta[]) => void;
  setFilesTotal: (bytes: number) => void;
  setFilesError: (message: string | null) => void;
  setVoice: (frame: VoiceModeResultFrame) => void;
  setUiPrefs: (frame: UiPrefsResultFrame) => void;
  setUpdate: (frame: UpdateResultFrame) => void;
  setSkills: (skills: SkillEntry[]) => void;
  setSkillsError: (message: string | null) => void;
  setTools: (tools: ToolEntry[]) => void;
  setToolsMissing: (missing: string[]) => void;
  setToolsError: (message: string | null) => void;
  setToolsSaving: (saving: boolean) => void;
  setMcpServers: (servers: McpEntry[]) => void;
  setMcpError: (message: string | null) => void;
  setMcpBusy: (busy: boolean) => void;
  setWorkspaces: (workspaces: WorkspaceEntry[]) => void;
  setWorkspacesError: (message: string | null) => void;
  setWorkspacesBusy: (busy: boolean) => void;
  setProviderBusy: (busy: boolean) => void;
  setStatusOpen: (open: boolean) => void;
  setModelOpen: (open: boolean) => void;
  setJobsEditor: (value: JobEntry | 'new' | null) => void;
  setJobsSaving: (saving: boolean) => void;
  setJobsError: (message: string | null) => void;
  setJobRuns: (runs: JobRunEntry[]) => void;
  setRunsError: (message: string | null) => void;
  setApprovals: (update: (current: ApprovalRequestFrame[]) => ApprovalRequestFrame[]) => void;
  setApprovalHistory: (frame: ApprovalHistoryResultFrame) => void;
  /** The raw config editor's state belongs to its page, so its transitions stay in the shell. */
  onConfigResult: (frame: ConfigResultFrame) => void;
  onConfigSaved: (frame: ConfigSavedFrame) => void;
  onConfigError: (message: string) => void;
}

/**
 * Every server frame lands here. Frames that only feed a store are served outright; the ones that
 * touch the shell's own state go through `handlers`.
 */
export function routeServerFrame(frame: ServerFrame, handlers: ServerFrameHandlers): void {
  const {
    activeThreadId,
    subagentParent,
    jobSessionsPage,
    jobsSaving,
    markJobsSaving,
    pendingWorkspace,
    setRunTitles,
    setVapidKey,
    openThread,
    selectThread,
    setLastRun,
    setLocationEnabled,
    setServerVersion,
    setDiagSnapshot,
    setDiagLogs,
    setDiagBusy,
    setSessionFiles,
    setFilesTotal,
    setFilesError,
    setVoice,
    setUiPrefs,
    setUpdate,
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
    onConfigResult,
    onConfigSaved,
    onConfigError,
  } = handlers;

  /** Activity in a thread the user is not reading: badge it and make sure it is listed. */
  const noteActivity = (threadId: string, text: string): void => {
    if (threadId === activeThreadId()) return;
    chatStore.markUnread(threadId);
    if (!isSubAgentThread(threadId)) sessionStore.ensure(threadId, text);
  };

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
      chatStore.clearQueued(frame.threadId);
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
    case 'chat.user':
      chatStore.echoUserMessage(frame.threadId, frame.id, frame.text, frame.attachments ?? [], frame.location);
      // Same treatment as an incoming answer: a conversation started on the phone has to appear
      // in the drawer here before its bubbles can be read.
      noteActivity(frame.threadId, frame.text);
      break;
    case 'chat.run.start':
      chatStore.startRun(frame.threadId);
      break;
    case 'chat.run.end': {
      chatStore.endRun(frame.threadId);
      chatStore.clearQueued(frame.threadId);
      // A run may have spawned sub-agents; the roster is refetched at its end rather than
      // pushed, which keeps the counter honest without a live push path.
      const parent = subagentParent() ?? activeThreadId();
      if (parent) connection.send(encodeSubAgentsList(parent)).catch(() => {});
      // The turn that just landed is what filled the window: the header's share of context is
      // read back from the server here rather than guessed from the bubbles on screen. Same
      // frame as the one the picker uses, so a run that switched model refreshes that too.
      if (frame.threadId === activeThreadId()) {
        connection.send(encodeModelGet(frame.threadId)).catch(() => {});
      }
      break;
    }
    case 'subagents.list.result':
      subAgentStore.receive(frame);
      chatStore.reconcileSpawnRoster(frame.threadId, frame.agents);
      break;
    case 'device.list.result':
      devicesStore.onList(frame);
      break;
    case 'device.revoke.result':
      devicesStore.onRevoked(frame);
      break;
    case 'device.pair.info':
      devicesStore.onPairInfo(frame);
      break;
    case 'device.pair.result':
      // A lookup that found nothing answers with a result rather than an info frame; the
      // screen has to leave its spinner and say why.
      if (!frame.ok && !frame.deviceId) devicesStore.onPairError(frame.error ?? 'unknown');
      else devicesStore.onPairResult(frame);
      break;
    case 'chat.stream.start':
      // The agent is answering, so no command result is coming: a placeholder left by a
      // command this server does not know would sit there forever.
      chatStore.clearCommandPending(frame.threadId);
      // Whatever it was waiting for is over: the run is writing.
      chatStore.clearQueued(frame.threadId);
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
    case 'chat.tool.start':
      // A tool began executing: open the card with a spinner. The `chat.tool` that follows reuses
      // the same id and fills the output, upserting in place.
      chatStore.startToolCall(frame.threadId, frame.id, frame.name, frame.args);
      break;
    case 'chat.tool.delta':
      // Live output from a running tool (bash): append to the card the start frame opened.
      chatStore.appendToolOutput(frame.threadId, frame.id, { stdout: frame.stdout, stderr: frame.stderr });
      break;
    case 'chat.spawn.start':
      // A sub-agent spawned mid-run: mark the spawn card (or open a standalone one) as running.
      chatStore.startSpawn(frame.threadId, frame.id, {
        subagentId: frame.subagentId,
        displayName: frame.displayName,
        type: frame.agentType,
        mode: frame.mode,
        action: frame.action,
      });
      break;
    case 'chat.spawn.end':
      // The sub-agent finished/errored/was aborted: settle the card.
      chatStore.settleSpawn(frame.threadId, frame.id, {
        subagentId: frame.subagentId,
        status: frame.status,
        ...(frame.resultLength !== undefined ? { resultLength: frame.resultLength } : {}),
        ...(frame.error ? { error: frame.error } : {}),
      });
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
        ...(frame.spawn ? { spawn: frame.spawn } : {}),
      });
      break;
    case 'session.list.result':
      sessionStore.replace(frame.sessions);
      // The server now owns these conversations: their optimistic workspace values are
      // superseded by the listing's own (authoritative) field.
      for (const threadId of pendingWorkspace.keys()) {
        if (sessionStore.has(threadId)) pendingWorkspace.delete(threadId);
      }
      // The server's run view survives a reconnect mid-run: flags it missed (or lost)
      // come back through the list, so the Stop button reappears without a new token.
      chatStore.seedRuns(frame.sessions.filter(session => session.activeRun).map(session => session.threadId));
      // Land straight in a conversation instead of an empty screen, but never in one the
      // owner filed away: those are only reached from the archived list.
      if (!activeThreadId()) {
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
        pendingWorkspace.delete(frame.threadId);
        sessionStore.setWorkspace(frame.threadId, frame.workspace);
      } else {
        // A fresh conversation the listing has not carried yet: keep the pending value
        // until the next session.list.result brings the stored one.
        pendingWorkspace.set(frame.threadId, frame.workspace);
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
      const roster = subAgentStore.get(frame.threadId);
      if (roster.status === 'ready') chatStore.reconcileSpawnRoster(frame.threadId, roster.agents);
      chatStore.setPage(frame.threadId, {
        // An old server answers neither field: no cursor means no older page to ask for,
        // which is exactly the behaviour before this existed.
        nextBefore: frame.nextBefore ?? 0,
        hasMore: frame.hasMore === true && frame.nextBefore !== undefined,
      });
      // Only a draft the server actually holds is applied. An absent one means "no draft there",
      // which must not wipe text typed here and not yet synced: losing what is written is worse
      // than keeping a draft one beat longer than the device that cleared it.
      if (!frame.before && frame.draft) applyRemoteDraft(frame.threadId, frame.draft);
      if (!frame.before) chatStore.markRead(frame.threadId);
      break;
    case 'draft.changed':
      applyRemoteDraft(frame.threadId, frame.text);
      break;
    case 'voice.mode.result':
      setVoice(frame);
      break;
    case 'uiPrefs.result':
      setUiPrefs(frame);
      break;
    case 'update.result':
      setUpdate(frame);
      break;
    case 'model.list.result':
      modelStore.replaceCatalog(frame);
      break;
    case 'model.refresh.result':
      modelStore.receiveDiscovery(frame);
      break;
    case 'model.endpoints.result':
      modelStore.replaceEndpoints(frame);
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
      onConfigResult(frame);
      break;
    case 'config.saved':
      onConfigSaved(frame);
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
    case 'chat.send.queued':
      // Held behind a compaction, or queued in the active run's mailbox for the next turn boundary:
      // the message left, its run has not started (or not reached it yet). Said on the bubble
      // itself, because a silent send during a two-minute hold reads as a drop.
      chatStore.markQueued(frame.threadId, frame.replyToId, frame.reason);
      break;
    case 'chat.send.acked':
      // The run drained a queued injection at a turn boundary: lift the mark on the bubble that
      // carried it. The stream that follows opens its own bubble; this one stays answered.
      chatStore.clearQueued(frame.threadId, frame.replyToId);
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
          // Derived from the send, not from the clock: the server replays that bubble under the
          // same id, which is what lets a history page recognise it instead of doubling it.
          frame.replyToId ? `cmd-${frame.replyToId}` : `cmd-${Date.now()}`,
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
    case 'session.instructions.result':
      // Accept both the first fetch (loading) and the answer to a set (ready): a control the
      // page just applied must land, and the report it carries is the fresh truth.
      if (sessionInstructionsStore.getSnapshot().fetch === 'loading' || sessionInstructionsStore.getSnapshot().fetch === 'ready') {
        sessionInstructionsStore.receive(frame);
      }
      break;
    case 'jobs.list.result':
      // The fresh listing is also the answer to a save or a delete: a pending one closes
      // the editor on arrival, and a refused one lands as a jobs-scoped error instead.
      jobsStore.replace(frame);
      setJobsError(null);
      if (jobsSaving()) {
        markJobsSaving(false);
        setJobsSaving(false);
        setJobsEditor(null);
      }
      break;
    case 'jobs.runs.result': {
      // The answer to the runs page that asked for it: only accepted while it is open, so
      // a late answer does not resurrect a closed page.
      const page = jobSessionsPage();
      if (!page || page.jobId !== frame.jobId) break;
      const titles: Record<string, string> = {};
      for (const run of frame.runs) titles[run.threadId] = run.title;
      setRunTitles(titles);
      setJobRuns(frame.runs);
      setRunsError(null);
      break;
    }
    case 'notifications.info':
      // The server hands its VAPID key on every connection; registering again is how the
      // library verifies the distributor link is still alive (and picks up a rotation).
      setVapidKey(frame.vapidPublicKey);
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
    case 'approval.resolved':
      // Answered on another window, timed out, or the run went away: drop it wherever it sits in
      // the queue, so the sheet never asks about a call that can no longer be answered.
      setApprovals(current => current.filter(entry => entry.id !== frame.id));
      break;
    case 'approval.history.result':
      setApprovalHistory(frame);
      break;
    case 'error':
      // Where the user asked is where the refusal belongs: a rejected delete used to be
      // invisible under the files screen, and then loud in a conversation it has nothing
      // to do with.
      if (frame.scope === 'files') {
        setFilesError(frame.message);
      } else if (frame.scope === 'model') {
        // A refused discovery is the one model refusal that belongs to a screen rather than to
        // the picker: it says so under the button that asked, and the spinner stops.
        modelStore.failDiscovery(frame.message);
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
        onConfigError(frame.message);
      } else if (frame.scope === 'workspaces') {
        setWorkspacesError(frame.message);
        setWorkspacesBusy(false);
      } else if (frame.scope === 'jobs') {
        markJobsSaving(false);
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
        // The same scope carries the session page's refusals: it asks for instructions too,
        // and a page left spinning is how an old server used to look like a dead button.
        if (sessionInstructionsStore.getSnapshot().fetch === 'loading') {
          sessionInstructionsStore.fail(frame.message);
        }
      } else if (frame.scope === 'tags') {
        tagsStore.fail(frame.message);
      } else if (frame.scope === 'providers') {
        providersEnvStore.fail(frame.message);
        setProviderBusy(false);
      } else {
        const threadId = activeThreadId();
        if (threadId) {
          chatStore.addAgentMessage(
            threadId,
            `err-${Date.now()}`,
            `error: ${frame.message}`,
            [],
          );
        }
      }
      break;
  }
}
