import type { UsageAgent, UsageModelRow, UsageTotals } from './protocol';

/** Calls, tokens and money over one set of rows, with the per-model lines they came from. */
export interface UsageGroup {
  totals: UsageTotals;
  rows: UsageModelRow[];
}

function zeroTotals(): UsageTotals {
  return {
    calls: 0,
    errors: 0,
    promptTokens: 0,
    cacheReadTokens: 0,
    completionTokens: 0,
    billedUsd: 0,
    referenceUsd: 0,
    unpriced: 0,
  };
}

/**
 * Every sub-agent of a conversation as one figure, with the models they ran on merged by id.
 *
 * This is the sum the server already does one level up for the card's total, minus the
 * conversation's own calls. Rows merge rather than stack because the same model driven by six
 * workers is one line read once, not six lines read once each.
 *
 * A row is keyed by its model and the provider that served it, never by the model alone: the
 * server groups its own rows that way because the same id reached through two providers is billed
 * at two rates, and merging them here would collapse on the client what it deliberately kept
 * apart.
 *
 * The key is the verbatim tag and never the display name beside it. The server reads that name
 * from a cache it refuses to wait on, so one route arrives named and the next arrival of the same
 * route may not: keyed on the name, a cold read and a warm read of one provider would be drawn as
 * two lines.
 *
 * Returns null when there is nothing to sum, so the page leaves the section out instead of
 * drawing a row of zeroes.
 */
export function subAgentsUsage(agents: UsageAgent[]): UsageGroup | null {
  if (agents.length === 0) return null;
  const totals = zeroTotals();
  const byModel = new Map<string, UsageModelRow>();
  for (const agent of agents) {
    totals.calls += agent.calls;
    totals.errors += agent.errors;
    totals.promptTokens += agent.promptTokens;
    totals.cacheReadTokens += agent.cacheReadTokens;
    totals.completionTokens += agent.completionTokens;
    totals.billedUsd += agent.billedUsd;
    totals.referenceUsd += agent.referenceUsd;
    totals.unpriced += agent.unpriced;
    for (const row of agent.rows) {
      const key = `${row.model}\u0000${row.provider ?? ""}\u0000${row.variant ?? ""}`;
      const seen = byModel.get(key);
      if (!seen) {
        byModel.set(key, { ...row });
        continue;
      }
      // Same route, and only one of the two reads was warm enough to name it: keep the name rather
      // than leaving the merged line on the slug because of the order the agents came in.
      if (seen.providerName === undefined && row.providerName !== undefined) seen.providerName = row.providerName;
      seen.calls += row.calls;
      seen.errors += row.errors;
      seen.promptTokens += row.promptTokens;
      seen.cacheReadTokens += row.cacheReadTokens;
      seen.completionTokens += row.completionTokens;
      // A model id is priced the same everywhere, so a row that carries a price and one that does
      // not are two rows the join above could not have merged in the first place. Keep whichever
      // price exists rather than dropping the money on the floor.
      if (row.costUsd === undefined) continue;
      if (seen.costUsd === undefined) {
        seen.costUsd = row.costUsd;
        seen.costBilled = row.costBilled;
        seen.costApproximate = row.costApproximate;
      } else {
        seen.costUsd += row.costUsd;
      }
    }
  }
  return { totals, rows: [...byModel.values()] };
}