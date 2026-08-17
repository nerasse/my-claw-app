/**
 * Where the agent lives, and how this client proves who it is.
 *
 * On a phone the address is a setting and the credential travels in the query string, because a
 * native socket carries no cookie jar. The web build replaces this file (serverUrl.web.ts): the
 * page is served by the agent itself, so the address is the page's own origin and the credential
 * is a cookie the browser attaches on its own.
 */

export const DEFAULT_SERVER_URL = 'ws://10.10.20.10:8080/my-claw-app';

export const DEFAULT_HTTP_ORIGIN = 'http://10.10.20.10:8080';

/**
 * Whether an address can be handed to the socket at all.
 *
 * OkHttp refuses anything that is not http/https/ws/wss by throwing, from a service callback
 * where nothing catches it: an address typed without its scheme killed the app, was persisted as
 * it was typed, and killed it again on every launch until its data was cleared.
 */
export function isValidServerUrl(url: string): boolean {
  return /^(wss?|https?):\/\/[^\s/?#]+\S*$/i.test(url.trim());
}

/** The `?device=&token=` a media or skill URL needs, or an empty string when a cookie covers it. */
export function authQuery(deviceInfo: { deviceId: string; token: string }): string {
  if (!deviceInfo.deviceId || !deviceInfo.token) return '';
  return `device=${encodeURIComponent(deviceInfo.deviceId)}&token=${encodeURIComponent(deviceInfo.token)}`;
}
