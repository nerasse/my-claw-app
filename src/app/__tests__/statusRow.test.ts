import { rowRoute } from '../StatusScreen';
import type { UsageModelRow } from '../../core/protocol';

function row(over: Partial<UsageModelRow> = {}): UsageModelRow {
  return {
    model: 'z-ai/glm-5.2@streamlake/fp8',
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

describe('where a model line says the calls went', () => {
  it('draws the provider name the server resolved, with the route beside it', () => {
    expect(rowRoute(row({ provider: 'streamlake', variant: 'fp8', providerName: 'StreamLake' }))).toBe('StreamLake · fp8');
  });

  it('falls back to the verbatim tag when the server sent no name', () => {
    // The tag is always right and sometimes unreadable; a name is only known while the server's
    // catalogue is warm, and an older server never sends one at all. Neither may blank the line.
    expect(rowRoute(row({ provider: 'streamlake', variant: 'fp8' }))).toBe('streamlake · fp8');
    expect(rowRoute(row({ provider: 'api.anthropic.com' }))).toBe('api.anthropic.com');
  });

  it('names the provider once, never the name and the tag together', () => {
    // They are one thing said twice: `StreamLake · streamlake · fp8` reads as two hops.
    const drawn = rowRoute(row({ provider: 'streamlake', variant: 'fp8', providerName: 'StreamLake' }));
    expect(drawn).not.toContain('streamlake ·');
    expect(drawn.split(' · ')).toHaveLength(2);
  });

  it('draws nothing at all for a row from a server that predates the route fields', () => {
    expect(rowRoute(row())).toBe('');
  });
});
