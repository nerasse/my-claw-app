import { isValidServerUrl } from './serverUrl';
import { httpOrigin } from './utils';

export function originFromPairingScan(raw: string): string | null {
  const value = raw.trim();
  const authority = /^https?:\/\/([^\s/?#]+)/i.exec(value)?.[1];
  if (!authority || authority.includes('@') || !isValidServerUrl(value)) return null;
  return httpOrigin(value, '') || null;
}
