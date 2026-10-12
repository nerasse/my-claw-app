import { authQuery } from './serverUrl';
import type { DeviceInfo } from './device';

/**
 * Where a stored attachment is served from, for both credentials the server accepts.
 *
 * The query is what the two platforms disagree on: a native client carries `device` and `token`,
 * a browser carries neither and lets the cookie speak. Built in one place because a caller that
 * appended `&thumb=1` by hand produced `/media/id&thumb=1` on the cookie path, where there was
 * no query to extend.
 *
 * Returns the empty string while the identity is still unknown: a URL built without it would be
 * a 401 and a broken image.
 */
export function mediaUrl(
  mediaBase: string,
  deviceInfo: DeviceInfo | null,
  id: string,
  extra?: Record<string, string>,
): string {
  if (!deviceInfo) return '';
  const credential = authQuery(deviceInfo);
  if (credential === null) return '';
  const parts = [credential];
  for (const [key, value] of Object.entries(extra ?? {})) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  const query = parts.filter(Boolean).join('&');
  return `${mediaBase}/media/${id}${query ? `?${query}` : ''}`;
}
