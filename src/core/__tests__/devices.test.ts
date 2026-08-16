import { devicesStore, normalizeCode } from '../devices';

/**
 * The store is the whole client side of pairing: what it holds is what the owner decides on.
 * The frames come from the server, so the tests speak frames rather than internals.
 */
describe('devicesStore', () => {
  beforeEach(() => devicesStore.reset());

  test('a human types the code the way a human reads it', () => {
    expect(normalizeCode(' gw6e-73pk ')).toBe('GW6E73PK');
    expect(normalizeCode('ILOU1234')).toBe('110V1234');
  });

  test('a lookup answer becomes the candidate the owner compares', () => {
    devicesStore.onPairInfo({
      type: 'device.pair.info',
      code: 'GW6E73PK',
      verification: '721',
      origin: 'https://claw.kssimi.fr',
      ip: '10.0.0.9',
      userAgent: 'Firefox',
      expiresAt: 1,
    });
    expect(devicesStore.get().candidate).toMatchObject({ code: 'GW6E73PK', verification: '721' });
    expect(devicesStore.get().busy).toBe(false);
  });

  test('a refused pairing explains itself and drops the candidate', () => {
    devicesStore.onPairInfo({
      type: 'device.pair.info',
      code: 'GW6E73PK',
      verification: '721',
      expiresAt: 1,
    });
    devicesStore.onPairResult({ type: 'device.pair.result', ok: false, error: 'expired' });
    expect(devicesStore.get().candidate).toBeNull();
    expect(devicesStore.get().error).toBe('the code expired, ask for a new one');
  });

  test('the list is server state: a failed revoke leaves the device on screen', () => {
    devicesStore.onList({
      type: 'device.list.result',
      devices: [
        { deviceId: 'app-1', name: 'Pixel', kind: 'app', owner: 'neras', enabled: true, self: true },
        { deviceId: 'web-1', name: 'Firefox', kind: 'web', owner: 'neras', enabled: true },
      ],
    });
    devicesStore.onRevoked({
      type: 'device.revoke.result',
      ok: false,
      deviceId: 'web-1',
      error: 'a device cannot revoke itself',
    });
    expect(devicesStore.get().devices).toHaveLength(2);
    expect(devicesStore.get().error).toBe('a device cannot revoke itself');
  });
});

describe('codeFromScan', () => {
  // The scanner reads whatever is in front of it, and the approval path is the one place where
  // a wrong value costs an account: anything that is not a pairing code is dropped, not sent.
  const { codeFromScan } = require('../../components/PairScanner.web');

  test('a claim URL yields the code in its fragment', () => {
    expect(codeFromScan('https://claw.kssimi.fr/pair#K7QW3M2P')).toBe('K7QW3M2P');
    expect(codeFromScan('http://10.10.20.10:8080/pair#k7qw-3m2p')).toBe('K7QW3M2P');
  });

  test('a bare code is accepted, anything else is refused', () => {
    expect(codeFromScan(' K7QW3M2P ')).toBe('K7QW3M2P');
    expect(codeFromScan('https://example.com/')).toBeNull();
    expect(codeFromScan('K7QW3M2')).toBeNull();
    expect(codeFromScan('')).toBeNull();
  });
});
