/**
 * The composer's height in a browser. A textarea has one fixed height, so it is resized to its
 * content on every keystroke, and the arithmetic is what this pins: react-native-web renders
 * every element as `box-sizing: border-box`, while `scrollHeight` excludes the borders. Assigning
 * one to the other leaves the content short by the border for good, which is how the field came
 * to scroll on its own and show a first line sliced by its top edge.
 */

interface FakeStyle {
  borderTopWidth: string;
  borderBottomWidth: string;
}

class FakeTextArea {
  style: Record<string, string> = {};
  rows = 2;
  value = '';
  placeholder = '';
  computed: FakeStyle = { borderTopWidth: '1px', borderBottomWidth: '1px' };
  /** What the content measures, and what the placeholder alone does when the field is empty. */
  content = 0;
  placeholderHeight = 0;
  get scrollHeight(): number {
    return this.value === '' && this.placeholder !== '' ? Math.max(this.content, this.placeholderHeight) : this.content;
  }
}

const globals = globalThis as unknown as {
  HTMLTextAreaElement: unknown;
  getComputedStyle: unknown;
};

globals.HTMLTextAreaElement = FakeTextArea;
globals.getComputedStyle = (node: FakeTextArea) => node.computed;

const { autoGrow } = require('../webProps.web') as typeof import('../webProps.web');

function field(scrollHeight: number, border = '1px'): FakeTextArea {
  const node = new FakeTextArea();
  node.value = 'x';
  node.content = scrollHeight;
  node.computed = { borderTopWidth: border, borderBottomWidth: border };
  return node;
}

test('the borders are part of the height, or the content is clipped by exactly that much', () => {
  const node = field(40);

  autoGrow(node, 94);

  expect(node.style.height).toBe('42px');
  expect(node.style.overflowY).toBe('hidden');
});

test('the field is asked for one row, or its own default floors it at two', () => {
  const node = field(16);

  autoGrow(node, 94);

  expect(node.rows).toBe(1);
});

test('a borderless field is its content, to the pixel', () => {
  const node = field(40, '0px');

  autoGrow(node, 94);

  expect(node.style.height).toBe('40px');
});

test('past the ceiling the field stops growing and becomes scrollable', () => {
  const node = field(200);

  autoGrow(node, 94);

  expect(node.style.height).toBe('94px');
  // The pair that has to agree: a clamped height with the overflow left hidden is text that can
  // be neither seen nor scrolled to.
  expect(node.style.overflowY).toBe('auto');
});

test('a field exactly at the ceiling still scrolls nothing', () => {
  const node = field(92);

  autoGrow(node, 94);

  expect(node.style.height).toBe('94px');
  expect(node.style.overflowY).toBe('hidden');
});

test('a computed style without borders is read as none rather than as NaN', () => {
  const node = field(40, '');

  autoGrow(node, 94);

  expect(node.style.height).toBe('40px');
});

test('anything that is not a textarea is left alone', () => {
  const node = { style: {} as Record<string, string> };

  autoGrow(node, 94);

  expect(node.style).toEqual({});
});

// Chrome measures an empty textarea on its placeholder, wrapped at the width the field had then:
// "message" in a field caught narrow mid-layout was seven lines, and the composer kept that height
// until the next keystroke.
test('an empty field is one line whatever its placeholder wraps to', () => {
  const node = field(16);
  node.value = '';
  node.placeholder = 'Answer the pending questions';
  node.placeholderHeight = 112;

  autoGrow(node, 94);

  expect(node.style.height).toBe('18px');
  expect(node.style.overflowY).toBe('hidden');
  // Measured without it, not rid of it.
  expect(node.placeholder).toBe('Answer the pending questions');
});

test('text in the field is measured as text, the placeholder playing no part', () => {
  const node = field(40);
  node.placeholder = 'message';
  node.placeholderHeight = 112;

  autoGrow(node, 94);

  expect(node.style.height).toBe('42px');
});
