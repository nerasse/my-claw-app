import { useSyncExternalStore } from 'react';
import type { AgentFileResultFrame, AgentFileSavedFrame } from './protocol';

type Listener = () => void;

export type AgentFileStatus = 'unknown' | 'ready' | 'unsupported';
export type EditorStatus = 'loading' | 'ready' | 'saving' | 'conflict';

/**
 * The agent file editor's working copy. Fields are edited in place (structured editing), and the
 * whole frame is sent back on save: the server owns the flat frontmatter serialization.
 */
export interface AgentFileEditorState {
  /** The config key of the agent (the file name). */
  name: string;
  status: EditorStatus;
  frame: AgentFileResultFrame | null;
  /** sha of the loaded file; a save echoes it back to prove the file did not move. */
  sha: string;
  /** True after a save that created the file (fork/create), when the registry may lag a beat. */
  error: string | null;
  /** Whether the file is a built-in that can only be forked. */
  editable: boolean;
  /** Set on the last save: the server accepted the file. */
  savedAt: number | null;
}

interface AgentsFileState {
  status: AgentFileStatus;
  editor: AgentFileEditorState | null;
  error: string | null;
}

const EMPTY: AgentsFileState = { status: 'unknown', editor: null, error: null };

/**
 * The structured editor of one agent definition file. The server owns the truth: nothing is
 * written optimistically, and the editor only lands on the fields `agents.file.result` reports.
 * `unsupported` means a server that predates the frames never answered.
 */
class AgentsFileStoreImpl {
  private state: AgentsFileState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): AgentsFileState {
    return this.state;
  }

  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  markUnsupported(): void {
    if (this.state.status === 'ready') return;
    this.state = { ...this.state, status: 'unsupported' };
    this.emit();
  }

  fail(message: string): void {
    const open = this.state.editor;
    const editor: AgentFileEditorState | null = open
      ? { ...open, status: open.status === 'conflict' ? 'conflict' : 'ready', error: message }
      : null;
    this.state = { ...this.state, error: message, editor };
    this.emit();
  }

  open(name: string): void {
    this.state = {
      ...this.state,
      status: 'ready',
      editor: {
        name,
        status: 'loading',
        frame: null,
        sha: '',
        error: null,
        editable: false,
        savedAt: null,
      },
    };
    this.emit();
  }

  close(): void {
    this.state = { ...this.state, editor: null };
    this.emit();
  }

  receive(frame: AgentFileResultFrame): void {
    const open = this.state.editor;
    // A late answer for an agent the user already left must not overwrite what is on screen.
    if (!open || open.name !== frame.name) return;
    this.state = {
      ...this.state,
      editor: {
        ...open,
        status: 'ready',
        frame,
        sha: frame.sha,
        error: null,
        editable: frame.editable,
      },
    };
    this.emit();
  }

  /** The server accepted a save (agents.file.result or agents.file.saved): refresh the frame. */
  receiveSaved(frame: AgentFileResultFrame | AgentFileSavedFrame): void {
    const open = this.state.editor;
    if (!open || open.name !== frame.name) return;
    if ('description' in frame) {
      this.state = {
        ...this.state,
        editor: { ...open, status: 'ready', frame, sha: frame.sha, error: null, savedAt: Date.now() },
      };
    } else if (frame.ok) {
      this.state = {
        ...this.state,
        editor: { ...open, status: 'ready', error: null, savedAt: Date.now() },
      };
    } else {
      this.state = {
        ...this.state,
        editor: {
          ...open,
          status: frame.conflict ? 'conflict' : 'ready',
          error: frame.error ?? 'save refused',
        },
      };
    }
    this.emit();
  }

  markSaving(): void {
    const open = this.state.editor;
    if (!open) return;
    this.state = { ...this.state, editor: { ...open, status: 'saving', error: null } };
    this.emit();
  }

  /** Stages a scope edit (or any field patch) into the open frame: it lands on the next save. */
  stage(name: string, patch: Partial<AgentFileResultFrame>): void {
    const open = this.state.editor;
    if (!open || open.name !== name || !open.frame) return;
    this.state = { ...this.state, editor: { ...open, frame: { ...open.frame, ...patch } } };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const agentsFileStore = new AgentsFileStoreImpl();

const subscribe = (listener: Listener): (() => void) => agentsFileStore.subscribe(listener);

export function useAgentsFile(): AgentsFileState {
  return useSyncExternalStore(subscribe, () => agentsFileStore.getSnapshot());
}

/** True when the editor holds a file (or is still loading it). */
export function hasOpenAgentFile(state: AgentsFileState): boolean {
  return state.editor !== null;
}
