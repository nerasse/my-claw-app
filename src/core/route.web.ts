/// <reference lib="dom" />

/**
 * The address bar as app state.
 *
 * Three things a browser gives for free and the port was throwing away: a reload that lands where
 * you were, a Back button that steps back through the app instead of leaving it, and a link to a
 * conversation that can be sent to another window. All three are one small router.
 *
 * `/t/<threadId>` is the only address with content. Everything else (settings, files, a viewer)
 * is a layer over it: layers are not addressed, they are what Back closes first.
 */

export interface Route {
  threadId: string | null;
}

/** Sub-agent thread ids contain a slash, so the segment is encoded, not raw. */
const THREAD_PATH = /^\/t\/(.+)$/;

/**
 * The entry the app believes it is on. popstate fires after the browser has already moved, so
 * the address that was left has to be remembered to be pushed back when a layer eats the press.
 */
let current = typeof window === 'undefined' ? '/' : window.location.pathname;

function pathOf(threadId: string | null): string {
  return threadId ? `/t/${encodeURIComponent(threadId)}` : '/';
}

function routeOf(pathname: string): Route {
  const match = THREAD_PATH.exec(pathname);
  if (!match?.[1]) return { threadId: null };
  try {
    return { threadId: decodeURIComponent(match[1]) };
  } catch {
    return { threadId: null };
  }
}

export function initialRoute(): Route {
  return routeOf(window.location.pathname);
}

/**
 * Points the address bar at a conversation.
 *
 * A push, so Back walks back through the conversations visited, except on the very first sync
 * after boot: the app restoring the last thread must not leave a Back step that unloads it.
 */
export function showThread(threadId: string | null, replace = false): void {
  const path = pathOf(threadId);
  if (path === window.location.pathname) {
    current = path;
    return;
  }
  const state = { claw: true };
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
      window.history.pushState({ claw: true }, '', current);
      return;
    }
    current = landed;
    handlers.showRoute(routeOf(landed));
  };

  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
