/**
 * A CSV read into rows -- the separator is not assumed, and a quoted field is a field.
 */
import { detectSeparator, parseDelimited } from '../delimited';

describe('detectSeparator', () => {
  it('reads the first line, whatever the export uses', () => {
    expect(detectSeparator('a,b,c\n1,2,3')).toBe(',');
    expect(detectSeparator('a;b;c\n1;2;3')).toBe(';');
    expect(detectSeparator('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectSeparator('a|b|c\n1|2|3')).toBe('|');
  });

  it('is not fooled by separators inside quotes', () => {
    expect(detectSeparator('"a;b;c";d\n1;2')).toBe(';');
  });
});

describe('parseDelimited', () => {
  it('splits rows and fields, and keeps the header as the first row', () => {
    const table = parseDelimited('name,total\nAda,42\nGrace,7\n');
    expect(table.rows).toEqual([['name', 'total'], ['Ada', '42'], ['Grace', '7']]);
    expect(table.truncated).toBe(false);
  });

  it('keeps a separator, a quote and a newline that sit inside a quoted field', () => {
    const table = parseDelimited('a,b\n"x, y","he said ""hi""\nsecond line"\n');
    expect(table.rows[1]).toEqual(['x, y', 'he said "hi"\nsecond line']);
  });

  it('handles a last row with no trailing newline, and a Windows file', () => {
    expect(parseDelimited('a,b\r\n1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseDelimited('a;b\n1;2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('caps what it reads and says so', () => {
    const text = Array.from({ length: 20 }, (_, index) => `row${index},x`).join('\n');
    const table = parseDelimited(text, 5);
    expect(table.rows).toHaveLength(5);
    expect(table.truncated).toBe(true);
  });
});
