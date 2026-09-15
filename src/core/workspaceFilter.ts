import type { SessionSummary } from './protocol';

/** The default workspace, as the server spells it when a conversation never chose one. */
const DEFAULT_WORKSPACE = 'default';

export interface WorkspaceOption {
  key: string;
  /** How many conversations of the listing run in it. */
  count: number;
  /** The most recent activity in it: what the picker orders by. */
  lastActiveAt: string;
}

/**
 * The workspaces the owner actually has conversations in, most recently used first.
 *
 * Built from the listing and not from the declared workspaces: one the owner configured and never
 * used has nothing to filter, and a hundred of them would turn a picker into a wall. The listing
 * is also the only thing that knows which ones are in use right now, including the ones created
 * since the config was last read.
 *
 * Ordered by activity rather than by count, because the filter answers "take me back to what I
 * was doing", not "show me my biggest folder".
 */
export function workspaceOptions(sessions: SessionSummary[]): WorkspaceOption[] {
  const byKey = new Map<string, WorkspaceOption>();
  for (const session of sessions) {
    const key = session.workspace ?? DEFAULT_WORKSPACE;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { key, count: 1, lastActiveAt: session.lastActiveAt });
      continue;
    }
    existing.count += 1;
    if (session.lastActiveAt > existing.lastActiveAt) existing.lastActiveAt = session.lastActiveAt;
  }
  return [...byKey.values()].sort((left, right) =>
    // A tie goes to the name, so the picker does not reshuffle between two renders of one listing.
    left.lastActiveAt === right.lastActiveAt
      ? left.key.localeCompare(right.key)
      : left.lastActiveAt < right.lastActiveAt
        ? 1
        : -1,
  );
}

/**
 * Whether a conversation belongs to the filtered workspace. `null` filters nothing out.
 *
 * A conversation that never chose a workspace is in `default`, which is why the comparison is not
 * `session.workspace === filter`: the absence is a value here, and the picker offers it by name.
 */
export function matchesWorkspace(session: SessionSummary, filter: string | null): boolean {
  return filter === null || (session.workspace ?? DEFAULT_WORKSPACE) === filter;
}
