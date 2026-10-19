import { cacheShareLabel, cacheSharePct } from '../cache';

describe('the cache share the pages draw', () => {
  it('is the part of the prompt the provider served from cache', () => {
    expect(cacheSharePct(366, 1000)).toBeCloseTo(36.6, 6);
    expect(cacheShareLabel(366, 1000)).toBe('36.6%');
  });

  it('counts a cold call as zero, never as a missing figure', () => {
    expect(cacheSharePct(0, 1000)).toBe(0);
    expect(cacheShareLabel(0, 1000)).toBe('0.0%');
  });

  it('does not divide by an empty prompt', () => {
    expect(cacheSharePct(0, 0)).toBe(0);
    expect(cacheShareLabel(0, 0)).toBe('0.0%');
  });
});
