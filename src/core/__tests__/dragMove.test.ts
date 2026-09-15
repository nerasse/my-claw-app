import { chipAt, fileDrop, lineAt, orderDrop, sameDrop, stackLines, targetOf, type LineBox, type ListLine } from '../dragMove';

function box(key: string, y: number, height: number, over: Partial<LineBox> = {}): LineBox {
  return { key, folderId: null, role: 'row', y, height, ...over };
}

describe('lineAt', () => {
  const lines = [
    box('h:f1', 0, 30, { folderId: 'f1' }),
    box('r:a', 30, 60, { folderId: 'f1', threadId: 'a' }),
    box('h:unfiled', 90, 30),
    box('r:b', 120, 60, { threadId: 'b' }),
  ];

  test('a finger is over the line whose band holds it', () => {
    expect(lineAt(lines, 0)?.key).toBe('h:f1');
    expect(lineAt(lines, 45)?.key).toBe('r:a');
    expect(lineAt(lines, 100)?.key).toBe('h:unfiled');
    expect(lineAt(lines, 179)?.key).toBe('r:b');
  });

  test('the line below owns the boundary, never both', () => {
    // Heights are integer and a finger is not: a boundary belongs to one line, and it is the one
    // the finger has entered. Reading it twice would move a row twice.
    expect(lineAt(lines, 30)?.key).toBe('r:a');
    expect(lineAt(lines, 90)?.key).toBe('h:unfiled');
  });

  test('below the last line there is nothing', () => {
    expect(lineAt(lines, 180)).toBeUndefined();
    expect(lineAt(lines, 4000)).toBeUndefined();
  });
});

describe('fileDrop', () => {
  test('a conversation dropped on another section is filed there', () => {
    expect(fileDrop({ threadId: 't', folderId: 'f1' }, { folderId: 'f2' })).toEqual({ kind: 'file', threadId: 't', folderId: 'f2' });
  });

  test('a conversation dropped on the unfiled section is unfiled', () => {
    expect(fileDrop({ threadId: 't', folderId: 'f1' }, { folderId: null })).toEqual({ kind: 'file', threadId: 't', folderId: null });
  });

  test('a conversation dropped on a section that is already its own files nothing', () => {
    expect(fileDrop({ threadId: 't', folderId: 'f1' }, { folderId: 'f1' })).toBeNull();
    expect(fileDrop({ threadId: 't' }, { folderId: null })).toBeNull();
  });

  test('a conversation let go outside every section files nothing', () => {
    expect(fileDrop({ threadId: 't', folderId: 'f1' }, undefined)).toBeNull();
  });

  test('an unfiled conversation dropped on a folder is filed in it', () => {
    expect(fileDrop({ threadId: 't' }, { folderId: 'f1' })).toEqual({ kind: 'file', threadId: 't', folderId: 'f1' });
  });
});

describe('orderDrop', () => {
  const order = ['a', 'b', 'c'];

  test('a folder takes the place of the one it was dropped on', () => {
    expect(orderDrop('a', order, { folderId: 'c' })).toEqual({
      kind: 'reorder',
      order: ['b', 'a', 'c'],
      targetId: 'c',
    });
    expect(orderDrop('c', order, { folderId: 'a' })).toEqual({
      kind: 'reorder',
      order: ['c', 'a', 'b'],
      targetId: 'a',
    });
  });

  test('the rest closes up around the folder that moved', () => {
    expect(orderDrop('b', ['a', 'b', 'c', 'd'], { folderId: 'd' })?.order).toEqual(['a', 'c', 'b', 'd']);
  });

  test('dropping a folder onto its own neighbour changes nothing', () => {
    // It would land exactly where it already is: sending the order it already has would broadcast
    // a listing to every device of the owner for nothing.
    expect(orderDrop('a', order, { folderId: 'b' })).toBeNull();
    expect(orderDrop('b', order, { folderId: 'c' })).toBeNull();
  });

  test('a folder dropped on itself changes nothing', () => {
    expect(orderDrop('b', order, { folderId: 'b' })).toBeNull();
  });

  test('the section nobody filed into is not a place in the order', () => {
    expect(orderDrop('a', order, { folderId: null })).toBeNull();
    expect(orderDrop('a', order, undefined)).toBeNull();
  });

  test('a folder the list does not carry is never placed', () => {
    expect(orderDrop('gone', order, { folderId: 'a' })).toBeNull();
    expect(orderDrop('a', order, { folderId: 'gone' })).toBeNull();
  });

  test('a move says which section to light up', () => {
    expect(targetOf({ kind: 'reorder', order, targetId: 'b' })).toBe('b');
    expect(targetOf({ kind: 'file', threadId: 't', folderId: null })).toBeNull();
  });
});

