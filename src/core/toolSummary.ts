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

import { PREVIEW_GUARD, type ArgsPreview } from './utils';

/**
 * What kind of thing a tool touches. Not drawn: a per-family glyph in the card head was tried and
 * removed -- a row already carries a chevron, and a second mark next to it read as a stray arrow
 * rather than as a category. The families stay because they decide the face of the preview.
 */
type Family = 'file' | 'shell' | 'net' | 'memory' | 'agent' | 'browser' | 'time' | 'voice';

/** tool -> family. Absent is a tool we know nothing about (an MCP server's, a plugin's). */
const FAMILY: Record<string, Family> = {
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
  question: 'agent',
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
  question: ['header'],
};

/**
 * The argument whose *value* is the subject of the call, per tool.
 *
 * Distinct from KEYS above, which names the argument that identifies a call in one line. A path
 * is a label: it says which file, and the card head says it best. `bash.command` is not a label,
 * it is the thing that ran, and `write.content` is the text that landed on disk -- which appeared
 * nowhere on screen at all, since the output of a write is a confirmation, not the content.
 *
 * A content argument is rendered as its own block, unfolded, in the monospace face, with the same
 * height cap and the same actions as an output. What is left goes in the ARGUMENTS fold, so
 * nothing is shown twice and the fold disappears when it holds nothing.
 *
 * Absent on purpose: `spawn`/`send`, whose task and result SubAgentCard renders itself.
 *
 * `apply_patch.edits` is here despite the output carrying the diff of what changed, because that
 * only holds when the patch applied. A refused patch answers with an error, and then what the
 * agent tried to write appears nowhere at all -- which is exactly the case a reader needs to see.
 */
const CONTENT_KEYS: Record<string, string> = {
  bash: 'command',
  write: 'content',
  manage_skills: 'instructions',
  tts: 'text',
  cron: 'prompt',
  delegate_browser_task: 'instructions',
  memory: 'content',
  fetch: 'body',
  apply_patch: 'edits',
};

/**
 * `apply_patch.edits` is a list of replacements, not a string. Serialized as JSON it is the very
 * thing the ARGUMENTS fold was hiding: a patch as escaped one-liners. So it is laid out as the
 * pairs it is, each side verbatim, which is what makes a refused patch readable.
 */
function editsAsText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const blocks: string[] = [];
  for (const [index, edit] of value.entries()) {
    if (typeof edit !== 'object' || edit === null) return '';
    const { old, new: replacement } = edit as { old?: unknown; new?: unknown };
    if (typeof old !== 'string' || typeof replacement !== 'string') return '';
    const label = value.length > 1 ? ` ${index + 1}` : '';
    // An empty replacement is a deletion, and saying so beats showing nothing under the header.
    blocks.push(`edit${label} · old\n${old}\n\nedit${label} · new\n${replacement || '(deleted)'}`);
  }
  return blocks.join('\n\n');
}

export interface ToolContent {
  /** The argument name, drawn as the block's label. */
  key: string;
  /** Its value, verbatim: this is the one thing that must not be reformatted. */
  text: string;
}

/**
 * The content argument of a call, or null when the tool has none (or sent it empty -- `fetch`
 * only carries a body on POST/PUT, and an empty block is worse than no block).
 */
export function toolContent(name: string, args: Record<string, unknown>): ToolContent | null {
  const key = CONTENT_KEYS[name];
  if (!key) return null;
  const value = args[key];
  if (Array.isArray(value)) {
    const text = editsAsText(value);
    return text ? { key, text } : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  return { key, text: value };
}

/**
 * The rest of the arguments: what the ARGUMENTS fold shows. Returns null when the content
 * argument was the only one, so the caller drops the fold rather than offering an empty `{}`.
 */
export function labelArgs(name: string, args: Record<string, unknown>): Record<string, unknown> | null {
  const key = CONTENT_KEYS[name];
  if (!key || !(key in args)) return Object.keys(args).length > 0 ? args : null;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (k !== key) rest[k] = v;
  return Object.keys(rest).length > 0 ? rest : null;
}

/** Tools whose `action`/`mode` says as much as their target, shown ahead of it. */
const VERB_KEYS: readonly string[] = ['action', 'mode', 'method'];

/**
 * The preview is cut by the layout, not here.
 *
 * This used to stop at 72 characters, on the reasoning that "past this a phone wraps or clips
 * anyway". That held while the chat drew at its design size: barely fifty characters fitted a row,
 * so the layout always clipped first and this cut was never seen. The chat font scale made it
 * visible -- shrink the text and more characters fit, while the cut stayed at 72 and left the rest
 * of the row blank behind an ellipsis that pointed at nothing.
 *
 * A character count cannot know the width it will be drawn in: that depends on the font scale, the
 * screen, the tool name, the failed badge and the duration sharing the row. `numberOfLines={1}` on
 * a `flex: 1` text knows all of it, so the string is handed over whole and clipped at the pixel.
 */
const MAX_DETAIL = PREVIEW_GUARD;

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
  return flat.length > MAX_DETAIL ? flat.slice(0, MAX_DETAIL) : flat;
}

export interface ToolSummary {
  /** What the call did, in as few characters as identify it. May be empty. */
  detail: string;
  /**
   * How many arguments `detail` does not show, for the row to draw beside it. Zero unless the
   * preview came from the generic fallback, which is the only one that hides arguments.
   *
   * A number, not a ` +N` glued to `detail`: the tail of that string is precisely what the row
   * clips, so the count was the first thing to go and the reader lost the only word that said
   * there was more. `docs/tool-preview.md`.
   */
  extraArgs: number;
  /** Whether `detail` is code (a path, a command, a pattern) and wants the monospace face. */
  mono: boolean;
  /**
   * Whether the preview earns its own lines under the head rather than the tail of the head row.
   *
   * Only shell commands do. They are the densest argument drawn here, the one where a cut costs
   * real understanding, and the only one long enough to need the room -- a path is short, and a
   * column of cards stays scannable only while the rows keep a constant height.
   */
  block: boolean;
}

/**
 * One line for a collapsed card.
 *
 * @param fallback What to show when the tool is unknown here: the caller passes `summarizeArgs`
 * so this module owes nothing to the generic preview and can be tested on its own.
 */
export function summarizeTool(
  name: string,
  args: Record<string, unknown>,
  fallback: ArgsPreview = { text: '', extraArgs: 0 },
): ToolSummary {
  const family = FAMILY[name];
  const keys = KEYS[name];
  if (!keys) return { detail: clamp(fallback.text), extraArgs: fallback.extraArgs, mono: false, block: false };

  const verb = firstString(args, VERB_KEYS);
  let target = firstString(args, keys);
  // A path is the one thing worth abbreviating: the tree above a file is noise at a glance, and
  // it is the head of the string that gets clipped otherwise -- exactly the identifying half.
  if (target.startsWith('/') || target.startsWith('./')) target = shortenPath(target);

  const detail = [verb, target].filter(Boolean).join(' ');
  return {
    detail: clamp(detail || fallback.text),
    // A named argument is the call, and what it leaves out is folded on purpose rather than
    // counted: the count belongs to the fallback, which shows whichever argument came first.
    extraArgs: detail ? 0 : fallback.extraArgs,
    // A verb on its own is a word, not code. Anything carrying a target is a path, a command or
    // a pattern, and reads wrong in the prose face.
    mono: Boolean(target) && family !== undefined && family !== 'agent',
    block: family === 'shell' && Boolean(target),
  };
}