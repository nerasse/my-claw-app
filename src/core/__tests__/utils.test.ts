/**
 * @format
 */

import { httpOrigin } from '../utils';

test('httpOrigin maps a ws url to the matching http origin, port included', () => {
  expect(httpOrigin('ws://10.10.20.10:8080/my-claw-app')).toBe('http://10.10.20.10:8080');
  expect(httpOrigin('wss://claw.example.com/my-claw-app')).toBe('https://claw.example.com');
  expect(httpOrigin('WS://Host:9/x')).toBe('http://Host:9');
  expect(httpOrigin('http://10.0.0.2:8080/my-claw-app')).toBe('http://10.0.0.2:8080');
});

test('httpOrigin never returns a bare scheme (that url resolves to the host "media")', () => {
  // Node's URL parses ws:// fine, RN's polyfill returns an empty host: the origin must never
  // collapse to 'http://', or `${origin}/media` becomes 'http:///media' -> host "media".
  for (const url of ['ws://10.10.20.10:8080/my-claw-app', 'wss://claw.example.com/my-claw-app']) {
    const origin = httpOrigin(url);
    expect(origin).not.toMatch(/^https?:\/\/$/);
    expect(`${origin}/media`).toMatch(/^https?:\/\/[^/]+\/media$/);
  }
});

test('httpOrigin falls back when the url is unusable', () => {
  expect(httpOrigin('', 'http://fallback:1')).toBe('http://fallback:1');
  expect(httpOrigin('not a url', 'http://fallback:1')).toBe('http://fallback:1');
});
