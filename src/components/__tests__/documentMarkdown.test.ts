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
