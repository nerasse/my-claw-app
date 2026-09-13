/**
 * Which layer a back press closes, and whether there was one at all.
 *
 * Written once and read by three inputs that all mean the same thing: Android's back key, the
 * browser's Back button and the Escape key. `false` is "nothing left to close", which is what
 * lets the platform do its own thing (leave the app, leave the page).
 *
 * The order of the tests below IS the behaviour -- innermost layer first -- so this file is one
 * long cascade on purpose: a reader has to be able to see the whole priority list at once, and a
 * swap of two blocks is a change of what the back key does. `docs/back-cascade.md` holds the
 * order in prose, and `__tests__/BackCascade.test.tsx` pins it.
 *
 * It lived inside `AppShell` until it was 314 lines in the middle of a 4700-line component. It is
 * a function of a snapshot of the shell and nothing else, so it is one here, and the shell keeps
 * the `useCallback` (and its dependency list) that decides when that snapshot is taken.
 */

import { Platform } from 'react-native';
import { pickerBack, type PickerState } from '../components/ModelSheet';
import { agentsFileStore } from '../core/agentsFile';
import { instructionsStore } from '../core/instructions';
import { sessionInstructionsStore } from '../core/sessionInstructions';
import type { ApprovalRequestFrame, JobRunEntry } from '../core/protocol';
import type { ProviderSearch } from './ProviderScreen';
import type { SettingsPage } from './settingsPages';

/** A ref of the shell, read here and in two cases cleared. */
interface Cell<T> {
  current: T;
}

/** The tag editor, as much of it as the cascade rebuilds when it walks out of a picker. */
interface TagEditorState {
  name: string;
  picker: PickerState | null;
  pickerIndex: number | null;
}

/** The runs page of a job, which a run opened from it comes back to. */
interface JobSessionsPage {
  jobId: string;
  jobName: string;
}

/**
 * The shell as the cascade sees it: the layers as they are, and what closes them.
 *
 * Two conventions make the type say what may happen here, rather than leaving it to a comment:
 *
 * - a layer the cascade only has to *find* is `unknown`. What it holds belongs to the screen that
 *   draws it, and reading it from here would be this function growing a second job;
 * - a closer takes `null` or `false`, never a value. Nothing in this file can open anything, and
 *   the compiler is what says so.
 */
export interface BackLayers {
  selection: unknown;
  setSelection: (value: null) => void;
  subagentAction: unknown;
  setSubagentAction: (value: null) => void;
  subagentMenuOpen: boolean;
  setSubagentMenuOpen: (value: false) => void;
  handoff: unknown;
  setHandoff: (value: null) => void;
  agentsOpen: boolean;
  setAgentsOpen: (value: false) => void;
  agentsGlobalOpen: boolean;
  setAgentsGlobalOpen: (value: false) => void;
  statusOpen: boolean;
  closeStatus: () => void;
  instructionsPageOpen: boolean;
  setInstructionsPageOpen: (value: false) => void;
  instructionsPageEditing: boolean;
  setInstructionsPageEditing: (value: false) => void;
  jobToDelete: unknown;
  setJobToDelete: (value: null) => void;
  jobsOpen: boolean;
  setJobsOpen: (value: boolean) => void;
  jobsEditor: unknown;
  setJobsEditor: (value: null) => void;
  jobSessions: unknown;
  setJobSessions: (value: JobSessionsPage | null) => void;
  jobSessionsRef: Cell<JobSessionsPage | null>;
  setJobRuns: (value: null | ((current: JobRunEntry[] | null) => JobRunEntry[] | null)) => void;
  imageViewer: unknown;
  setImageViewer: (value: null) => void;
  textViewer: unknown;
  setTextViewer: (value: null) => void;
  videoViewer: unknown;
  setVideoViewer: (value: null) => void;
  fileViewer: unknown;
  setFileViewer: (value: null) => void;
  /**
   * How many approval requests are queued, not the queue itself: the shell keys its snapshot on
   * this number, and handing over the array would make every unrelated change of it a new
   * cascade. The one write below is a functional update, so it never reads a stale queue.
   */
  approvalCount: number;
  setApprovals: (update: (current: ApprovalRequestFrame[]) => ApprovalRequestFrame[]) => void;
  fileToDelete: unknown;
  setFileToDelete: (value: null) => void;
  confirmDelete: unknown;
  setConfirmDelete: (value: null) => void;
  workspacePicker: unknown;
  setWorkspacePicker: (value: null) => void;
  tagEditorDiscard: boolean;
  setTagEditorDiscard: (value: boolean) => void;
  threadToRename: unknown;
  setThreadToRename: (value: null) => void;
  modelOpen: boolean;
  setModelOpen: (value: false) => void;
  modelPicker: PickerState;
  setModelPicker: (value: PickerState) => void;
  tuneOpen: boolean;
  setTuneOpen: (value: false) => void;
  newTagPrompt: boolean;
  setNewTagPrompt: (value: false) => void;
  tagToDelete: unknown;
  setTagToDelete: (value: null) => void;
  providerToDelete: unknown;
  setProviderToDelete: (value: null) => void;
  commandMenuOpen: boolean;
  setCommandMenuOpen: (value: false) => void;
  moreOpen: boolean;
  setMoreOpen: (value: false) => void;
  bubbleMenu: unknown;
  setBubbleMenu: (value: null) => void;
  threadMenu: unknown;
  setThreadMenu: (value: null) => void;
  drawerOpen: boolean;
  setDrawerOpen: (value: false) => void;
  /** Pinned, the conversation list is not a layer at all: see the drawer case below. */
  pinnedDrawer: boolean;
  skillMenu: unknown;
  setSkillMenu: (value: null) => void;
  skillTargets: unknown;
  setSkillTargets: (value: null) => void;
  skillReplace: unknown;
  setSkillReplace: (value: null) => void;
  skillViewer: unknown;
  setSkillViewer: (value: null) => void;
  setSkillsNotice: (value: null) => void;
  settingsOpen: boolean;
  setSettingsOpen: (value: false) => void;
  settingsPage: SettingsPage;
  setSettingsPage: (value: SettingsPage) => void;
  agentPicker: PickerState;
  setAgentPicker: (value: PickerState) => void;
  agentModelFor: string | null;
  setAgentModelFor: (value: null) => void;
  tagEditor: TagEditorState | null;
  setTagEditor: (value: TagEditorState | null) => void;
  tagEditorDirty: boolean;
  providerSearch: Cell<ProviderSearch>;
  providerEdit: { mode: 'create' | 'edit' } | null;
  setProviderEdit: (value: null) => void;
  setModelEdit: (value: null) => void;
  scopeEditor: { target: 'config' | 'file' } | null;
  setScopeEditor: (value: null) => void;
  tagContextEditor: unknown;
  workspaceFrom: 'workspaces' | 'agent';
  setLayerTarget: (value: null) => void;
  archivesOpen: boolean;
  setArchivesOpen: (value: boolean) => void;
  browserOpen: boolean;
  setBrowserOpen: (value: false) => void;
  filesOpen: boolean;
  setFilesOpen: (value: false) => void;
  subagentRef: Cell<unknown>;
  leaveSubAgent: () => void;
  fromArchivesRef: Cell<boolean>;
  fromJobSessionsRef: Cell<boolean>;
  activeThreadRef: Cell<string | null>;
  selectThread: (threadId: null) => void;
}

