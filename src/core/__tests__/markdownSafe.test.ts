import { isDangerousHtml } from '../markdownSafe';

describe('isDangerousHtml', () => {
  test.each([
    '<script>alert(1)</script>',
    '<SCRIPT>alert(1)</SCRIPT>',
    '</script>',
    '<script src="https://evil/x.js">',
    '<iframe src="https://evil"></iframe>',
    '<object data="x"></object>',
    '<embed src="x">',
    '<applet code="x"></applet>',
    '<meta http-equiv="refresh">',
    '<link rel="stylesheet" href="x">',
    '<style>body{display:none}</style>',
    '<form action="x"></form>',
    '<input name="x">',
    '<button>click</button>',
    '<select><option>x</option></select>',
    '<textarea>x</textarea>',
    '<template>x</template>',
    '<base href="x">',
    '<noscript>x</noscript>',
    '<frame src="x">',
    '<frameset></frameset>',
  ])('flags %s', raw => {
    expect(isDangerousHtml(raw)).toBe(true);
  });

  test.each([
    '<b>gras</b>',
    '<i>italique</i>',
    '<br>',
    '<details><summary>t</summary></details>',
    '<sub>2</sub>',
    '<sup>2</sup>',
    '<mark>m</mark>',
    '<abbr title="x">RN</abbr>',
    '<a href="https://x">link</a>',
    '<div class="note">note</div>',
    'du texte normal',
    'a < b',
    'x > script',
    '<scriptish>pas une balise</scriptish>',
  ])('keeps %s', raw => {
    expect(isDangerousHtml(raw)).toBe(false);
  });
});

describe('lexer keeps samples while flagging scripts', () => {
  const marked = jest.requireActual('marked') as typeof import('marked');

  test('a script block becomes a single html token', () => {
    const tokens = marked.lexer('<script>\n  alert(1)\n</script>', { gfm: true });
    expect(tokens[0]!.type).toBe('html');
  });

  test('a script inside a fenced code block is a code token, not an html token', () => {
    const tokens = marked.lexer('```html\n<script>const x = 1</script>\n```', { gfm: true });
    expect(tokens[0]!.type).toBe('code');
  });
});
