/**
 * How much of a prompt a provider served from its cache.
 *
 * The share is read over prompt tokens, the same denominator the stats page uses: cache reads are
 * a subset of the prompt, so adding them to it would count the same tokens twice.
 */
export function cacheSharePct(partTokens: number, promptTokens: number): number {
  return promptTokens > 0 ? (partTokens / promptTokens) * 100 : 0;
}

/** The share as it is drawn: one decimal, and `0.0%` rather than `NaN%` on an empty set. */
export function cacheShareLabel(partTokens: number, promptTokens: number): string {
  return `${cacheSharePct(partTokens, promptTokens).toFixed(1)}%`;
}
