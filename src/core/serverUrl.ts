/**
 * Where the agent lives, and how this client proves who it is.
 *
 * On a phone the address is a setting and the credential travels in the query string, because a
 * native socket carries no cookie jar. No address is built in: a new install asks for one (the QR
 * of `myclaw setup` carries it), so an APK handed to someone points at nobody's network. The web build replaces this file (serverUrl.web.ts): the
 * page is served by the agent itself, so the address is the page's own origin and the credential
 * is a cookie the browser attaches on its own.
 */

export const DEFAULT_SERVER_URL = '';

export const DEFAULT_HTTP_ORIGIN = '';

/** `https://host/pair#CODE`, the claim URL the QR of `myclaw setup` encodes, read as the socket address. */
export function serverFromClaimUrl(raw: string): string | null {
  const match = /^(https?):\/\/([^\s/?#]+)\/pair(?:[/?#]|$)/i.exec(raw.trim());
  if (!match) return null;
  return `${match[1].toLowerCase() === 'https' ? 'wss' : 'ws'}://${match[2]}/my-claw-app`;
}

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

/**
 * The socket address of what the owner typed. A bare server address (`http://10.0.0.5:8080`,
 * which the Join screen asks for) is the server, not its socket: connected as it is, it asked for
 * `/` and got a 401 that read as "this server does not know this device". With a path, it is
 * taken as written.
 */
export function socketUrl(url: string): string {
  const match = /^(wss?|https?):\/\/([^\s/?#]+)\/?$/i.exec(url.trim());
  if (!match) return url.trim();
  const secure = /^(wss|https)$/i.test(match[1]!);
  return `${secure ? 'wss' : 'ws'}://${match[2]}/my-claw-app`;
}

/**
 * The credential of a URL that a view loads by itself (an image, a player, a download): the
 * server's media ticket, which only reads media and expires. Null until the server has sent one,
 * and a URL built without it would be a 401: the caller waits. The device token never goes in a
 * URL, where every proxy on the way logs it.
 */
export { authQuery, authHeaders } from './serverCredentials';
