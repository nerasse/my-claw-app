/// <reference lib="dom" />

/**
 * Web counterpart of serverUrl.ts.
 *
 * The bundle is served by the agent, so its origin is the answer: no address to configure, and
 * nothing to get wrong. The scheme is derived from the page, never hardcoded, because a page
 * loaded over HTTPS may not open a `ws://` socket (mixed content, with an error that blames the
 * wrong thing).
 *
 * The credential is the session cookie set at pairing. It is HttpOnly, so this code cannot read
 * it and does not need to: the browser attaches it to the socket handshake, to every asset and
 * to every `<img src>` on its own.
 */

function origin(): string {
  return typeof location === 'undefined' ? 'http://localhost:8080' : location.origin;
}

export const DEFAULT_SERVER_URL =
  typeof location === 'undefined'
    ? 'ws://localhost:8080/my-claw-app'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/my-claw-app`;

export const DEFAULT_HTTP_ORIGIN = origin();

/** The session cookie covers every URL: nothing to add, and nothing to wait for. */
export function authQuery(_deviceInfo?: unknown): string {
  return '';
}

export function authHeaders(_deviceInfo?: unknown): Record<string, string> {
  return {};
}

/** Twin of the native one; a browser pairs on the server's /pair page and never scans. */
export function serverFromClaimUrl(_raw: string): string | null {
  return null;
}

/** Twin of the native check. The address is the page's own origin here, so it always holds. */
export function isValidServerUrl(url: string): boolean {
  return /^(wss?|https?):\/\/[^\s/?#]+\S*$/i.test(url.trim());
}
