import { describe, expect, it } from '@jest/globals';
import {
  PROVIDER_SERVICES,
  discoveryLine,
  envNameFor,
  freshName,
  providerKeyFor,
  serviceOf,
} from '../providerServices';

const service = (id: string) => PROVIDER_SERVICES.find(s => s.id === id)!;

describe('the table', () => {
  it('holds the ten services, each with its address, its variable and its key page', () => {
    expect(PROVIDER_SERVICES.map(s => s.id)).toEqual([
      'openrouter', 'opencode-go', 'opencode-zen', 'claude-api', 'openai', 'groq', 'mistral', 'deepseek', 'gemini', 'xai',
    ]);
    for (const s of PROVIDER_SERVICES) {
      expect(s.keyUrl).toMatch(/^https:\/\//);
      expect(s.env).toMatch(/^[A-Z][A-Z0-9_]*_API_KEY$/);
      // The first account's key is what its usual name folds to, so the name and the key agree.
      expect(providerKeyFor(s.name, s.key, [])).toBe(s.key);
      if (s.type === 'openai') {
        expect(s.baseUrl).toMatch(/^https:\/\//);
        // An address with no models.dev entry of its own still gets a price.
        expect(s.pricingProvider).not.toBe('');
      }
    }
    // Two keys of one vendor never share a variable by default.
    expect(new Set(PROVIDER_SERVICES.map(s => s.env)).size).toBe(PROVIDER_SERVICES.length);
  });
});

describe('a name becomes a key and a variable', () => {
  it('folds accents and spaces, and numbers a taken key', () => {
    expect(providerKeyFor('OpenRouter boulot', 'openrouter', [])).toBe('openrouter-boulot');
    expect(providerKeyFor('Clé perso', 'openrouter', [])).toBe('cle-perso');
    expect(providerKeyFor('OpenRouter', 'openrouter', ['openrouter', 'openrouter-2'])).toBe('openrouter-3');
    // Nothing usable in the name: the service's own key.
    expect(providerKeyFor('!!', 'groq', [])).toBe('groq');
  });

  it("keeps the service's usual variable for its first account only", () => {
    expect(envNameFor('claude-api', service('claude-api'))).toBe('ANTHROPIC_API_KEY');
    expect(envNameFor('claude-api-2', service('claude-api'))).toBe('CLAUDE_API_2_API_KEY');
    expect(envNameFor('openrouter-boulot', service('openrouter'))).toBe('OPENROUTER_BOULOT_API_KEY');
    expect(envNameFor('local-vllm')).toBe('LOCAL_VLLM_API_KEY');
  });

  it('numbers the name of a second account, whether the name or the key is what is taken', () => {
    const openrouter = service('openrouter');
    expect(freshName(openrouter, [])).toBe('OpenRouter');
    expect(freshName(openrouter, [{ key: 'openrouter' }])).toBe('OpenRouter 2');
    expect(freshName(openrouter, [{ key: 'or', group: 'openrouter' }])).toBe('OpenRouter 2');
    expect(freshName(openrouter, [{ key: 'openrouter' }, { key: 'openrouter-2', group: 'OpenRouter 2' }])).toBe('OpenRouter 3');
  });
});

describe('a provider is recognised as the service it came from', () => {
  it('by its address and its engine, a trailing slash aside', () => {
    expect(serviceOf({ type: 'openai', baseUrl: 'https://openrouter.ai/api/v1/' })?.id).toBe('openrouter');
    expect(serviceOf({ type: 'openai', baseUrl: 'https://opencode.ai/zen/go/v1' })?.id).toBe('opencode-go');
    expect(serviceOf({ type: 'openai', baseUrl: 'https://opencode.ai/zen/v1' })?.id).toBe('opencode-zen');
    expect(serviceOf({ type: 'openai', baseUrl: 'https://litellm.example/v1' })).toBeUndefined();
  });

  it('the Claude API takes a key; the plan, with neither key nor address, is not it', () => {
    expect(serviceOf({ type: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY' })?.id).toBe('claude-api');
    expect(serviceOf({ type: 'anthropic' })).toBeUndefined();
  });
});

describe('what the models look like', () => {
  it('says the key was refused in words, and keeps the status beside them', () => {
    expect(discoveryLine({ discover: true, models: 0, discovery: { state: 'failed', error: 'HTTP 401' } })).toEqual({
      text: 'the key was refused: paste it again (HTTP 401)',
      failed: true,
    });
    expect(discoveryLine({ discover: true, models: 0, discovery: { state: 'failed', error: 'HTTP 404' } }).text).toBe(
      'nothing answers at this address: check it in Advanced (HTTP 404)',
    );
    expect(discoveryLine({ discover: true, models: 0, discovery: { state: 'failed', error: 'no answer in time' } }).text).toBe(
      'the provider did not answer (no answer in time)',
    );
  });

  it('asks while pending, counts once answered, and says so when discovery is off', () => {
    expect(discoveryLine({ discover: true, models: 0, discovery: { state: 'pending' } })).toEqual({ text: 'asking the provider for its models…', failed: false });
    expect(discoveryLine({ discover: true, models: 1, discovery: { state: 'ok' } }).text).toBe('1 model found');
    // An older server sends no discovery: the count stands alone.
    expect(discoveryLine({ discover: true, models: 12 }).text).toBe('12 models found');
    expect(discoveryLine({ discover: false, models: 3 }).text).toBe('3 models · declared by hand, discovery is off');
  });
});
