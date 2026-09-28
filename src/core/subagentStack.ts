import type { SubAgentEntry } from './protocol';

/**
 * A sub-agent chat opened from another one: a cron run, one of its volets, the browser task that
 * volet delegated. Each view keeps the view it was opened from, so the way back is the way in, one
 * level at a time, and every level comes back as what it was (its header, its parent, its sends).
 * Derived where the view is made, never kept beside it: there is no second list to keep in step.
 */
export interface StackedView {
  threadId: string;
  id: string;
  parentThreadId: string;
  parent?: StackedView;
}

/** The view to open, stacked on the one on screen when that is the conversation it was opened from. */
export function stackedOn<V extends StackedView>(view: Omit<V, 'parent'>, onScreen: V | null): V {
  return (onScreen && onScreen.threadId === view.parentThreadId ? { ...view, parent: onScreen } : view) as V;
}

/** Where back leads from a sub-agent chat: the sub-agent it was opened from, else its conversation. */
export function backFrom<V extends StackedView>(view: V): { view: V } | { threadId: string } {
  return view.parent ? { view: view.parent as V } : { threadId: view.parentThreadId };
}

/** What the back row names: the sub-agent one level up, or the conversation's own title. */
export function backLabel(view: StackedView, titleOf: (threadId: string) => string): string {
  return view.parent ? view.parent.id.replace(/^subagent\//, '') : titleOf(view.parentThreadId);
}

/**
 * The rosters a thread on screen needs: its parent's (the siblings the header offers) and its own
 * (the sub-agents and browser tasks it started, whose cards open them). One list for the main
 * conversation, where both are the same.
 */
export function rostersFor(threadId: string, parentThreadId?: string | null): string[] {
  return parentThreadId && parentThreadId !== threadId ? [parentThreadId, threadId] : [threadId];
}

/**
 * What a card on screen can open: the thread's own roster first, then its parent's. A browser task
 * is private to the sub-agent that started it, so it is only ever in the first; a shared agent may
 * be in both, and is one row.
 */
export function reachableFrom(own: readonly SubAgentEntry[], parent: readonly SubAgentEntry[]): SubAgentEntry[] {
  if (own === parent) return [...own];
  const seen = new Set(own.map(agent => agent.id));
  return [...own, ...parent.filter(agent => !seen.has(agent.id))];
}
