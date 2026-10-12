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
  // The device token never goes in a URL (proxies log URLs): a view loading by itself carries
  // the server's media ticket, and has no URL to give until the ticket arrives.
  it('carries the media ticket, never the device token', () => {
    const url = mediaUrl(BASE, { deviceId: 'phone', token: 'secret', ticket: 't/k' }, 'abc');
    expect(url).toBe(`${BASE}/media/abc?ticket=t%2Fk`);
    expect(url).not.toContain('secret');
  });

  it('extends the query with an extra parameter', () => {
    expect(mediaUrl(BASE, { deviceId: 'phone', token: 'tok', ticket: 'tk' }, 'vid', { thumb: '1' })).toBe(
      `${BASE}/media/vid?ticket=tk&thumb=1`,
    );
  });

  it('has no URL to give before the identity or the ticket resolves', () => {
    expect(mediaUrl(BASE, null, 'abc')).toBe('');
    expect(mediaUrl(BASE, { deviceId: 'phone', token: 'tok' }, 'abc')).toBe('');
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