describe('sameDrop', () => {
  const order = ['a', 'b', 'c'];

  test('two moves onto the same section are the same move', () => {
    // Every line of a section is that section: a finger crossing from the heading to the rows
    // under it has not made a second decision, and the list must not re-render for it.
    const one = fileDrop({ threadId: 't' }, { folderId: 'f1' });
    const other = fileDrop({ threadId: 't' }, { folderId: 'f1' });
    expect(sameDrop(one, other)).toBe(true);
  });

  test('a move and no move are different, whichever side they are on', () => {
    expect(sameDrop(null, fileDrop({ threadId: 't' }, { folderId: 'f1' }))).toBe(false);
    expect(sameDrop(null, null)).toBe(true);
  });

  test('filing and reordering are never the same move', () => {
    expect(
      sameDrop({ kind: 'file', threadId: 't', folderId: 'b' }, { kind: 'reorder', order, targetId: 'b' }),
    ).toBe(false);
  });

  test('two sections are two moves', () => {
    expect(sameDrop(fileDrop({ threadId: 't' }, { folderId: 'f1' }), fileDrop({ threadId: 't' }, { folderId: 'f2' }))).toBe(false);
  });
});

describe('chipAt', () => {
  test('the chip is centred on the finger, and clear above it', () => {
    expect(chipAt({ x: 100, y: 200 }, { width: 60, height: 22 }, 18)).toEqual({ x: 70, y: 160 });
  });

  test('a chip nobody has measured yet lands on the point, lifted', () => {
    // The size arrives with the first layout, one frame after the pickup: the first position is
    // the same rule with nothing to give back, not a second one.
    expect(chipAt({ x: 100, y: 200 }, { width: 0, height: 0 }, 18)).toEqual({ x: 100, y: 182 });
  });
});

describe('stackLines', () => {
  const line = (key: string): ListLine => ({ key, folderId: null, role: 'row' });
  const lines = [line('a'), line('b'), line('c')];

  test('a line sits under the ones drawn before it', () => {
    const boxes = stackLines(lines, new Map([['a', 30], ['b', 60], ['c', 20]]), 1);
    expect(boxes.map(placed => placed.y)).toEqual([0, 31, 92]);
    expect(boxes.map(placed => placed.height)).toEqual([30, 60, 20]);
  });

  test('the rule the list draws between two entries takes its pixel', () => {
    // The separator is a line of the list, not a gap in the sum: what is drawn between two
    // entries is drawn inside the content, and a finger below it is one pixel lower for it.
    const boxes = stackLines([line('a'), line('b')], new Map([['a', 40], ['b', 40]]), 1);
    expect(lineAt(boxes, 39)?.key).toBe('a');
    expect(lineAt(boxes, 41)?.key).toBe('b');
    // And the rule itself belongs to neither: a finger on the pixel between two lines is over
    // nothing, which is what makes the gap under the last section a place a release does nothing.
    expect(lineAt(boxes, 40.5)).toBeUndefined();
  });

  test('a line that was never laid out ends the walk', () => {
    // Where the lines after it would sit depends on a height nobody knows yet: guessing it would
    // put a finger on a line it is not over.
    const boxes = stackLines(lines, new Map([['a', 30], ['c', 20]]), 1);
    expect(boxes.map(placed => placed.key)).toEqual(['a']);
  });

  test('nothing drawn, nothing to be over', () => {
    expect(stackLines([], new Map(), 1)).toEqual([]);
  });
});
