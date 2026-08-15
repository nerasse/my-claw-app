import { markedStyles } from '../AgentMarkdown';
import { documentMarkdownStyles } from '../DocumentMarkdown';
import { darkPalette, lightPalette } from '../../theme/palettes';

/**
 * Guards the rule behind a bug that made the compaction summary and the reasoning unreadable:
 * lines drawn on top of each other, grey plates sitting off their own glyphs.
 *
 * An inline run shares the line its prose builds, and on Android that line takes the metrics of
 * whichever span states them. A code span at its own size, with padding and `overflow: hidden`
 * to clip a rounded box, therefore shrank the line under everything around it. So: inline runs
 * wear the prose metrics and nothing else may touch the box.
 */
type Style = Record<string, string | number | undefined>;
type Sheet = Record<string, Style | undefined>;

const INLINE = ['strong', 'em', 'strikethrough', 'link', 'codespan'] as const;
const SHEETS: [string, Sheet][] = [
  ['chat body', markedStyles(lightPalette, 'texte', 'body') as unknown as Sheet],
  ['chat aside', markedStyles(darkPalette, 'texte', 'aside') as unknown as Sheet],
  ['document', documentMarkdownStyles(darkPalette) as unknown as Sheet],
];

test.each(SHEETS)('inline runs keep the line box of the prose they sit in (%s)', (_name, sheet) => {
  const prose = sheet.text!;
  for (const key of INLINE) {
    expect({ key, fontSize: sheet[key]?.fontSize }).toEqual({ key, fontSize: prose.fontSize });
    expect({ key, lineHeight: sheet[key]?.lineHeight }).toEqual({ key, lineHeight: prose.lineHeight });
  }
});

test.each(SHEETS)('nothing inline pads or clips its own box (%s)', (_name, sheet) => {
  for (const key of INLINE) {
    const style = sheet[key] ?? {};
    for (const forbidden of ['padding', 'paddingHorizontal', 'paddingVertical', 'overflow', 'borderRadius']) {
      expect({ key, forbidden, value: style[forbidden] }).toEqual({ key, forbidden, value: undefined });
    }
  }
});

test('a code span is still marked out: monospace on its own plate, upright', () => {
  for (const [, sheet] of SHEETS) {
    expect(sheet.codespan?.fontFamily).toBe('monospace');
    expect(sheet.codespan?.backgroundColor).toBeDefined();
    // The library's base draws code in italic: a path or a flag in italic monospace is unreadable
    // and looks like a rendering fault, so the face is restated in full.
    expect(sheet.codespan?.fontStyle).toBe('normal');
    expect(sheet.codespan?.fontWeight).toBe('400');
  }
});
