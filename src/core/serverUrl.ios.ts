export const DEFAULT_SERVER_URL = '';
export const DEFAULT_HTTP_ORIGIN = '';

export function isValidServerUrl(raw: string): boolean {
  const match = /^(wss?|https?):\/\/([^\s/?#]+)\S*$/i.exec(raw.trim());
  if (!match || match[2]!.includes('@')) return false;
  return __DEV__ || ['wss', 'https'].includes(match[1]!.toLowerCase());
}

/** Same as Android: a bare server address is the server, its socket is `/my-claw-app` on it. */
export function socketUrl(url: string): string {
  const match = /^(wss?|https?):\/\/([^\s/?#]+)\/?$/i.exec(url.trim());
  if (!match) return url.trim();
  const secure = /^(wss|https)$/i.test(match[1]!);
  return `${secure ? 'wss' : 'ws'}://${match[2]}/my-claw-app`;
}

export { authQuery, authHeaders } from './serverCredentials';

export function serverFromClaimUrl(raw: string): string | null {
  const match = /^(https?):\/\/([^\s/?#]+)\/pair(?:[/?#]|$)/i.exec(raw.trim());
  if (!match || !isValidServerUrl(raw)) return null;
  return `${match[1]!.toLowerCase() === 'https' ? 'wss' : 'ws'}://${match[2]}/my-claw-app`;
}
