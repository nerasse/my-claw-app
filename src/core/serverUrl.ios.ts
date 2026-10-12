export const DEFAULT_SERVER_URL = '';
export const DEFAULT_HTTP_ORIGIN = '';

export function isValidServerUrl(raw: string): boolean {
  const match = /^(wss?|https?):\/\/([^\s/?#]+)\S*$/i.exec(raw.trim());
  if (!match || match[2]!.includes('@')) return false;
  return __DEV__ || ['wss', 'https'].includes(match[1]!.toLowerCase());
}

export { authQuery, authHeaders } from './serverCredentials';

export function serverFromClaimUrl(raw: string): string | null {
  const match = /^(https?):\/\/([^\s/?#]+)\/pair(?:[/?#]|$)/i.exec(raw.trim());
  if (!match || !isValidServerUrl(raw)) return null;
  return `${match[1]!.toLowerCase() === 'https' ? 'wss' : 'ws'}://${match[2]}/my-claw-app`;
}
