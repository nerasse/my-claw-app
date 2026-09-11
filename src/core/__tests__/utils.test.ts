/**
 * @format
 */

import { formatThinkingSpan, httpOrigin } from '../utils';

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

/**
 * The thinking span, added 2026-09-11: the owner read a phase as `0s`, which reads as a phase that
 * never happened rather than as a very short one.
 */
describe('formatThinkingSpan', () => {
  test('two decimals, so a tenth of a second is not rounded away', () => {
    expect(formatThinkingSpan(60)).toBe('0.06s');
    expect(formatThinkingSpan(940)).toBe('0.94s');
    expect(formatThinkingSpan(5_900)).toBe('5.90s');
    expect(formatThinkingSpan(12_000)).toBe('12.00s');
  });

  test('minutes carry the same precision on the seconds they leave', () => {
    expect(formatThinkingSpan(93_000)).toBe('1m 33.00s');
    expect(formatThinkingSpan(120_500)).toBe('2m 0.50s');
  });

  test('a negative span never renders as a negative time', () => {
    // A clock that moved backwards between two frames must not print "-1.00s".
    expect(formatThinkingSpan(-500)).toBe('0.00s');
  });
});
