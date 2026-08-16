/**
 * The context ceilings a picker offers, mirroring the server's own list (docs/context-window.md
 * on the server, `contextChoiceFor`): the model's full window first, then the standing cap and
 * the graduations under it, descending. Nothing above the full window is ever offered.
 */

/** Graduations offered under the full window. A shorter prompt is cheaper and faster. */
const LOWER_TIERS = [512_000, 256_000, 128_000, 64_000];

export interface ContextTier {
  /** Absent marks the full window: the model's own number rather than a ceiling. */
  ceiling?: number;
  label: string;
  selected: boolean;
}

/** A token count as a picker spells it, shared so a window and a route read the same way. */
export function shortTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 10_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/**
 * `window` is the model's full window, `cap` the standing agent/global ceiling when there is one,
 * and `choice` what this subject already picked (a ceiling, 'full', or nothing = follows policy).
 * Returns an empty list when there is nothing to arbitrate: one option is not a choice.
 */
export function contextTiers(
  window: number | undefined,
  cap: number | undefined,
  choice: number | 'full' | undefined,
): ContextTier[] {
  if (window === undefined || !Number.isFinite(window) || window <= 0) return [];
  const ceilings = [...new Set([...(cap !== undefined && cap > 0 ? [cap] : []), ...LOWER_TIERS])]
    .filter(ceiling => ceiling < window)
    .sort((a, b) => b - a);
  // No session choice means policy decides: the cap is what is in force, else the full window.
  const inForce = choice ?? (cap !== undefined && cap > 0 && cap < window ? cap : 'full');
  const tiers: ContextTier[] = [
    { label: `Full: ${shortTokens(window)}`, selected: inForce === 'full' },
  ];
  for (const ceiling of ceilings) {
    tiers.push({
      ceiling,
      // The standing cap is named as such: picking it back is how a subject returns to policy.
      label: `${shortTokens(ceiling)}${ceiling === cap ? ' (cap)' : ''}`,
      selected: inForce === ceiling,
    });
  }
  return tiers.length > 1 ? tiers : [];
}

/**
 * How full the window of a conversation is, as a whole percent, or null when there is nothing
 * honest to show (no session yet, or a server that predates the field). Never clamped down to
 * 100: a prompt over its ceiling is exactly the moment worth seeing, and rounding it away would
 * hide the one reading that calls for a compaction.
 */
export function contextPercent(
  state: { effective?: number; used?: number } | null | undefined,
): number | null {
  const used = state?.used;
  const effective = state?.effective;
  if (used === undefined || effective === undefined) return null;
  if (!Number.isFinite(used) || !Number.isFinite(effective) || effective <= 0 || used < 0) return null;
  return Math.round((used / effective) * 100);
}

/** One line for a picker header: what the run may use, and the full window when they differ. */
export function contextSummary(window: number | undefined, effective: number | undefined): string {
  if (window === undefined) return '';
  if (effective === undefined || effective === window) return `context: ${shortTokens(window)}`;
  return `context: ${shortTokens(effective)} / full ${shortTokens(window)}`;
}
