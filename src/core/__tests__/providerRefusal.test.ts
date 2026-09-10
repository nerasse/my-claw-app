/**
 * The provider settings surface, end to end on the two pieces the refusal travelled through.
 *
 * A refused removal used to reach the app as "providers.remove failed" with nothing else, and the
 * delete screen had already navigated away by then: the reader was on a list that renders no error
 * at all, so the button looked dead and the only way out was hand-editing config.json.
 */

import { providersEnvStore } from '../providers';
import { encodeProvidersRemove } from '../protocol';
import { refusalText } from '../refusal';

test('the cascade flag rides on the frame, and a plain removal stays plain', () => {
  expect(JSON.parse(encodeProvidersRemove('commandcode'))).toEqual({ type: 'providers.remove', key: 'commandcode' });
  expect(JSON.parse(encodeProvidersRemove('commandcode', true))).toEqual({
    type: 'providers.remove',
    key: 'commandcode',
    withModels: true,
  });
});

test('a refusal reads as its cause when the server sent one', () => {
  expect(refusalText({ message: 'providers.remove failed', detail: 'Cannot remove X: still referenced by curated model Y' }))
    .toBe('Cannot remove X: still referenced by curated model Y');
  expect(refusalText({ message: 'provider config unavailable' })).toBe('provider config unavailable');
});

test('a retry starts from a clean banner', () => {
  providersEnvStore.reset();
  providersEnvStore.fail('Cannot remove commandcode: still referenced by curated model commandcode/x');
  expect(providersEnvStore.getSnapshot().error).toContain('commandcode');
  providersEnvStore.clearError();
  expect(providersEnvStore.getSnapshot().error).toBeNull();
  // Nothing lost with it: the env names the same store carries survive a refusal.
  providersEnvStore.receive({ names: ['GROQ_API_KEY'], present: ['GROQ_API_KEY'], usedBy: { groq: 'GROQ_API_KEY' } });
  providersEnvStore.fail('rejected');
  providersEnvStore.clearError();
  expect(providersEnvStore.getSnapshot().env?.names).toEqual(['GROQ_API_KEY']);
  providersEnvStore.reset();
});
