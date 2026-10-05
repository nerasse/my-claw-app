import { useSyncExternalStore } from 'react';
import { connection } from './connection';
import { encodeReasoning } from './protocol';

/**
 * The reasoning a history page leaves on the server (`reasoningChars`), asked for when the reader
 * opens the line -- the server's docs/run-hydration.md, the same trade as `toolOutput.ts`.
 *
 * Held here rather than on the item: a page or a sync delta rebuilds the bubble from the server's
 * entry, which carries the length and not the text, and what was already read must not go back to
 * "loading" under the reader. A bubble that streamed its reasoning live is remembered the same
 * way when it seals, so the delta that follows the run replaces nothing the reader sees.
 *
 * `null` is a bubble the branch no longer holds: said once, never asked again.
 */
const known = new Map<string, string | null>();
const asked = new Set<string>();
const listeners = new Set<() => void>();

const keyOf = (threadId: string, id: string): string => `${threadId}\u0000${id}`;

function emit(): void {
  for (const listener of listeners) listener();
}

export function requestReasoning(threadId: string, id: string): void {
  const key = keyOf(threadId, id);
  if (known.has(key) || asked.has(key)) return;
  asked.add(key);
  connection.send(encodeReasoning(threadId, id)).catch(() => {
    asked.delete(key);
  });
}

/** The answer to `chat.reasoning`, or a live bubble's own reasoning once it seals. */
export function rememberReasoning(threadId: string, id: string, reasoning: string | null): void {
  const key = keyOf(threadId, id);
  asked.delete(key);
  if (known.get(key) === reasoning) return;
  known.set(key, reasoning);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the bubble menu copies: the text, once something brought it here. */
export function knownReasoning(threadId: string, id: string): string | undefined {
  return known.get(keyOf(threadId, id)) ?? undefined;
}

/** The text, `null` when the server no longer has it, `undefined` while nobody knows yet. */
export function useKnownReasoning(threadId: string | undefined, id: string | undefined): string | null | undefined {
  return useSyncExternalStore(subscribe, () => (threadId && id ? known.get(keyOf(threadId, id)) : undefined));
}

/**
 * A socket that dropped will never answer what left on it: the guard against asking twice would
 * otherwise leave the line on "loading" for good. What was read stays.
 */
export function dropReasoningAsks(): void {
  asked.clear();
}

/** Test seam: module state is shared by every test file. */
export function resetReasoningFetch(): void {
  const held = known.size > 0;
  known.clear();
  asked.clear();
  if (held) emit();
}
