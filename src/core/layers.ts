import type { InstructionEntry } from './protocol';

/** The layer a prompt file feeds, for the agents-that-cut section. */
export const FILE_LAYERS: Record<string, string> = {
  'CORE.md': 'CORE',
  'SOUL.md': 'SOUL',
  'AGENTS.md': 'AGENTS',
  'USER.md': 'USER',
};

export function layerOfFile(file: string): string {
  return FILE_LAYERS[file] ?? file;
}

export type SourceStatus =
  | { kind: 'default' }
  | { kind: 'builtin' }
  | { kind: 'none' }
  | { kind: 'workspace'; key: string; self: boolean; removed: boolean };

/**
 * What the entry's configured source actually is. `removed` names a workspace that is not
 * configured any more, `self` names this very workspace: both end on the shipped template,
 * which is why they need their own wording instead of a dead workspace's name.
 */
export function sourceStatusOf(entry: InstructionEntry, workspaceKeys: string[]): SourceStatus {
  const inherit = entry.inherit ?? 'default';
  if (inherit === 'default') return { kind: 'default' };
  if (inherit === 'builtin') return { kind: 'builtin' };
  if (inherit === 'none') return { kind: 'none' };
  return {
    kind: 'workspace',
    key: inherit,
    self: inherit === entry.workspace,
    removed: !workspaceKeys.includes(inherit),
  };
}

/** Whether the source workspace owns this file itself (origin "own"), which is the one-hop rule:
 *  when it does not, the ladder lands on the shipped template instead of the source's own
 *  inheritance. */
export function sourceOwnsFile(entry: InstructionEntry, entries: InstructionEntry[]): boolean {
  return entries.find(e => e.workspace === entry.inherit && e.file === entry.file)?.origin === 'own';
}
