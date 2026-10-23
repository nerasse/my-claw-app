import { connection } from './connection';
import { refusalText } from './refusal';
import { chatStore } from './chat';
import { rememberReasoning } from './reasoningFetch';
import { rostersFor } from './subagentStack';
import { subAgentCallersStore, subAgentStore } from './subagents';
import { sessionStore } from './sessions';
import { commandStore } from './commands';
import { questionStore } from './questionStore';
import { undoStore } from './undoStore';
import { acknowledgeDiagnostics } from './diagnostics';
import { devicesStore } from './devices';
import { nodesStore } from './nodes';
import { modelStore } from './model';
import { jobsStore } from './jobs';
import { browserStore } from './browser';
import { browserLiveStore } from './browserLive';
import { agentsStore } from './agents';
import { tagsStore } from './tags';
import { agentsFileStore } from './agentsFile';
import { instructionsStore } from './instructions';
import { sessionInstructionsStore } from './sessionInstructions';
import { providersEnvStore, providerRenameStore } from './providers';
import { statusStore } from './status';
import { quotaRetryStore, quotaStore } from './quota';
import { statsStore } from './stats';
import { servicesStore } from './services';
import { accountsStore } from './accounts';
import { fsStore } from './fsStore';
import { locationPreview } from './locationPreview';
import { applyRemoteDraft, applyServerDraft, applyServerFiles } from './drafts';
import { configureAPNs, handleAPNsResult } from './apns';
import { notificationPermission, registerForPush } from './notifications';

