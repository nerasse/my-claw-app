/**
 * The address bar as app state. Android has none, so all of this is a no-op there and the
 * hardware back key keeps doing the job `watchBack` does in a browser.
 */

export interface Route {
  threadId: string | null;
}

export function initialRoute(): Route {
  return { threadId: null };
}

export function showThread(_threadId: string | null, _replace = false): void {
  // Android: nothing to address.
}

export function watchBack(_handlers: {
  closeTopLayer: () => boolean;
  showRoute: (route: Route) => void;
}): () => void {
  return () => {};
}