/** Closes the topmost layer, and says whether there was one. */
export function closeTopLayer(layers: BackLayers): boolean {
  const {
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
    setImageViewer,
    textViewer,
    setTextViewer,
    videoViewer,
    setVideoViewer,
    fileViewer,
    setFileViewer,
    approvalCount,
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
    drawerOpen,
    setDrawerOpen,
    pinnedDrawer,
    skillMenu,
    setSkillMenu,
    skillTargets,
    setSkillTargets,
    skillReplace,
    setSkillReplace,
    skillViewer,
    setSkillViewer,
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
    workspaceFrom,
    setLayerTarget,
    archivesOpen,
    setArchivesOpen,
    browserOpen,
    setBrowserOpen,
    filesOpen,
    setFilesOpen,
    subagentRef,
    leaveSubAgent,
    fromArchivesRef,
    fromJobSessionsRef,
    activeThreadRef,
    selectThread,
  } = layers;

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
  // The hand-back sheet sits over the sub-agent chat it was opened from, and under the menu that
  // covers both: a press here must not hand the conversation back to its parent instead.
  if (handoff) {
    setHandoff(null);
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
  if (statusOpen) {
    closeStatus();
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
  // Before the page it covers, like every confirmation here, and that is the whole point: the
  // editor underneath used to take the press and leave the question hanging over the list.
  // `JobsEditorScreen` owns the back key while it is up, so it hands this one case back.
  if (jobToDelete) {
    setJobToDelete(null);
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
  if (approvalCount > 0) {
    setApprovals(current => current.slice(1));
    return true;
  }
  if (fileToDelete) {
    setFileToDelete(null);
    return true;
  }
  if (confirmDelete) {
    setConfirmDelete(null);
    return true;
  }
  if (workspacePicker) {
    setWorkspacePicker(null);
    return true;
  }
  // Asked by this very cascade when it walks out of a dirty tag editor. Closing it returns to the
  // editor with the changes intact: answering the question is the only way past it.
  if (tagEditorDiscard) {
    setTagEditorDiscard(false);
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
  if (drawerOpen && !pinnedDrawer) {
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
    // The notice is a line on the page, not a layer: it never takes a press of its own. It is
    // dropped on the way out all the same, the way the screen's own back arrow drops it, or it
    // comes back stale the next time the page opens.
    if (settingsPage === 'skills') {
      setSkillsNotice(null);
      setSettingsPage('index');
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
  if (browserOpen) {
    setBrowserOpen(false);
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
  // A chat open on a phone: back goes home, not out of the app.
  //
  // Settings, the archive, the files screen and a sub-agent chat are not tested here although they
  // all cover the conversation: each of them returns further up, so reaching this line already
  // means none of them is open. The checks were there and read as if they could be false.
  if (Platform.OS !== 'web' && !pinnedDrawer && activeThreadRef.current) {
    selectThread(null);
    return true;
  }
  return false;
}
