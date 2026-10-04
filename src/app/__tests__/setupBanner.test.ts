/**
 * The banner on the settings index: on top while a setup step is left, gone once every step is
 * done or skipped, and never drawn on a guess while the server has not said where a step stands.
 */
import { setupBanner } from '../SetupScreen';
import type { SetupStep } from '../../core/setup';

const step = (key: string, state: SetupStep['state']): SetupStep => ({ key, title: key, hint: '', state });

test('a step left: the banner counts what is settled', () => {
  expect(setupBanner([step('model', 'done'), step('voice', 'skipped'), step('search', 'todo')])).toEqual({ settled: 2, total: 3 });
});

test('every step done or skipped: no banner, the setup lives under Advanced', () => {
  expect(setupBanner([step('model', 'done'), step('voice', 'skipped')])).toBeNull();
});

test('a step not known yet: no banner rather than one that may vanish a beat later', () => {
  expect(setupBanner([step('model', 'done'), step('voice', 'unknown'), step('search', 'todo')])).toBeNull();
});
