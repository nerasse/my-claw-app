import { subAgentsUsage } from '../usage';
import type { UsageAgent, UsageModelRow } from '../protocol';

function row(over: Partial<UsageModelRow> & { model: string }): UsageModelRow {
  return {
    calls: 1,
    errors: 0,
    promptTokens: 100,
    cacheReadTokens: 0,
    completionTokens: 10,
    costBilled: false,
    costApproximate: false,
    ...over,
  };
}

function agent(over: Partial<UsageAgent> & { sessionId: string }): UsageAgent {
  return {
    displayName: over.sessionId,
    depth: 1,
    alive: true,
    running: false,
    calls: 0,
    errors: 0,
    promptTokens: 0,
    cacheReadTokens: 0,
    completionTokens: 0,
    billedUsd: 0,
    referenceUsd: 0,
    unpriced: 0,
    rows: [],
    ...over,
  };
}

describe('the sub-agents as one figure', () => {
  it('has nothing to sum when the conversation drove none, so the section can be left out', () => {
    expect(subAgentsUsage([])).toBeNull();
  });

  it('adds calls, tokens and money over every agent, nested ones included', () => {
    const recap = subAgentsUsage([
      agent({
        sessionId: 'a',
        calls: 6,
        errors: 1,
        promptTokens: 1000,
        cacheReadTokens: 800,
        completionTokens: 50,
        referenceUsd: 0.4,
        unpriced: 1,
      }),
      agent({ sessionId: 'b', depth: 2, calls: 4, promptTokens: 500, completionTokens: 20, billedUsd: 0.2 }),
    ]);
    expect(recap?.totals).toEqual({
      calls: 10,
      errors: 1,
      promptTokens: 1500,
      cacheReadTokens: 800,
      completionTokens: 70,
      billedUsd: 0.2,
      referenceUsd: 0.4,
      unpriced: 1,
    });
  });

  it('merges the same model driven by two agents into one line', () => {
    const recap = subAgentsUsage([
      agent({
        sessionId: 'a',
        rows: [row({ model: 'deepseek/deepseek-v4-flash', calls: 3, promptTokens: 300, costUsd: 0.1 })],
      }),
      agent({
        sessionId: 'b',
        rows: [row({ model: 'deepseek/deepseek-v4-flash', calls: 2, promptTokens: 200, completionTokens: 30, costUsd: 0.05 })],
      }),
    ]);
    expect(recap?.rows).toHaveLength(1);
    const merged = recap?.rows[0];
    expect(merged).toMatchObject({
      model: 'deepseek/deepseek-v4-flash',
      calls: 5,
      errors: 0,
      promptTokens: 500,
      cacheReadTokens: 0,
      completionTokens: 40,
    });
    expect(merged?.costUsd).toBeCloseTo(0.15);
  });

  it('keeps the markers of a row that carries them, and the price of a row that has one', () => {
    const recap = subAgentsUsage([
      agent({ sessionId: 'a', rows: [row({ model: 'm', costUsd: 0.2, costBilled: true })] }),
      agent({ sessionId: 'b', rows: [row({ model: 'm', costUsd: 0.1, costApproximate: true })] }),
      // An unpriced model id: no row of it carries money, and merging must not invent one.
      agent({ sessionId: 'c', rows: [row({ model: 'free/local' }), row({ model: 'free/local' })] }),
    ]);
    const priced = recap?.rows.find(r => r.model === 'm');
    expect(priced).toMatchObject({ calls: 2, costBilled: true });
    expect(priced?.costUsd).toBeCloseTo(0.3);

    const unpriced = recap?.rows.find(r => r.model === 'free/local');
    expect(unpriced).toMatchObject({ calls: 2 });
    expect(unpriced?.costUsd).toBeUndefined();
  });
});
