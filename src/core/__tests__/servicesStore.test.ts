import { parseServerFrame, type ServerFrame } from '../protocol';
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
