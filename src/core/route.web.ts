/// <reference lib="dom" />

/**
 * The address bar as app state.
 *
 * Three things a browser gives for free and the port was throwing away: a reload that lands where
 * you were, a Back button that steps back through the app instead of leaving it, and a link to a
 * conversation that can be sent to another window. All three are one small router.
 *
 * `/t/<threadId>` is the only address with content, and a sub-agent chat extends it instead of
 * replacing it: `/t/<conversation>/a/<sub>/a/<sub>`. A sub-agent is a view *of* a conversation --
 * the way back is the way in, one level at a time -- so the address carries the whole chain. Naming
 * only the last thread lost both facts a reload needs: which conversation the header says the
 * agent came from, and which roster authorises driving it. Everything else (settings, files, a
 * viewer) is a layer over it: layers are not addressed, they are what Back closes first.
 */

export interface Route {
  /** The conversation at the bottom of the chain, or null for the home screen. */
  threadId: string | null;
  /**
   * The sub-agent chats the address names, outermost first. Absent on a plain conversation, which
   * is what keeps every existing link and every notification target valid.
   */
  agents?: string[];
}

/** Sub-agent thread ids contain a slash, so the segment is encoded, not raw. */
const THREAD_PATH = /^\/t\/(.+)$/;

/**
 * The entry the app believes it is on. popstate fires after the browser has already moved, so
 * the address that was left has to be remembered to be pushed back when a layer eats the press.
 */
let current = typeof window === 'undefined' ? '/' : window.location.pathname;

/**
 * What our own entries carry besides the path: how many of them the app has pushed.
 *
 * It is what lets an in-app "back" (the chevron of a sub-agent chat) be a real history step rather
 * than a new entry that puts the page it left one Back press away. A page loaded from a URL starts
 * at zero, and so does an entry written before this existed.
 */
interface ClawState {
  claw: true;
  depth: number;
}

function depthOf(): number {
  const state = window.history.state as Partial<ClawState> | null;
  return typeof state?.depth === 'number' ? state.depth : 0;
}

/**
 * Steps back one entry, when this page has one of ours before it. False means "nothing to go back
 * to" -- a reload on a deep link, or the first page of the visit -- and the caller navigates itself.
 */
export function goBack(): boolean {
  if (depthOf() <= 0) return false;
  window.history.back();
  return true;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function pathOf(threadId: string | null, agents: readonly string[]): string {
  if (!threadId) return '/';
  const levels = agents.map(thread => `/a/${encodeSegment(thread)}`).join('');
  return `/t/${encodeSegment(threadId)}${levels}`;
}

function routeOf(pathname: string): Route {
  const raw = THREAD_PATH.exec(pathname)?.[1];
  if (!raw) return { threadId: null };
  // Split on the raw separator first: a segment is encoded, so a `/` inside an id is `%2F` and
  // never a boundary. Decoding first would cut `subagent%2Fresearcher-a7b3` in two.
  const parts = raw.split('/');
  const threadId = decodeSegment(parts[0]);
  if (!threadId) return { threadId: null };
  // `/t/<thread>` is one segment; anything after it is `/a/<thread>` pairs. A tail this reader does
  // not know is ignored rather than refused: an address written by a newer client still opens the
  // conversation it names instead of the home screen.
  const agents: string[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    if (parts[i] !== 'a') break;
    const level = decodeSegment(parts[i + 1]);
    if (level) agents.push(level);
  }
  return agents.length > 0 ? { threadId, agents } : { threadId };
}

export function initialRoute(): Route {
  return routeOf(window.location.pathname);
}

/**
 * Points the address bar at a conversation, or at a sub-agent chat opened from one.
 *
 * A push, so Back walks back through the conversations visited, except on the very first sync
 * after boot (`replace`) and while a route is being replayed: reopening the levels an address
 * already names must not stack a second copy of them in the history.
 */
export function showThread(threadId: string | null, replace = false, agents: readonly string[] = []): void {
  const path = pathOf(threadId, agents);
  if (path === window.location.pathname) {
    current = path;
    return;
  }
  // A push is one level deeper; a replace keeps the level it replaces. `goBack` reads this to
  // decide whether the chevron can be a history step.
  const state: ClawState = { claw: true, depth: replace ? depthOf() : depthOf() + 1 };
  if (replace) window.history.replaceState(state, '', path);
  else window.history.pushState(state, '', path);
  current = path;
}

export function watchBack(handlers: {
  /** Closes the topmost layer. True when one was open, which is what consumed the press. */
  closeTopLayer: () => boolean;
  /** Nothing was open: the app follows the address bar. */
  showRoute: (route: Route) => void;
}): () => void {
  const onPop = (): void => {
    const landed = window.location.pathname;
    if (handlers.closeTopLayer()) {
      // The press belonged to the layer, not to the history: put the entry back so the
      // conversation stack is exactly as it was.
      window.history.pushState({ claw: true, depth: depthOf() } satisfies ClawState, '', current);
      return;
    }
    current = landed;
    handlers.showRoute(routeOf(landed));
  };

  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
