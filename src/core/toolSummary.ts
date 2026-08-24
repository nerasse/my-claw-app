/**
 * What a tool call says about itself on one line.
 *
 * A collapsed card used to show the first argument, whatever it happened to be, cut at sixty
 * characters. Object order is the model's business, so `read` showed a path, `search` showed a
 * regex or a directory depending on the call, and `apply_patch` showed the first hunk of a patch.
 * A wall of cards was unreadable at a glance, which is the only thing a collapsed card is for.
 *
 * So each tool names the argument that identifies the call, and everything else stays folded.
 * Nothing here is validated against the server: a tool that is not listed falls back to the old
 * first-argument preview, and an MCP tool or a plugin therefore still reads sensibly.
 */

/** Families, for the glyph alone. A reader scanning a thread sorts by shape before words. */
const GLYPH: Record<string, string> = {
  file: '◧',
  shell: '›',
  net: '⚲',
  memory: '❖',
  agent: '◈',
  browser: '⌘',
  time: '◔',
  voice: '♪',
};

/** tool -> family. Absent means no glyph: a plugin has no shape we know of. */
const FAMILY: Record<string, keyof typeof GLYPH> = {
  read: 'file',
  write: 'file',
  apply_patch: 'file',
  ls: 'file',
  search: 'file',
  bash: 'shell',
  fetch: 'net',
  web_search: 'net',
  memory: 'memory',
  conversation_search: 'memory',
  spawn: 'agent',
  send: 'agent',
  list_agents: 'agent',
  kill_agent: 'agent',
  reset_agent: 'agent',
  list_skills: 'agent',
  read_skill: 'agent',
  manage_skills: 'agent',
  workspaces: 'agent',
  cron: 'time',
  stt: 'voice',
  tts: 'voice',
  voice_mode: 'voice',
};

/**
 * The argument that identifies a call, per tool, best first. A tool absent from this table (an
 * MCP server's, a plugin's) falls through to `summarizeArgs`.
 */
const KEYS: Record<string, readonly string[]> = {
  read: ['path'],
  write: ['path'],
  apply_patch: ['path'],
  ls: ['path'],
  search: ['pattern', 'glob', 'path'],
  bash: ['command'],
  fetch: ['url'],
  web_search: ['query'],
  memory: ['content', 'query', 'old_text'],
  conversation_search: ['query', 'hit_id'],
  // Both have a card of their own (SubAgentCard); listed so an old build, or a card rendered
  // outside a thread, still reads as a sub-agent call rather than as an unknown tool.
  spawn: ['name'],
  send: ['id'],
  list_agents: [],
  kill_agent: ['id'],
  reset_agent: ['id'],
  list_skills: [],
  read_skill: ['name'],
  manage_skills: ['name'],
  workspaces: ['key', 'path'],
  cron: ['name', 'job_id', 'prompt'],
  stt: ['filePath'],
  tts: ['text'],
  voice_mode: ['feature'],
  delegate_browser_task: ['instructions'],
};

/** Tools whose `action`/`mode` says as much as their target, shown ahead of it. */
const VERB_KEYS: readonly string[] = ['action', 'mode', 'method'];

/** How much of a one-line preview survives. Past this a phone wraps or clips anyway. */
const MAX_DETAIL = 72;

function firstString(args: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

/**
 * A path, shortened from the left: the last two segments identify a file and the tree above it
 * rarely does. `/home/neras/dev/my-claw-app/src/core/chat.ts` -> `core/chat.ts`.
 */
export function shortenPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join('/');
}

function clamp(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL)}…` : flat;
}

export interface ToolSummary {
  /** The family's shape, or '' for a tool we know nothing about. */
  glyph: string;
  /** What the call did, in as few characters as identify it. May be empty. */
  detail: string;
  /** Whether `detail` is code (a path, a command, a pattern) and wants the monospace face. */
  mono: boolean;
}

/**
 * One line for a collapsed card.
 *
 * @param fallback What to show when the tool is unknown here: the caller passes `summarizeArgs`
 * so this module owes nothing to the generic preview and can be tested on its own.
 */
export function summarizeTool(name: string, args: Record<string, unknown>, fallback = ''): ToolSummary {
  const family = FAMILY[name];
  const glyph = family ? GLYPH[family] : '';
  const keys = KEYS[name];
  if (!keys) return { glyph, detail: clamp(fallback), mono: false };

  const verb = firstString(args, VERB_KEYS);
  let target = firstString(args, keys);
  // A path is the one thing worth abbreviating: the tree above a file is noise at a glance, and
  // it is the head of the string that gets clipped otherwise -- exactly the identifying half.
  if (target.startsWith('/') || target.startsWith('./')) target = shortenPath(target);

  const detail = [verb, target].filter(Boolean).join(' ');
  return {
    glyph,
    detail: clamp(detail || fallback),
    // A verb on its own is a word, not code. Anything carrying a target is a path, a command or
    // a pattern, and reads wrong in the prose face.
    mono: Boolean(target) && family !== undefined && family !== 'agent',
  };
}
