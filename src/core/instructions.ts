import { useSyncExternalStore } from 'react';
import type {
  InstructionEntry,
  InstructionsFileFrame,
  InstructionsListResultFrame,
  InstructionsSavedFrame,
  NestedInstruction,
} from './protocol';

type Listener = () => void;

export type InstructionsStatus = 'unknown' | 'ready' | 'unsupported';

/** What the editor is doing, so the screen never guesses from a combination of nulls. */
export type EditorStatus = 'loading' | 'ready' | 'saving' | 'conflict';

export interface EditorState {
  workspace: string;
  file: string;
  status: EditorStatus;
  /** Text as the user has it, which diverges from `loaded` as soon as they type. */
  draft: string;
  /** What the server sent, to tell a real edit from a round trip. */
  loaded: string;
  /** sha of `loaded`; undefined means this save would create the file. */
  sha: string | undefined;
  origin: InstructionsFileFrame['origin'] | null;
  from: string;
  editable: boolean;
  error: string | null;
}

/** The layer screen's working copy of one file's policy, seeded from the server's entry. */
export interface LayerState {
  workspace: string;
  file: string;
  inherit: string;
  off: boolean;
  /** In-flight instructions.layer.set frames; the header shows "..." while above zero. */
  saving: number;
  error: string | null;
}

interface InstructionsState {
  status: InstructionsStatus;
  entries: InstructionEntry[];
  nested: NestedInstruction[];
  /** Workspaces whose nested list the server cut at its cap. Empty on a server that predates
   *  the field, which is indistinguishable from "nothing was cut" -- older servers capped the
   *  whole scan and could not report it either. */
  nestedTruncated: string[];
  files: string[];
  maxBytes: number;
  agentLayers: Array<{ agent: string; layers: string[] }>;
  error: string | null;
  editor: EditorState | null;
  layer: LayerState | null;
}

const EMPTY: InstructionsState = {
  status: 'unknown',
  entries: [],
  nested: [],
  nestedTruncated: [],
  files: [],
  maxBytes: 0,
  agentLayers: [],
  error: null,
  editor: null,
  layer: null,
};

/**
 * The prompt files of every workspace, mirrored from the server. Like the agents store, the
 * server owns the truth: nothing here is written optimistically, and a save only lands when
 * `instructions.saved` says it did. `unsupported` means a server that predates the frames never
 * answered, so the page can say so instead of spinning.
 */
