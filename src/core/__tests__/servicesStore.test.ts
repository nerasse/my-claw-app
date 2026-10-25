import { encodeServicesSet, parseServerFrame, type ServerFrame } from '../protocol';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { servicesStore } from '../services';

// Off the wire: parseServerFrame is a whitelist, and a frame it does not hold never reaches the
// router. A test that fed the store directly would not see that drop.
describe('the services frames, off the wire', () => {
  const handlers = { activeThreadId: () => null, subagentParent: () => null } as unknown as ServerFrameHandlers;
  const wire = (sent: object) => routeServerFrame(parseServerFrame(JSON.stringify(sent)) as ServerFrame, handlers);
  afterEach(() => servicesStore.reset());

  it('the description reaches the page, and a refusal is said there, not in a conversation', () => {
    wire({ type: 'services.result', install: 'compose', services: [{ id: 'stt', source: 'cloud', choices: ['cloud'], missing: [], health: 'no-endpoint' }] });
    expect(servicesStore.get().frame?.install).toBe('compose');
    servicesStore.sending();
    wire({ type: 'error', scope: 'services', message: 'an http(s) URL is needed' });
    expect(servicesStore.get()).toMatchObject({ error: 'an http(s) URL is needed', busy: false });
  });
});

describe('the embedding models a provider serves', () => {
  const handlers = { activeThreadId: () => null, subagentParent: () => null } as unknown as ServerFrameHandlers;
  const wire = (sent: object) => routeServerFrame(parseServerFrame(JSON.stringify(sent)) as ServerFrame, handlers);
  afterEach(() => servicesStore.reset());

  it('ride the services frame, so the card offers a model without a second round trip', () => {
    wire({
      type: 'services.result',
      install: 'native',
      services: [{ id: 'embeddings', source: 'cloud', choices: ['off', 'cloud'], missing: [], health: 'up' }],
      embeddingModels: [
        { provider: 'gemini', id: 'gemini-embedding-001', label: 'Gemini Embedding 001' },
        { provider: 'openrouter', id: 'nvidia/nemotron-3.5-embed-1b:free', label: 'Nemotron 3.5 Embed 1B (free)' },
      ],
    });
    expect(servicesStore.get().frame?.embeddingModels?.map(m => `${m.provider}/${m.id}`)).toEqual([
      'gemini/gemini-embedding-001',
      'openrouter/nvidia/nemotron-3.5-embed-1b:free',
    ]);
  });

  it('an older server sends none, and the card falls back to the sources it knew', () => {
    wire({ type: 'services.result', install: 'native', services: [{ id: 'embeddings', source: 'off', choices: ['off', 'cloud'], missing: [], health: 'no-endpoint' }] });
    expect(servicesStore.get().frame?.embeddingModels).toBeUndefined();
  });
});

describe('the choice a provider names', () => {
  it('carries the provider and the model, and no URL the server would have to invent', () => {
    expect(JSON.parse(encodeServicesSet({ id: 'embeddings', source: 'cloud', provider: 'gemini', model: 'gemini-embedding-001' }))).toEqual({
      type: 'services.set',
      id: 'embeddings',
      source: 'cloud',
      provider: 'gemini',
      model: 'gemini-embedding-001',
    });
  });
});
