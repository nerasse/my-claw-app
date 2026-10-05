import type { ProviderInfo } from './protocol';

/**
 * The services a provider can be added from with a name and a key, nothing else.
 *
 * One row per service, and everything the short form needs is on it: the address, the engine, the
 * variable the first account's key goes in, the page that hands out keys, and the models.dev table
 * that prices it. `pricingProvider` is set because the big vendors publish no API address on
 * models.dev: a second account keyed `openai-work` would otherwise match nothing and go unpriced.
 * The Claude API has none, its engine names the vendor on the server.
 *
 * Addresses checked against each vendor's own documentation on 2026-10-05: each one answers
 * `/models` with 401 (400 for Gemini) to a wrong key.
 */
export interface ProviderService {
  id: string;
  /** How the + page names it. */
  label: string;
  hint: string;
  /** The name a first account gets. */
  name: string;
  /** The key and the variable that first account gets: a later one is derived from its name. */
  key: string;
  env: string;
  type: 'openai' | 'anthropic';
  /** Empty: the engine's own default (api.anthropic.com). */
  baseUrl: string;
  pricingProvider: string;
  keyUrl: string;
}

export const PROVIDER_SERVICES: readonly ProviderService[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'one key, hundreds of models',
    name: 'OpenRouter',
    key: 'openrouter',
    env: 'OPENROUTER_API_KEY',
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    pricingProvider: 'openrouter',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    hint: 'a monthly plan for open models',
    name: 'OpenCode Go',
    key: 'opencode-go',
    env: 'OPENCODE_GO_API_KEY',
    type: 'openai',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    pricingProvider: 'opencode-go',
    keyUrl: 'https://opencode.ai/auth',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    hint: 'curated models, pay per use',
    name: 'OpenCode Zen',
    key: 'opencode-zen',
    env: 'OPENCODE_ZEN_API_KEY',
    type: 'openai',
    baseUrl: 'https://opencode.ai/zen/v1',
    pricingProvider: 'opencode',
    keyUrl: 'https://opencode.ai/auth',
  },
  {
    id: 'claude-api',
    label: 'Claude API',
    hint: 'Anthropic, pay per use',
    name: 'Claude API',
    key: 'claude-api',
    env: 'ANTHROPIC_API_KEY',
    type: 'anthropic',
    baseUrl: '',
    pricingProvider: '',
    keyUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'GPT models, pay per use',
    name: 'OpenAI',
    key: 'openai',
    env: 'OPENAI_API_KEY',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    pricingProvider: 'openai',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'fast open models',
    name: 'Groq',
    key: 'groq',
    env: 'GROQ_API_KEY',
    type: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    pricingProvider: 'groq',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    hint: 'Mistral models, pay per use',
    name: 'Mistral',
    key: 'mistral',
    env: 'MISTRAL_API_KEY',
    type: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    pricingProvider: 'mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: 'DeepSeek models, pay per use',
    name: 'DeepSeek',
    key: 'deepseek',
    env: 'DEEPSEEK_API_KEY',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    pricingProvider: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'Gemini models, free tier and pay per use',
    name: 'Gemini',
    key: 'gemini',
    env: 'GEMINI_API_KEY',
    type: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    pricingProvider: 'google',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    hint: 'Grok models, pay per use',
    name: 'xAI',
    key: 'xai',
    env: 'XAI_API_KEY',
    type: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    pricingProvider: 'xai',
    keyUrl: 'https://console.x.ai',
  },
];

const trimSlash = (url: string): string => url.replace(/\/+$/, '').toLowerCase();

/** Which service a configured provider was added from, read off its address and engine. */
export function serviceOf(provider: Pick<ProviderInfo, 'type' | 'baseUrl' | 'keyEnv'>): ProviderService | undefined {
  return PROVIDER_SERVICES.find(service =>
    service.baseUrl
      ? provider.type === service.type && trimSlash(provider.baseUrl ?? '') === trimSlash(service.baseUrl)
      // No address of its own: an Anthropic provider that takes a key, never the plan.
      : provider.type === service.type && !provider.baseUrl && provider.keyEnv !== undefined,
  );
}

/** The site a key is handed out on, for the link under the field. */
export function keySite(service: ProviderService): string {
  return service.keyUrl.replace(/^https:\/\//, '').split('/')[0] ?? service.keyUrl;
}

/**
 * The key a name becomes: accents and spaces folded, a taken one numbered. The server folds an
 * account's name the same way (`accountKeyFor`), so a plan and a key read alike in config.json.
 */
export function providerKeyFor(name: string, fallback: string, taken: readonly string[]): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const base = slug || fallback;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** The variable a key goes in: `<KEY>_API_KEY`, the first account of a service keeping its usual one. */
export function envNameFor(key: string, service?: ProviderService): string {
  if (service && key === service.key) return service.env;
  return `${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`;
}

/**
 * What a new account of a service is called: its usual name, numbered when a provider already
 * reads that way or holds its key, so two accounts never share a name in the picker.
 */
export function freshName(service: ProviderService, providers: ReadonlyArray<Pick<ProviderInfo, 'key' | 'group'>>): string {
  const taken = (name: string): boolean => nameTaken(name, providers) || providers.some(p => p.key === providerKeyFor(name, service.key, []));
  if (!taken(service.name)) return service.name;
  for (let n = 2; ; n++) if (!taken(`${service.name} ${n}`)) return `${service.name} ${n}`;
}

/**
 * What a provider's models look like right now, in one line: what the page that just added it
 * shows instead of a check before saving (owner, 2026-10-05). A refused key and a wrong address
 * are said in words, because "HTTP 401" alone tells a newcomer nothing.
 */
export function discoveryLine(provider: Pick<ProviderInfo, 'discover' | 'models' | 'discovery'>): { text: string; failed: boolean } {
  const count = `${provider.models} model${provider.models === 1 ? '' : 's'}`;
  if (!provider.discover) return { text: `${count} · declared by hand, discovery is off`, failed: false };
  const discovery = provider.discovery;
  if (discovery?.state === 'pending') return { text: 'asking the provider for its models…', failed: false };
  if (discovery?.state === 'failed') {
    const error = discovery.error ?? 'no answer';
    const status = /^HTTP (\d{3})/.exec(error)?.[1];
    const why =
      status === '401' || status === '403' || status === '400'
        ? 'the key was refused: paste it again'
        : status === '404'
          ? 'nothing answers at this address: check it in Advanced'
          : 'the provider did not answer';
    return { text: `${why} (${error})`, failed: true };
  }
  return { text: `${count} found`, failed: false };
}

/**
 * Whether a name is already how another provider reads (its name, else its key), case aside: two
 * providers that read alike cannot be told apart in the picker or in Stats. The server refuses the
 * same (`upsertProvider`); this says so before anything is sent.
 */
export function nameTaken(
  name: string,
  providers: ReadonlyArray<Pick<ProviderInfo, 'key' | 'group'>>,
  except?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;
  return providers.some(p => p.key !== except && (p.group?.trim() || p.key).toLowerCase() === wanted);
}

export const NAME_TAKEN = 'a provider already has this name · pick another';
