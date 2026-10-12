import { DEFAULT_SERVER_URL, isValidServerUrl, authQuery } from '../serverUrl.ios';

describe('iOS server address boundary', () => {
  const globals = globalThis as typeof globalThis & { __DEV__: boolean };
  const development = __DEV__;
  afterEach(() => { globals.__DEV__ = development; });
  test('a fresh install has no personal server prefilled', () => {
    expect(DEFAULT_SERVER_URL).toBe('');
  });
  test('media URLs carry a read-only ticket and never the device token', () => {
    const identity = { deviceId: 'phone', token: 'fixture-secret', ticket: 'read-ticket' };
    expect(authQuery(identity)).toBe('ticket=read-ticket');
    const pending = { ...identity, ticket: undefined };
    expect(authQuery(pending)).toBeNull();
  });
  test('distributed builds require TLS and refuse credentials in the authority', () => {
    globals.__DEV__ = false;
    expect(isValidServerUrl('wss://example.test/my-claw-app')).toBe(true);
    expect(isValidServerUrl('https://example.test')).toBe(true);
    expect(isValidServerUrl('ws://127.0.0.1:8080/my-claw-app')).toBe(false);
    expect(isValidServerUrl('wss://user:password@example.test')).toBe(false);
  });
  test('development permits a local fixture while the native boundary still validates the address', () => {
    globals.__DEV__ = true;
    expect(isValidServerUrl('ws://127.0.0.1:8080/my-claw-app')).toBe(true);
    expect(isValidServerUrl('not an address')).toBe(false);
  });
});
