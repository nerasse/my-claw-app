import type { DeviceInfo } from './device';
import type { SkillEntry } from './protocol';

export type SkillSource = SkillEntry['source'];

/** URL of the raw SKILL.md of a skill, addressed by source+name+workspace like the server
 *  serves it. The workspace key is what tells two projects' same-named skills apart. */
export function skillUrl(
  mediaBase: string,
  deviceInfo: DeviceInfo,
  source: SkillSource,
  name: string,
  workspace?: string,
): string {
  // The credential pair is omitted rather than sent empty: a browser has none, and its cookie
  // is what the server falls back to.
  const params = new URLSearchParams({
    ...(deviceInfo.deviceId ? { device: deviceInfo.deviceId, token: deviceInfo.token } : {}),
    source,
    name,
    ...(workspace ? { workspace } : {}),
  });
  return `${mediaBase}/skills?${params.toString()}`;
}

export interface SkillDoc {
  /** YAML frontmatter, already parsed into the few fields the app shows. */
  meta: { name?: string; description?: string; version?: string };
  /** The markdown body, without the frontmatter block. */
  body: string;
  /** The whole file, for a future raw view. */
  raw: string;
}

/** Splits a SKILL.md into its YAML frontmatter (when present) and its markdown body. */
export function splitSkillDoc(text: string): SkillDoc {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  if (!match) return { meta: {}, body: text, raw: text };
  const meta: SkillDoc['meta'] = {};
  for (const line of match[1]!.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (key === 'name' || key === 'description' || key === 'version') meta[key] = value;
  }
  return { meta, body: match[2]!, raw: text };
}
