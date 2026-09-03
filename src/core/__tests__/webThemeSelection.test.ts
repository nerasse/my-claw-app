import { onAccentProps as nativeOnAccent } from '../webProps';
import { onAccentProps as webOnAccent } from '../webProps.web';
import { webThemeCss } from '../webTheme.web';
import { darkPalette, lightPalette, type Palette } from '../../theme/palettes';

/**
 * The selection highlight on an accent-filled surface.
 *
 * A user bubble is `accent` with `accentText` on it, and the global `::selection` rule paints
 * exactly that pair: selecting one's own message changed nothing on screen, in both themes. The
 * scoped rule flips it, and this is what keeps the two from drifting back together -- the failure
 * is invisible to any test that only looks at the React tree.
 */

/** The declarations of one selector, from the sheet. */
function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no rule for: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close).trim();
}

describe.each([
  ['dark', darkPalette],
  ['light', lightPalette],
])('%s theme', (_name: string, palette: Palette) => {
  const css = webThemeCss(palette);

  test('the page paints a selection in the accent', () => {
    expect(ruleFor(css, '\n::selection')).toBe(`background: ${palette.accent}; color: ${palette.accentText};`);
  });

  test('an accent-filled surface flips it, or the highlight is the bubble', () => {
    const rule = ruleFor(css, '[data-claw-on-accent="1"] ::selection');
    expect(rule).toBe(`background: ${palette.accentText}; color: ${palette.accent};`);
    // Both the marked element's own text and its descendants: react-native-web renders the text
    // of a bubble in a child node, but a marked Text would otherwise be missed.
    expect(css).toContain('[data-claw-on-accent="1"]::selection');
  });

  test('the flipped pair is the page pair, so it cannot be invisible on the bubble', () => {
    // No colour arithmetic: the point is that the two rules are inverses of each other, which is
    // what guarantees contrast on a surface painted with either one.
    const page = ruleFor(css, '\n::selection');
    const bubble = ruleFor(css, '[data-claw-on-accent="1"] ::selection');
    expect(bubble).not.toBe(page);
    expect(palette.accent).not.toBe(palette.accentText);
  });
});

test('the marker is web-only', () => {
  expect(webOnAccent()).toEqual({ dataSet: { clawOnAccent: '1' } });
  // Android selects nothing in the chat list (docs/text-selection.md), so there is nothing to mark.
  expect(nativeOnAccent()).toEqual({});
});
