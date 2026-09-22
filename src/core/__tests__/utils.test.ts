/**
 * @format
 */

import { formatSpan, httpOrigin } from '../utils';

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
 * The one span format every counter in the thread shares -- reasoning, compaction, runs, commands,
 * tool cards, sub-agent cards. It began as the thinking span (2026-09-11: the owner read a phase
 * as `0s`) and absorbed three other formatters when the same operation read differently depending
 * on where the thread drew it (2026-09-22).
 */
describe('formatSpan', () => {
  test('milliseconds under a second, one decimal from one to ten, nothing decorative', () => {
    // 4 ms must not read "0.1 s" (twentyfold the truth), and 2 000 ms must not read "2.0 s" (a
    // trailing zero that says nothing). Past ten seconds the fraction is the noise the owner
    // asked to lose (2026-09-22).
    expect(formatSpan(4)).toBe('4 ms');
    expect(formatSpan(60)).toBe('60 ms');
    expect(formatSpan(230)).toBe('230 ms');
    expect(formatSpan(2_000)).toBe('2 s');
    expect(formatSpan(2_320)).toBe('2.3 s');
    expect(formatSpan(9_400)).toBe('9.4 s');
  });

  test('whole seconds, then minutes with the seconds they leave', () => {
    expect(formatSpan(12_000)).toBe('12 s');
    expect(formatSpan(47_000)).toBe('47 s');
    // 59.6 s rounds into the next unit rather than printing "60 s".
    expect(formatSpan(59_600)).toBe('1 min');
    expect(formatSpan(60_000)).toBe('1 min');
    expect(formatSpan(110_290)).toBe('1 min 50 s');
    expect(formatSpan(150_000)).toBe('2 min 30 s');
  });

  test('past the hour the seconds go too: 2 h 33 min, not 2 h 33 min 12 s', () => {
    expect(formatSpan(3_600_000)).toBe('1 h');
    expect(formatSpan(5_580_000)).toBe('1 h 33 min');
    expect(formatSpan(9_009_000)).toBe('2 h 30 min');
  });

  test('a negative span never renders as a negative time', () => {
    // A clock that moved backwards between two frames must not print "-500 ms".
    expect(formatSpan(-500)).toBe('0 ms');
    expect(formatSpan(0)).toBe('0 ms');
  });
});
