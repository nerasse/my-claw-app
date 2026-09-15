import { fileDrop, lineAt, orderDrop, sameDrop, targetOf, type LineBox } from '../dragMove';

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
