import type { FolderSummary, SessionSummary } from './protocol';

/** The label the conversations in no folder carry, once the list has folders to be in. */
const UNFILED_LABEL = 'No folder';

/**
 * The label the same section carries when it is the only one.
 *
 * A list with no folders in it is the drawer as it has always read, and naming that section "No
 * folder" would be answering a question nobody asked. The section is only named once it has
 * siblings to be told apart from.
 */
const SOLO_LABEL = 'conversations';

export interface SessionSection {
  /** null for the conversations nobody filed. */
  folder: FolderSummary | null;
  label: string;
  /** The rows to draw under the header, already narrowed by the search and the filter. */
  rows: SessionSummary[];
}

/**
 * The conversation list as sections: one per folder in rank order, the unfiled ones last.
 *
 * The rows are handed in already narrowed -- the search and the workspace filter have run -- and
 * this only groups them, so a section can never hold a row the owner asked not to see. The counts
 * the drawer draws come from the same rows, which is what makes a folded folder's count say "two
 * conversations match" rather than "two exist somewhere".
 *
 * Rules for what is drawn, in the order they matter:
 *
 * - a folder holding a visible row is drawn, with them;
 * - an empty folder is drawn as long as nothing is filtered, because a folder the owner just made
 *   has to be somewhere he can see and file into;
 * - under a workspace filter, an empty folder is drawn only if it was born in that workspace: it is
 *   the one case where the owner expects to find it and there is nothing else to prove it exists;
 * - a conversation naming a folder the listing does not carry lands in the unfiled section. It is
 *   the only honest place for it, and it keeps a stale folder list from swallowing rows.
 */
export function drawerSections(
  rows: SessionSummary[],
  folders: FolderSummary[],
  filter: string | null,
): SessionSection[] {
  const known = new Set(folders.map(folder => folder.id));
  const byFolder = new Map<string, SessionSummary[]>();
  const unfiled: SessionSummary[] = [];
  for (const row of rows) {
    const folderId = row.folderId;
    if (folderId === undefined || !known.has(folderId)) {
      unfiled.push(row);
      continue;
    }
    const held = byFolder.get(folderId);
    if (held) held.push(row);
    else byFolder.set(folderId, [row]);
  }

  const sections: SessionSection[] = [];
  for (const folder of [...folders].sort((left, right) => left.rank - right.rank)) {
    const held = byFolder.get(folder.id) ?? [];
    if (held.length === 0 && filter !== null && folder.workspace !== filter) continue;
    sections.push({ folder, label: folder.name, rows: held });
  }

  sections.push({
    folder: null,
    label: sections.length === 0 ? SOLO_LABEL : UNFILED_LABEL,
    rows: unfiled,
  });
  return sections;
}
