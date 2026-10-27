import type { MarkedStyles } from 'react-native-marked';
import { documentMarkdownStyles } from '../DocumentMarkdown';
import { darkPalette, lightPalette } from '../../theme/palettes';

const ALL_KEYS: Array<keyof MarkedStyles> = [
  'em',
  'strong',
  'strikethrough',
  'text',
  'paragraph',
  'link',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'codespan',
  'code',
  'hr',
  'list',
  'li',
  'image',
  'table',
  'tableRow',
  'tableCell',
];

describe('documentMarkdownStyles', () => {
  test.each([['light', lightPalette], ['dark', darkPalette]] as const)(
    'covers every MarkedStyles key in %s mode',
    (_name, palette) => {
      const styles = documentMarkdownStyles(palette);
      for (const key of ALL_KEYS) {
        expect(styles[key]).toBeDefined();
      }
    },
  );

  test('headings follow a real hierarchy, not the chat scale', () => {
    const styles = documentMarkdownStyles(lightPalette);
    expect(styles.h1?.fontSize).toBeGreaterThan(styles.h2?.fontSize ?? 0);
    expect(styles.h2?.fontSize).toBeGreaterThan(styles.h3?.fontSize ?? 0);
    expect(styles.h3?.fontSize).toBeGreaterThan(styles.h4?.fontSize ?? 0);
    expect(styles.h1?.fontWeight).toBe('700');
    expect(styles.h1?.borderBottomWidth).toBe(1);
  });

  test('code never inherits the italic demo defaults', () => {
    const styles = documentMarkdownStyles(lightPalette);
    expect(styles.codespan?.fontStyle).toBe('normal');
    expect(styles.codespan?.fontWeight).toBe('400');
  });

  test('emphasis wears the palette ink, never the library default gray', () => {
    for (const palette of [lightPalette, darkPalette]) {
      const styles = documentMarkdownStyles(palette);
      for (const key of ['strong', 'em', 'strikethrough'] as const) {
        expect(styles[key]?.color).toBe(palette.text);
      }
      expect(styles.link?.color).toBe(palette.accent);
    }
    const styles = documentMarkdownStyles(lightPalette);
    expect(styles.strong?.fontSize).toBe(15);
    expect(styles.strong?.lineHeight).toBe(23);
  });

  test('the document body sits one step above the chat body', () => {
    const styles = documentMarkdownStyles(lightPalette);
    expect(styles.text?.fontSize).toBeGreaterThan(14);
    expect(styles.text?.lineHeight).toBeGreaterThanOrEqual(22);
  });
});

/**
 * The reader's zoom, and the bug it was written next to.
 *
 * `documentMarkdownStyles` took the palette alone, so a page was one fixed size whatever the
 * reader asked for. Every step now moves the body and the headings together: a heading that kept
 * its size while the prose around it grew would read as a smaller heading at 200%.
 */
describe('the reader zoom', () => {
  test('a step moves every size of the sheet, headings included', () => {
    const base = documentMarkdownStyles(lightPalette, 1);
    const big = documentMarkdownStyles(lightPalette, 2);
    for (const key of ['text', 'strong', 'li', 'h1', 'h2', 'h3', 'h4'] as const) {
      expect({ key, size: big[key]?.fontSize }).toEqual({ key, size: (base[key]?.fontSize ?? 0) * 2 });
    }
  });

  test('the line box follows the size, so the lines never overlap', () => {
    for (const scale of [0.85, 1.15, 1.5, 2]) {
      const styles = documentMarkdownStyles(lightPalette, scale);
      expect(styles.text?.lineHeight).toBeGreaterThan(styles.text?.fontSize ?? 0);
    }
  });

  test('inline runs still share the line of the prose they sit in, at any zoom', () => {
    for (const scale of [0.85, 1, 1.5, 2]) {
      const styles = documentMarkdownStyles(darkPalette, scale);
      for (const key of ['strong', 'em', 'strikethrough', 'link', 'codespan'] as const) {
        expect({ key, size: styles[key]?.fontSize }).toEqual({ key, size: styles.text?.fontSize });
        expect({ key, line: styles[key]?.lineHeight }).toEqual({ key, line: styles.text?.lineHeight });
      }
    }
  });

  test('the base sheet is unchanged: no zoom means the design sizes', () => {
    expect(documentMarkdownStyles(lightPalette).text?.fontSize).toBe(15);
    expect(documentMarkdownStyles(lightPalette, 1).text?.fontSize).toBe(15);
  });
});
