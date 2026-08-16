import { installGlobalErrorHooks } from '../errorHooks.web';
import type { CrashReport } from '../errorHooks.web';

/**
 * The browser's crash hook. Android reports every crash to the server through `ErrorUtils`;
 * react-native-web never runs the RN core that installs it, so the web client used to lose its
 * errors to the devtools console and tell nobody.
 */

type Listener = (event: unknown) => void;

function fakeWindow(): { listeners: Map<string, Listener>; restore: () => void } {
  const listeners = new Map<string, Listener>();
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    addEventListener: (name: string, handler: Listener) => listeners.set(name, handler),
  };
  return {
    listeners,
    restore: () => {
      (globalThis as { window?: unknown }).window = previous;
    },
  };
}

test('an uncaught error is reported with its stack', () => {
  const fake = fakeWindow();
  const reports: CrashReport[] = [];
  installGlobalErrorHooks(report => reports.push(report));

  const error = new Error('boom');
  error.stack = 'Error: boom\n  at somewhere';
  fake.listeners.get('error')?.({ error, message: 'boom' });
  fake.restore();

  expect(reports).toHaveLength(1);
  expect(reports[0]?.message).toBe('fatal: boom');
  expect(reports[0]?.stack).toContain('at somewhere');
});

test('an error event with no Error object still says where it happened', () => {
  const fake = fakeWindow();
  const reports: CrashReport[] = [];
  installGlobalErrorHooks(report => reports.push(report));

  // Cross-origin scripts report exactly this: a message, and nothing else.
  fake.listeners.get('error')?.({ message: 'Script error.', filename: '/index.js', lineno: 12, colno: 3 });
  fake.restore();

  expect(reports[0]?.message).toBe('fatal: Script error.');
  expect(reports[0]?.stack).toBe('/index.js:12:3');
});

test('a rejected promise nobody awaited is reported too', () => {
  const fake = fakeWindow();
  const reports: CrashReport[] = [];
  installGlobalErrorHooks(report => reports.push(report));

  fake.listeners.get('unhandledrejection')?.({ reason: new Error('upload failed') });
  fake.listeners.get('unhandledrejection')?.({ reason: 'plain string' });
  fake.restore();

  expect(reports[0]?.message).toBe('unhandled rejection: upload failed');
  // A non-Error rejection is the common shape of a thrown fetch response: it must not crash the
  // reporter that exists to report crashes.
  expect(reports[1]?.message).toBe('unhandled rejection: plain string');
});
