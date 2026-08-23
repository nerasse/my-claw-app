import { useSyncExternalStore } from 'react';

export interface CommandDef {
  name: string;
  description: string;
}

/**
 * Last known catalog, seeded with the server's list so the menu works offline. Every
 * `commands.list.result` frame replaces it wholesale: a command added on the server shows up
 * in the app on the next menu open, without a release.
 */
const DEFAULT_COMMANDS: CommandDef[] = [
  { name: 'tag', description: 'Model tags: /tag new "name"' },
  { name: 'model', description: 'Show or change current model, or an agent default: /model <agent>' },
  { name: 'models', description: 'List available models' },
  { name: 'effort', description: 'Show or set reasoning effort' },
  { name: 'compact', description: 'Compact session context' },
  { name: 'reload', description: 'Reload skills from disk' },
  { name: 'verbose', description: 'Toggle verbose tool output' },
  { name: 'status', description: 'Session diagnostics: context, tokens, cost, active runs' },
  { name: 'stop', description: 'Stop the running agent and its sub-agents' },
  { name: 'cron', description: 'List scheduled tasks' },
  { name: 'codex', description: 'ChatGPT/Codex login: login|status|logout' },
  { name: 'claude', description: 'Claude subscription: login|set-token|status|logout' },
  { name: 'config', description: 'Config snapshots: history|diff|rollback' },
  { name: 'skills', description: 'List skills, optionally for one agent' },
  { name: 'agents', description: 'List agent types and live sub-agents' },
  { name: 'mcp', description: 'List MCP servers, optionally for one agent' },
  { name: 'instructions', description: 'Dump the composed system prompt' },
  { name: 'help', description: 'List available commands' },
];

type Listener = () => void;

class CommandStoreImpl {
  private commands: CommandDef[] = DEFAULT_COMMANDS;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): CommandDef[] {
    return this.commands;
  }

  replace(commands: CommandDef[]): void {
    if (commands.length === 0) return;
    this.commands = commands;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const commandStore = new CommandStoreImpl();

const subscribeToCommands = (listener: Listener): (() => void) => commandStore.subscribe(listener);

export function useCommands(): CommandDef[] {
  return useSyncExternalStore(subscribeToCommands, () => commandStore.getSnapshot());
}

/** The command token the user is typing, or null when the slash-menu must hide. */
export function commandQuery(text: string): string | null {
  // Leading spaces are fine, but a trailing space means the command was committed: the menu
  // must close ("/model " after an insertion is not "/model" still being typed).
  const match = /^\/([a-z-]*)$/.exec(text.trimStart().toLowerCase());
  return match ? match[1]! : null;
}

export function filterCommands(query: string, list: CommandDef[], limit = 6): CommandDef[] {
  if (!query) return list.slice(0, limit);
  const needle = query.toLowerCase();
  return list.filter(command => command.name.startsWith(needle)).slice(0, limit);
}

/**
 * What a submitted `/tag` text asks for: the tag name to create (`/tag new "name"`), or an
 * empty string for a bare `/tag new` (the name prompt should open), or null for `/tag` alone
 * (the tags page should open), or undefined when the text is not a tag command at all and must
 * stay a typed command for the server.
 */
export function parseTagCommand(text: string): string | null | undefined {
  const trimmed = text.trim();
  if (/^\/tag\s*$/i.test(trimmed)) return null;
  const match = /^\/tag\s+new(?:\s+"([^"]+)")?\s*$/i.exec(trimmed);
  if (match) return match[1] ?? '';
  return undefined;
}