/** Same page size the shell requests on open: a branch switch refreshes the thread with it. */
const HISTORY_LIMIT = 50;
import {
  encodeAgentsConfigGet,
  encodeSessionSync,
  encodeModelGet,
  encodeSessionHistory,
  encodeSubAgentsList,
  type ApprovalRequestFrame,
  type ApprovalHistoryResultFrame,
  type BrowserUnblockResultFrame,
  type ConfigResultFrame,
  type ConfigSavedFrame,
  type JobEntry,
  type JobRunEntry,
  type McpEntry,
  type QuestionAskFrame,
  type UndoPromptFrame,
  type RunEndFrame,
  type ServerFrame,
  type SessionFileMeta,
  type SkillEntry,
  type StatusPayload,
  type ToolEntry,
  type UpdateResultFrame,
  type UiPrefsResultFrame,
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
  /** Opens a conversation returned by a command such as `/new` or `/fork`. */
  openThread?: (threadId: string) => void;
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
  setLastRun: (run: string) => void;
  setLocationEnabled: (enabled: boolean) => void;
  setServerVersion: (version: string) => void;
  /** The server's media ticket, for the URLs views load by themselves (serverUrl.authQuery). */
  setMediaTicket?: (ticket: string) => void;
  setDiagSnapshot: (text: string) => void;
  setDiagLogs: (text: string) => void;
  setDiagBusy: (busy: boolean) => void;
  setSessionFiles: (files: SessionFileMeta[]) => void;
  setFilesTotal: (bytes: number) => void;
  setFilesError: (message: string | null) => void;
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
  /** A typed `/status` answered with the report: the page opens on it and watches the thread. */
  openStatusPage: (threadId: string, status: StatusPayload) => void;
  setModelOpen: (open: boolean) => void;
  setJobsEditor: (value: JobEntry | 'new' | null) => void;
  setJobsSaving: (saving: boolean) => void;
  setJobsError: (message: string | null) => void;
  setJobRuns: (runs: JobRunEntry[]) => void;
  setRunsError: (message: string | null) => void;
  /** A refused browser.info: the page says why instead of sitting on "loading". */
  setBrowserError: (message: string | null) => void;
  /** What the last unlock did: the page shows the line, and an answer clears its error. */
  setBrowserUnblock: (frame: BrowserUnblockResultFrame) => void;
  setApprovals: (update: (current: ApprovalRequestFrame[]) => ApprovalRequestFrame[]) => void;
  setApprovalHistory: (frame: ApprovalHistoryResultFrame) => void;
  /** A question landed on the thread on screen: the device rings once, the push does the rest. */
  onQuestionAskOnActiveThread?: (frame: QuestionAskFrame) => void;
  /** A run ended on the thread on screen, done or failed: the device rings once, the push covers the rest. */
  onRunEndOnActiveThread?: (frame: RunEndFrame) => void;
  onUndoPromptOnActiveThread?: (frame: UndoPromptFrame) => void;
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
    openThread,
    subagentParent,
    jobSessionsPage,
    jobsSaving,
    markJobsSaving,
    pendingWorkspace,
    setRunTitles,
    setVapidKey,
    setLastRun,
    setLocationEnabled,
    setServerVersion,
    setMediaTicket,
    setDiagSnapshot,
    setDiagLogs,
    setDiagBusy,
    setSessionFiles,
    setFilesTotal,
    setFilesError,
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
    openStatusPage,
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
    onQuestionAskOnActiveThread,
    onRunEndOnActiveThread,
    onUndoPromptOnActiveThread,
    onConfigResult,
    onConfigSaved,
    onConfigError,
  } = handlers;

  /** Activity in a thread the user is not reading: badge it and make sure it is listed. */
  const noteActivity = (threadId: string, text: string): void => {
    if (threadId === activeThreadId()) return;
    // A sub-agent's thread is listed nowhere, so an unread mark on it has no row to sit on: it
    // only inflated the tab title with a count nothing could clear. Its activity shows on the
    // card in the parent thread.
    if (isSubAgentThread(threadId)) return;
    chatStore.markUnread(threadId);
    sessionStore.ensure(threadId, text);
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
      // Compaction marks only: a run that answers mid-flight (a notice, a media bubble) has not
      // read what is parked in its mailbox.
      chatStore.clearQueued(frame.threadId, undefined, ['compaction']);
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
      // A message sent is what orders the list, wherever it was typed.
      if (!isSubAgentThread(frame.threadId)) sessionStore.touch(frame.threadId, frame.text);
      break;
    case 'chat.compaction':
      // No ring, no unread mark, and deliberately no `noteActivity`: a compaction is not a
      // message and the owner never asked for this one, so bumping the thread in the drawer for
      // it would be noise (docs/notifications.md on the server).
      chatStore.addCompactionBoundary(frame.threadId, frame.id, frame.summary, frame.count, frame.archive);
      break;
    case 'chat.compacting':
      // Same silence as the boundary above: a placeholder in the thread, nothing in the tray.
      // `text` and `reasoning` are set on a replayed frame only, where they are everything
      // produced so far.
      chatStore.setCompacting(
        frame.threadId,
        frame.since ? Date.parse(frame.since) : undefined,
        frame.text ?? '',
        frame.reasoning ?? '',
      );
      break;
    case 'chat.compacting.delta':
      // The summary as it is written, and the thinking that precedes it. Appended, like a
      // reasoning or a tool fragment: the server sends what has just been produced, never a
      // running total. One field or the other, never both on one frame.
      if (frame.text) chatStore.appendCompactionText(frame.threadId, frame.text);
      if (frame.reasoning) chatStore.appendCompactionReasoning(frame.threadId, frame.reasoning);
      break;
    case 'chat.turn.thinking':
      // A model call opened this bubble and has produced nothing yet: the bubble draws the wait,
      // and the first thing written into it takes the mark down (the store does that).
      chatStore.markWaiting(frame.threadId, frame.id, Date.parse(frame.since));
      break;
    case 'chat.run.start':
      // A run opening on this thread means the compaction that held its trigger is over: the
      // message it was waiting for is the one being answered. Without this the badge had to wait
      // for the agent to speak, and a run that only called tools said nothing for over an hour --
      // the bubble wore "waiting for the compaction" while its run was well underway (2026-09-11).
      // Compaction marks only: an injection is still parked in the mailbox of the run that just
      // started, and clearing it here would read as accepted a message the run has not looked at.
      chatStore.clearQueued(frame.threadId, undefined, ['compaction']);
      chatStore.startRun(frame.threadId, frame.run);
      break;
    case 'chat.run.end': {
      const ended = chatStore.endRun(frame.threadId, frame.reason);
      // The run died with the message still in its mailbox, and it will never look at it.
      chatStore.clearQueued(frame.threadId, undefined, ['compaction', 'injection']);
      // A Stop cuts the call in flight and the server writes nothing of it: whatever that call
      // had streamed -- a reasoning block, half an answer -- is on this screen and in no log, so a
      // reload drew a different thread than the one the owner had just watched. The newest page,
      // asked for with a null cursor, is the thread as it is persisted: the window replaces the
      // range it covers, and the screen converges on history the moment the run ends. Only a
      // Stop: a finished run and the log agree by construction, and a failed one writes its
      // `failure` entry seconds after its end, which a sync this early would miss.
      if (ended && frame.reason === 'aborted' && frame.threadId === activeThreadId()) {
        const { leaf } = chatStore.getSyncState(frame.threadId);
        connection.send(encodeSessionSync(frame.threadId, null, leaf ?? undefined)).catch(() => {});
      }
      // The run just finished on the thread on screen: one ring, exactly like a question hitting
      // the open thread. A run ending on any other thread (or the device in the background) is
      // the push's business -- server-side skipDevice keeps the tray silent for the foreground
      // device on that thread, so the ring and the banner never double up. An end that closed
      // nothing (announced twice by an older server, or replayed) is not a second run ending.
      // A sub-agent is excluded: its thread is a thread like any other but it is not a conversation,
      // and the owner asked for that run and is watching the card it lives on, so a ring there is
      // noise rather than news (2026-09-14).
      if (ended && frame.threadId === activeThreadId() && !isSubAgentThread(frame.threadId)) {
        onRunEndOnActiveThread?.(frame);
      }
      // A run may have spawned sub-agents; the roster is refetched at its end rather than
      // pushed, which keeps the counter honest without a live push path.
      const onScreen = activeThreadId();
      if (onScreen) {
        for (const roster of rostersFor(onScreen, subagentParent())) {
          connection.send(encodeSubAgentsList(roster)).catch(() => {});
        }
      }
      // The turn that just landed is what filled the window: the header's share of context is
      // read back from the server here rather than guessed from the bubbles on screen. Same
      // frame as the one the picker uses, so a run that switched model refreshes that too.
      if (frame.threadId === activeThreadId()) {
        connection.send(encodeModelGet(frame.threadId)).catch(() => {});
      }
      break;
    }
    case 'chat.run.stopping':
      // The server claimed a stop on this thread and the work it aborts has not departed yet. One
      // frame per cycle, replayed to a window that syncs while it holds: this is what shows a
      // stop taken on another surface (the web) over here, and what a window that reloaded
      // mid-stop is handed back. Silent besides the state, like the compaction: a stop is not
      // activity, and nothing in the drawer rings for it.
      chatStore.markStopping(frame.threadId);
      break;
    case 'subagents.list.result':
      subAgentStore.receive(frame);
      chatStore.reconcileSpawnRoster(frame.threadId, frame.agents);
      break;
    case 'subagents.callers.result':
      subAgentCallersStore.receive(frame);
      break;
    case 'subagents.handoff.result':
      subAgentCallersStore.receiveHandoff(frame);
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
    case 'device.invite.result':
      devicesStore.onInvite(frame);
      break;
    case 'device.pair.result':
      // A lookup that found nothing answers with a result rather than an info frame; the
      // screen has to leave its spinner and say why.
      if (!frame.ok && !frame.deviceId) devicesStore.onPairError(frame.error ?? 'unknown');
      else devicesStore.onPairResult(frame);
      break;
    case 'nodes.list.result':
      nodesStore.onList(frame);
      break;
    case 'nodes.add.result':
      nodesStore.onAdd(frame);
      break;
    case 'nodes.revoke.result':
      nodesStore.onRevoked(frame);
      break;
    case 'nodes.rename.result':
      nodesStore.onRenamed(frame);
      break;
    case 'nodes.describe.result':
      nodesStore.onDescribed(frame);
      break;
    case 'nodes.access.set.result':
      nodesStore.onAccessSet(frame);
      break;
    case 'nodes.update.result':
      nodesStore.onUpdated(frame);
      break;
    case 'nodes.mcp.set.result':
      nodesStore.onMcpSet(frame);
      break;
    case 'nodes.presence':
      nodesStore.onPresence(frame);
      break;
    case 'chat.stream.start':
      // The agent is answering, so no command result is coming: a placeholder left by a
      // command this server does not know would sit there forever.
      chatStore.clearCommandPending(frame.threadId);
      // Compaction marks only. A run seals a segment and opens another at every reasoning block
      // and after every tool round, so this fires many times during the very turn an injected
      // message is still waiting for -- lifting its badge here read as accepted a message the run
      // had not looked at yet.
      chatStore.clearQueued(frame.threadId, undefined, ['compaction']);
      chatStore.startStream(frame.threadId, frame.id, frame.replyToId);
      noteActivity(frame.threadId, '');
      break;
    case 'chat.stream.delta':
      chatStore.appendDelta(frame.threadId, frame.id, frame.text, frame.replay);
      break;
    case 'chat.reasoning.delta':
      chatStore.appendReasoning(frame.threadId, frame.id, frame.text, frame.replay, frame.since);
      break;
    case 'chat.reasoning.tokens':
      chatStore.setReasoningTokens(frame.threadId, frame.id, frame.tokens, frame.since);
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
      chatStore.appendToolOutput(frame.threadId, frame.id, { stdout: frame.stdout, stderr: frame.stderr, clipped: frame.clipped, replay: frame.replay });
      break;
    case 'chat.tool.full.result':
      // The whole output of a card that was pushed clipped. A card the session no longer holds
      // is answered `found: false`, and then nothing is touched: the clipped text on screen is
      // better than an empty block.
      if (frame.found) chatStore.setToolOutput(frame.threadId, frame.id, frame.output);
      break;
    case 'chat.reasoning.result':
      rememberReasoning(frame.threadId, frame.id, frame.found ? frame.reasoning : null);
      break;
    case 'chat.run.items':
      // The work a folded row stood for, spliced in where the row was. A range the branch no
      // longer holds is answered `found: false`, and the row says so instead of spinning for
      // good -- docs/run-hydration.md.
      if (frame.found) chatStore.hydrateRun(frame.threadId, frame.fromId, frame.messages);
      else chatStore.setRunHydration(frame.threadId, frame.fromId, 'failed');
      break;
    case 'chat.spawn.start':
      // A sub-agent spawned mid-run on the thread on screen: its card opens it, so the roster is
      // asked for now rather than at the run's end, which may be hours away.
      if (frame.threadId === activeThreadId() && frame.subagentId) {
        connection.send(encodeSubAgentsList(frame.threadId)).catch(() => {});
      }
      // A sub-agent spawned mid-run: mark the spawn card (or open a standalone one) as running.
      chatStore.startSpawn(frame.threadId, frame.id, {
        subagentId: frame.subagentId,
        displayName: frame.displayName,
        type: frame.agentType,
        mode: frame.mode,
        // A server older than this field sends none, and an undefined action would reach the card
        // as its label. `spawn` is what that server could only have meant.
        action: frame.action === 'send' ? 'send' : 'spawn',
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
      sessionStore.replace(frame.sessions, frame.folders ?? []);
      // The server now owns these conversations: their optimistic workspace values are
      // superseded by the listing's own (authoritative) field.
      for (const threadId of pendingWorkspace.keys()) {
        if (sessionStore.has(threadId)) pendingWorkspace.delete(threadId);
      }
      // The server's run view survives a reconnect mid-run: flags it missed (or lost)
      // come back through the list, so the Stop button reappears without a new token.
      chatStore.seedRuns(frame.sessions.filter(session => session.activeRun).map(session => session.threadId));
      // A session listing never chooses a conversation. With no stored/deep-linked thread, the
      // shell stays on the home screen and the owner chooses from the list. This also prevents a
      // refresh after pressing the MyClaw home action from reopening the first conversation.
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
      else chatStore.seedHistory(frame.threadId, frame.messages, frame.activeRun);
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
      if (!frame.before && frame.draft) applyServerDraft(frame.threadId, frame.draft);
      // A page adds the chips this device did not know; the server's own broadcast is what removes.
      if (!frame.before && frame.files) applyServerFiles(frame.threadId, frame.files, 'merge');
      if (!frame.before) chatStore.markRead(frame.threadId);
      break;
    case 'session.sync.result': {
      // Delta sync: three cases by reset flag.
      // - absent: delta to append (same branch)
      // - "unknown-cursor": cursor not found, full page, replace thread
      // - "branch-switch": server's leaf diverged, full page, replace thread (lots 7/8)
      chatStore.handleSyncResult(
        frame.threadId,
        frame.entries,
        frame.head,
        frame.leaf,
        frame.activeRun,
        frame.reset,
        frame.truncated,
        frame.hasMore,
        frame.nextBefore,
        frame.lastRun,
      );
      // The thread's compaction state, in both directions: the operation if one runs, and its
      // absence otherwise. Only the first travels as an event, so a window that was not connected
      // when the compaction ended hears it here or nowhere -- and the rule it drew would stay up.
      chatStore.setCompacting(
        frame.threadId,
        frame.compacting ? Date.parse(frame.compacting.since) : undefined,
        frame.compacting?.text ?? '',
        frame.compacting?.reasoning ?? '',
      );
      const rosterSync = subAgentStore.get(frame.threadId);
      if (rosterSync.status === 'ready') chatStore.reconcileSpawnRoster(frame.threadId, rosterSync.agents);
      chatStore.markRead(frame.threadId);
      // Opening a thread syncs; the answer that replaces it carries the draft, a delta carries
      // none. Same rule as a history page: it fills a gap, it never regresses this device.
      if (frame.draft) applyServerDraft(frame.threadId, frame.draft);
      if (frame.files) applyServerFiles(frame.threadId, frame.files, 'merge');
      // The setting travels on every sync, so a window that opened after it was turned on shows
      // the switch and the waiting pill without asking again.
      if (frame.quotaRetry) quotaRetryStore.set(frame.threadId, frame.quotaRetry);
      // If truncated, the server has more entries. Request the rest.
      if (frame.truncated) {
        const { since, leaf } = chatStore.getSyncState(frame.threadId);
        // Use head from the last batch (entries may have been appended, so use the last entry's id)
        const lastEntry = frame.entries[frame.entries.length - 1];
        const nextSince = lastEntry?.id ?? since;
        connection.send(encodeSessionSync(frame.threadId, nextSince, leaf ?? undefined)).catch(() => {});
      }
      break;
    }
    case 'draft.changed':
      applyRemoteDraft(frame.threadId, frame.text);
      break;
    case 'draft.files.changed':
      // The list as the server holds it, removals included: this is what a chip deleted on another
      // device travels on. Uploads still running here have no id and are kept.
      applyServerFiles(frame.threadId, frame.files, 'replace');
      break;
    case 'voice.mode.result':
      // Nothing shows it any more: speech-to-text is chosen on the Services page, from the
      // services frame, which already said the same thing (2026-10-04).
      break;
    case 'services.result':
      servicesStore.replace(frame);
      break;
    case 'accounts.result':
      accountsStore.replace(frame);
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
    case 'providers.rename.preview.result':
      providerRenameStore.receive(frame);
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
    case 'chat.send.received':
      chatStore.markDelivered(frame.threadId, frame.id);
      break;
    case 'chat.send.acked':
      // The run drained a queued injection at a turn boundary: lift the mark on the bubble that
      // carried it. The stream that follows opens its own bubble; this one stays answered.
      // Drained, so it is answered: no wait of any kind is left on that bubble.
      chatStore.clearQueued(frame.threadId, frame.replyToId, ['compaction', 'injection']);
      break;
    case 'chat.command.pending':
      chatStore.addCommandPending(frame.threadId, frame.replyToId, frame.text);
      break;
    case 'chat.command.result':
      if (frame.status) {
        // A /status answered by the server: the page replaces the bubble, so the report
        // never takes space in the conversation. Its placeholder goes with it.
        chatStore.clearCommandPending(frame.threadId);
        openStatusPage(frame.threadId, frame.status);
      } else {
        // A quiet command (undo, retry, branches) never showed its input on any surface: drop
        // the optimistic bubble this device drew at send, so the result is the whole story.
        if (frame.dropInput && frame.replyToId) {
          chatStore.dropBubble(frame.threadId, frame.replyToId);
        }
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
        // A branch switch (undo, retry, branches) moved the server's leaf: the thread must be
        // refetched or the old bubbles stay on screen over the new branch. The refresh goes
        // through the same path a fresh open uses -- a full page replaces the thread.
        if (frame.reset === 'branch-switch') {
          connection.send(encodeSessionHistory(frame.threadId, HISTORY_LIMIT, 0)).catch(() => {});
        }
        // The server hands back the user message being retried/undone: prefill the composer.
        // A draft already on screen wins, exactly like a remote draft arriving from another
        // device -- the owner is typing, do not clobber it.
        if (frame.compose) {
          applyRemoteDraft(frame.threadId, frame.compose);
        }
      }
      if (frame.newThreadId) openThread?.(frame.newThreadId);
      break;
    case 'status.result':
      // Pushed by the server for as long as the page is watched: the store keeps it when the page
      // is open on that thread, and drops a late one for a page since closed or moved.
      statusStore.receive(frame);
      break;
    case 'quota.state':
      quotaStore.receive(frame);
      break;
    case 'session.quotaRetry.state':
      quotaRetryStore.receive(frame);
      break;
    case 'stats.result':
      // The answer to one `stats.get`, and there is nothing else it could be: no thread owns it,
      // so the store matches it against the window the page last asked for.
      statsStore.receive(frame);
      break;

    // The system files page. Nine frames, all of them matched by the path they echo: the store
    // holds one directory and one open file, so an answer for a path the owner has left is
    // dropped rather than drawn under the one he is reading.
    case 'fs.list.result':
    case 'fs.read.result':
    case 'fs.write.result':
    case 'fs.mkdir.result':
    case 'fs.move.result':
    case 'fs.remove.result':
    case 'fs.watch.result':
    case 'fs.changed':
    case 'fs.session.root.result':
      fsStore.receive(frame);
      break;
    case 'session.instructions.result':
      // Accept both the first fetch (loading) and the answer to a set (ready): a control the
      // page just applied must land, and the report it carries is the fresh truth.
      if (sessionInstructionsStore.getSnapshot().fetch === 'loading' || sessionInstructionsStore.getSnapshot().fetch === 'ready') {
        sessionInstructionsStore.receive(frame);
      }
      break;
    case 'browser.info.result':
      browserStore.replace(frame);
      break;
    case 'browser.windows.result':
      browserLiveStore.receiveWindows(frame);
      break;
    case 'browser.frame':
      browserLiveStore.receiveFrame(frame);
      break;
    case 'browser.frame.gone':
      browserLiveStore.receiveGone(frame.pageId);
      break;
    case 'browser.control.result':
      browserLiveStore.receiveControl(frame);
      break;
    case 'browser.unblock.result':
      setBrowserUnblock(frame);
      setBrowserError(null);
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
    case 'notifications.apns.result':
      handleAPNsResult(frame);
      break;
    case 'notifications.info': {
      configureAPNs(frame.apns?.relayURL).catch(() => {});
      // The server hands its VAPID key on every connection; registering again is how the
      // library verifies the distributor link is still alive (and picks up a rotation).
      setVapidKey(frame.vapidPublicKey);
      // A browser that has not granted the permission yet is not asked here: `requestPermission`
      // needs a user gesture, so a connect-time attempt fails on Firefox and spends Chrome's one
      // prompt on a dialog nobody is looking at. It gets a switch in Settings instead. Android
      // reports `unavailable` -- there is no permission on that path -- and registers as it always did.
      const permission = notificationPermission();
      if (permission === 'unavailable' || permission === 'granted') {
        registerForPush(frame.vapidPublicKey).catch(() => {});
      }
      break;
    }
    case 'hello':
      // The server names itself on connect: the settings page labels "connected" with it.
      setServerVersion(frame.version);
      chatStore.setServerReceipts(frame.receipts === true);
      break;
    case 'media.ticket':
      setMediaTicket?.(frame.ticket);
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
    case 'approval.pending':
      // Authoritative, like question.pending: the server's list wins whole. That is what re-asks a
      // sheet raised on another thread or while this device was asleep, and what clears one left
      // behind by a server that restarted holding it.
      setApprovals(() => frame.entries.map(entry => ({ type: 'approval.request' as const, ...entry })));
      break;
    case 'approval.resolved':
      // Answered on another window, timed out, or the run went away: drop it wherever it sits in
      // the queue, so the sheet never asks about a call that can no longer be answered.
      setApprovals(current => current.filter(entry => entry.id !== frame.id));
      break;
    case 'approval.history.result':
      setApprovalHistory(frame);
      break;
    case 'question.ask':
      // The store owns it, not this screen: the form is drawn in the conversation and has to
      // outlive every screen the owner walks through to answer it. The same id twice is the live
      // turn journal replaying an ask, and is ignored.
      questionStore.ask(frame);
      if (frame.threadId === activeThreadId()) onQuestionAskOnActiveThread?.(frame);
      break;
    case 'question.pending':
      // The server's whole list, at connect: what was pushed while the socket was down is gained
      // here, and a card kept from a run that no longer exists is dropped.
      questionStore.reset(frame.entries);
      break;
    case 'question.resolved':
      // Answered or canceled, here or on another surface.
      questionStore.resolve(frame.id);
      // A canceled question may be the answer a stop got: the server reads a stop as "cancel the
      // question" and leaves the run alone, so the mark that stop armed must not wait for a run
      // end that is not coming -- a mark left through it would swallow the next stop, the one
      // meant to abort. (The app usually knows about the question before it sends the stop, and
      // arms nothing then; this is the race, where the ask had not landed yet.)
      if (frame.reason === 'canceled') chatStore.liftStop(frame.threadId);
      break;
    case 'undo.prompt':
      // The server asks which mode a bare `/undo` should use. The store owns it: the sheet
      // must survive every screen the owner walks through before choosing.
      undoStore.prompt(frame);
      if (frame.threadId === activeThreadId()) onUndoPromptOnActiveThread?.(frame);
      break;
    case 'undo.resolved':
      // Chosen (here or on another surface) or dismissed: close the sheet.
      undoStore.resolve(frame.id);
      break;
    case 'error': {
      const refusal = refusalText(frame);
      // Where the user asked is where the refusal belongs: a rejected delete used to be
      // invisible under the files screen, and then loud in a conversation it has nothing
      // to do with.
      if (frame.scope === 'files') {
        setFilesError(refusal);
      } else if (frame.scope === 'model') {
        // A refused discovery is the one model refusal that belongs to a screen rather than to
        // the picker: it says so under the button that asked, and the spinner stops.
        modelStore.failDiscovery(refusal);
        // A stale picker answered by a server that dropped the model: close the sheet,
        // the next model.list will carry the truth.
        setModelOpen(false);
      } else if (frame.scope === 'skills') {
        // An old server has no skill catalog: the skills page must not spin forever.
        setSkillsError(refusal);
      } else if (frame.scope === 'tools') {
        setToolsError(refusal);
        setToolsSaving(false);
      } else if (frame.scope === 'mcp') {
        setMcpError(refusal);
        setMcpBusy(false);
      } else if (frame.scope === 'config') {
        onConfigError(refusal);
      } else if (frame.scope === 'workspaces') {
        setWorkspacesError(refusal);
        setWorkspacesBusy(false);
      } else if (frame.scope === 'jobs') {
        markJobsSaving(false);
        setJobsSaving(false);
        setJobsError(refusal);
      } else if (frame.scope === 'browser') {
        setBrowserError(refusal);
      } else if (frame.scope === 'services') {
        servicesStore.fail(refusal);
      } else if (frame.scope === 'accounts') {
        accountsStore.fail(refusal);
      } else if (frame.scope === 'status') {
        statusStore.fail(refusal);
      } else if (frame.scope === 'stats') {
        // A window the server does not know, or an install with no analytics at all: the page says
        // so where it was asked for instead of spinning on an answer that will never come.
        statsStore.fail(refusal);
      } else if (frame.scope === 'fs') {
        // A protected path, a directory that cannot be read, a watch that cannot attach: the page
        // says so where it was asked for. Nothing here belongs in a chat bubble.
        fsStore.fail(refusal);
      } else if (frame.scope === 'agents') {
        agentsStore.fail(refusal);
        // A file edit can fail while the file page is open: the editor shows it where it
        // was asked for, and a no-op for the list page.
        agentsFileStore.fail(refusal);
      } else if (frame.scope === 'instructions') {
        instructionsStore.fail(refusal);
        // The same scope carries the session page's refusals: it asks for instructions too,
        // and a page left spinning is how an old server used to look like a dead button.
        if (sessionInstructionsStore.getSnapshot().fetch === 'loading') {
          sessionInstructionsStore.fail(refusal);
        }
      } else if (frame.scope === 'tags') {
        tagsStore.fail(refusal);
      } else if (frame.scope === 'subagents') {
        // A refused caller list is a real state: an unreachable sub-agent answers like a missing
        // one, so the sheet must say so instead of spinning or showing "no callers". Only when a
        // sub-agent is actually on screen -- kill and reset share this scope from a conversation.
        const subagentThread = subagentParent() ? activeThreadId() : null;
        if (subagentThread) subAgentCallersStore.refused(subagentThread);
      } else if (frame.scope === 'providers') {
        providersEnvStore.fail(refusal);
        setProviderBusy(false);
      } else {
        const threadId = activeThreadId();
        if (threadId) {
          chatStore.addAgentMessage(
            threadId,
            `err-${Date.now()}`,
            `error: ${refusal}`,
            [],
          );
        }
      }
      break;
    }
  }
}
