/**
 * The one place a media URL is built, and where the identity comes from.
 *
 * The web build has no native module: reading the identity anywhere but through the bridge
 * throws in a browser, and the rejection was swallowed, so every attachment URL came out empty
 * and every image rendered as its filename.
 */

// Every other suite gets the identity stubbed globally; this one is about the module itself.
jest.unmock('../device');

import { getDeviceInfo } from '../device';
import { deviceBridge } from '../nativeBridge';
import { mediaUrl } from '../mediaUrl';

const BASE = 'http://host:8080';

describe('mediaUrl', () => {
  it('leaves the query off when the cookie is the credential', () => {
    expect(mediaUrl(BASE, { deviceId: '', token: '' }, 'abc')).toBe(`${BASE}/media/abc`);
  });

  it('carries the credential a native client presents', () => {
    expect(mediaUrl(BASE, { deviceId: 'phone', token: 't/k' }, 'abc')).toBe(
      `${BASE}/media/abc?device=phone&token=t%2Fk`,
    );
  });

  it('opens the query for an extra parameter, and extends an existing one', () => {
    expect(mediaUrl(BASE, { deviceId: '', token: '' }, 'vid', { thumb: '1' })).toBe(
      `${BASE}/media/vid?thumb=1`,
    );
    expect(mediaUrl(BASE, { deviceId: 'phone', token: 'tok' }, 'vid', { thumb: '1' })).toBe(
      `${BASE}/media/vid?device=phone&token=tok&thumb=1`,
    );
  });

  it('has no URL to give before the identity resolves', () => {
    expect(mediaUrl(BASE, null, 'abc')).toBe('');
  });
});

describe('the identity', () => {
  // Asserted on the door it goes through, not on the value it returns: reading NativeModules
  // directly returns the same thing under Jest (both are mocked) and throws in a browser, which
  // is exactly how a null identity shipped unnoticed. Only the bridge has a web twin.
  it('is read through the bridge, the one door with a web twin', async () => {
    const bridged = deviceBridge.getDeviceInfo as unknown as jest.Mock;
    bridged.mockClear();
    await getDeviceInfo();
    expect(bridged).toHaveBeenCalledTimes(1);
  });
});
