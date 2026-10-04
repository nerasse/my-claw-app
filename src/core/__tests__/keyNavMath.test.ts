import { letterJump, nextIndex } from '../keyNavMath';

describe('the column a key walks', () => {
  it('enters at the top going down, at the bottom going up', () => {
    expect(nextIndex('ArrowDown', { count: 5, index: -1, wrap: false })).toBe(0);
    expect(nextIndex('ArrowUp', { count: 5, index: -1, wrap: false })).toBe(4);
  });

  it('a menu goes round its ends, a page stays on the last row', () => {
    expect(nextIndex('ArrowDown', { count: 5, index: 4, wrap: true })).toBe(0);
    expect(nextIndex('ArrowUp', { count: 5, index: 0, wrap: true })).toBe(4);
    expect(nextIndex('ArrowDown', { count: 5, index: 4, wrap: false })).toBe(4);
    expect(nextIndex('ArrowUp', { count: 5, index: 0, wrap: false })).toBe(0);
    expect(nextIndex('ArrowDown', { count: 5, index: 2, wrap: false })).toBe(3);
  });

  it('Home and End, and Tab kept inside a menu both ways', () => {
    expect(nextIndex('Home', { count: 5, index: 3, wrap: false })).toBe(0);
    expect(nextIndex('End', { count: 5, index: 1, wrap: false })).toBe(4);
    expect(nextIndex('Tab', { count: 3, index: 2, wrap: true })).toBe(0);
    expect(nextIndex('Tab', { count: 3, index: 0, wrap: true, shift: true })).toBe(2);
    expect(nextIndex('Tab', { count: 3, index: -1, wrap: true, shift: true })).toBe(2);
  });

  it('a letter jumps to the next row it starts, going round, and nowhere when none does', () => {
    const rows = ['Archived', 'Agents', 'Jobs', 'Browser', 'Settings'];
    expect(letterJump(rows, -1, 'a')).toBe(0);
    expect(letterJump(rows, 0, 'A')).toBe(1);
    expect(letterJump(rows, 1, 'a')).toBe(0);
    expect(letterJump(rows, 4, 'b')).toBe(3);
    expect(letterJump(rows, 2, 'z')).toBe(-1);
  });
});