class InstructionsStoreImpl {
  private state: InstructionsState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): InstructionsState {
    return this.state;
  }

  /** Drops everything. Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  request(): void {
    this.state = { ...this.state, status: this.state.status === 'ready' ? 'ready' : 'unknown', error: null };
    this.emit();
  }

  receive(frame: InstructionsListResultFrame): void {
    const open = this.state.layer;
    // A list.result while a policy save is in flight IS the save's answer: re-seed the draft
    // from what the server stored and burn one in-flight slot. Any other list (a refresh, or
    // another device's edit) must not clobber a draft the user is typing.
    const layer =
      open && open.saving > 0
        ? (() => {
            const fresh = frame.entries.find(e => e.workspace === open.workspace && e.file === open.file);
            const saving = open.saving - 1;
            return {
              ...open,
              inherit: fresh?.inherit ?? open.inherit,
              off: fresh?.off ?? open.off,
              saving,
              error: saving === 0 ? null : open.error,
            };
          })()
        : open;
    this.state = {
      ...this.state,
      status: 'ready',
      entries: frame.entries,
      nested: frame.nested,
      nestedTruncated: frame.nestedTruncated ?? [],
      files: frame.files,
      maxBytes: frame.maxBytes,
      agentLayers: frame.agentLayers ?? this.state.agentLayers,
      error: null,
      layer,
    };
    this.emit();
  }

  markUnsupported(): void {
    if (this.state.status === 'ready') return;
    this.state = { ...this.state, status: 'unsupported' };
    this.emit();
  }

  fail(message: string): void {
    // An editor waiting on an answer must not stay stuck on "loading" or "saving" when the
    // request is refused. A conflict is kept: it is a state the user still has to resolve.
    const open = this.state.editor;
    const editor: EditorState | null = open
      ? { ...open, status: open.status === 'conflict' ? 'conflict' : 'ready', error: message }
      : null;
    const layer = this.state.layer ? { ...this.state.layer, saving: 0, error: message } : null;
    this.state = { ...this.state, error: message, editor, layer };
    this.emit();
  }

  /** The layer screen's own failure channel, for a save the server never answered. No-op once
   *  the save already landed: the stale timer must not paint an error on a done save. */
  failLayer(message: string): void {
    const layer = this.state.layer;
    if (!layer || layer.saving === 0) return;
    this.state = { ...this.state, layer: { ...layer, saving: 0, error: message } };
    this.emit();
  }

  /** Opens the editor before the content arrives, so the screen can render its own loading state. */
  openEditor(workspace: string, file: string): void {
    this.state = {
      ...this.state,
      editor: {
        workspace,
        file,
        status: 'loading',
        draft: '',
        loaded: '',
        sha: undefined,
        origin: null,
        from: '',
        editable: false,
        error: null,
      },
    };
    this.emit();
  }

  closeEditor(): void {
    this.state = { ...this.state, editor: null };
    this.emit();
  }

  receiveFile(frame: InstructionsFileFrame): void {
    const open = this.state.editor;
    // A late answer for a file the user already left must not overwrite what is on screen.
    if (!open || open.workspace !== frame.workspace || open.file !== frame.file) return;
    this.state = {
      ...this.state,
      editor: {
        ...open,
        status: 'ready',
        draft: frame.content,
        loaded: frame.content,
        // An inherited or fallback copy has no file to overwrite: saving it creates the override,
        // which is why the sha is dropped rather than echoed back. An off file with an own copy
        // keeps the sha: the user is editing the file itself, not creating an override.
        sha: frame.origin === 'own' || frame.origin === 'off' ? frame.sha : undefined,
        origin: frame.origin,
        from: frame.from,
        editable: frame.editable,
        error: null,
      },
    };
    this.emit();
  }

  edit(draft: string): void {
    if (!this.state.editor) return;
    this.state = { ...this.state, editor: { ...this.state.editor, draft, error: null } };
    this.emit();
  }

  markSaving(): void {
    if (!this.state.editor) return;
    this.state = { ...this.state, editor: { ...this.state.editor, status: 'saving', error: null } };
    this.emit();
  }

  receiveSaved(frame: InstructionsSavedFrame): void {
    const open = this.state.editor;
    if (!open || open.workspace !== frame.workspace || open.file !== frame.file) return;
    if (frame.ok) {
      this.state = {
        ...this.state,
        editor: { ...open, status: 'ready', loaded: open.draft, sha: frame.sha, origin: 'own', from: frame.workspace, error: null },
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

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Opens the layer screen, seeded from the entry the list already holds. */
  openLayer(workspace: string, file: string): void {
    const entry = this.state.entries.find(e => e.workspace === workspace && e.file === file);
    this.state = {
      ...this.state,
      layer: {
        workspace,
        file,
        inherit: entry?.inherit ?? 'default',
        off: entry?.off ?? false,
        saving: 0,
        error: null,
      },
    };
    this.emit();
  }

  closeLayer(): void {
    this.state = { ...this.state, layer: null };
    this.emit();
  }

  editLayer(patch: { inherit?: string; off?: boolean }): void {
    const layer = this.state.layer;
    if (!layer || layer.saving > 0) return;
    this.state = { ...this.state, layer: { ...layer, ...patch, error: null } };
    this.emit();
  }

  markLayerSaving(count: number): void {
    const layer = this.state.layer;
    if (!layer) return;
    this.state = { ...this.state, layer: { ...layer, saving: count, error: null } };
    this.emit();
  }
}

export const instructionsStore = new InstructionsStoreImpl();

const subscribe = (listener: Listener): (() => void) => instructionsStore.subscribe(listener);

export function useInstructions(): InstructionsState {
  return useSyncExternalStore(subscribe, () => instructionsStore.getSnapshot());
}

/**
 * True when saving would do something. An inherited or fallback copy always qualifies, even
 * untouched: saving it writes the override that makes this workspace own the file.
 */
export function isDirty(editor: EditorState): boolean {
  return editor.draft !== editor.loaded || editor.origin !== 'own';
}

/** True when the layer screen's save would change what the server holds. */
export function layerIsDirty(layer: LayerState, entry: InstructionEntry | undefined): boolean {
  return layer.inherit !== (entry?.inherit ?? 'default') || layer.off !== (entry?.off ?? false);
}
