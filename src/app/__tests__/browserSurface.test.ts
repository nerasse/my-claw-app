/**
 * The geometry and the keys between the owner's hand and the page: a tap has to land where the
 * finger was, zoomed or not, and a key has to reach the page as the character it typed.
 */
import { clampView, contentPoint, keyInput, textEdit, wheelDelta } from '../browser/surfaceMath';

const box = { width: 400, height: 225 };
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  keyInput({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('contentPoint', () => {
  it('maps a point of the picture to a fraction of the page', () => {
    expect(contentPoint({ x: 200, y: 112.5 }, { scale: 1, tx: 0, ty: 0 }, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(contentPoint({ x: 0, y: 0 }, { scale: 1, tx: 0, ty: 0 }, box)).toEqual({ x: 0, y: 0 });
  });

  it('undoes the zoom: a finger on a zoomed picture lands on what it covers', () => {
    // Zoomed 2x on the bottom right quarter: the box's centre shows the page at 3/4, 3/4.
    const view = { scale: 2, tx: -400, ty: -225 };
    expect(contentPoint({ x: 200, y: 112.5 }, view, box)).toEqual({ x: 0.75, y: 0.75 });
  });

  it('is nothing off the picture, or before it has a size', () => {
    expect(contentPoint({ x: 401, y: 10 }, { scale: 1, tx: 0, ty: 0 }, box)).toBeUndefined();
    expect(contentPoint({ x: 10, y: 10 }, { scale: 1, tx: 0, ty: 0 }, { width: 0, height: 0 })).toBeUndefined();
  });
});

describe('wheelDelta', () => {
  it('scrolls the page with the finger, by the page pixels the finger crossed', () => {
    // A 1600 px page drawn 400 px wide: one finger pixel is four page pixels; up scrolls down.
    expect(wheelDelta(0, -50, 1, box, { width: 1600, height: 900 })).toEqual({ dx: -0, dy: 200 });
    // Zoomed 2x, the same move crosses half as much of the page.
    expect(wheelDelta(20, 0, 2, box, { width: 1600, height: 900 })).toEqual({ dx: -40, dy: -0 });
  });
});

describe('clampView', () => {
  it('keeps a zoomed picture over the whole box, and never zooms out past it', () => {
    expect(clampView({ scale: 2, tx: 50, ty: -1000 }, box)).toEqual({ scale: 2, tx: 0, ty: -225 });
    expect(clampView({ scale: 0.5, tx: -10, ty: 0 }, box)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('keyInput', () => {
  it('a character is text, whatever the layout: accents, AltGr and the space included', () => {
    expect(key('é')).toEqual({ kind: 'text', text: 'é' });
    expect(key('A', { shiftKey: true })).toEqual({ kind: 'text', text: 'A' });
    expect(key(' ')).toEqual({ kind: 'text', text: ' ' });
    // AltGr+0 on a French layout, as Windows reports it.
    expect(key('@', { ctrlKey: true, altKey: true })).toEqual({ kind: 'text', text: '@' });
  });

  it('a named key and a shortcut go as keys, with their modifiers', () => {
    expect(key('Enter')).toEqual({ kind: 'key', key: 'Enter' });
    expect(key('Tab', { shiftKey: true })).toEqual({ kind: 'key', key: 'Tab', modifiers: ['Shift'] });
    expect(key('a', { ctrlKey: true })).toEqual({ kind: 'key', key: 'a', modifiers: ['Control'] });
    expect(key('T', { ctrlKey: true, shiftKey: true })).toEqual({ kind: 'key', key: 'T', modifiers: ['Control', 'Shift'] });
    expect(key(' ', { ctrlKey: true })).toEqual({ kind: 'key', key: 'Space', modifiers: ['Control'] });
  });

  it('a modifier alone, or a dead key, sends nothing', () => {
    expect(key('Shift', { shiftKey: true })).toBeUndefined();
    expect(key('Control', { ctrlKey: true })).toBeUndefined();
    expect(key('Dead')).toBeUndefined();
  });
});

describe('textEdit', () => {
  it('replays only what changed: an append, an erase, an autocorrect', () => {
    expect(textEdit('', 'abc')).toEqual({ erase: 0, insert: 'abc' });
    expect(textEdit('abc', 'ab')).toEqual({ erase: 1, insert: '' });
    expect(textEdit('teh', 'the ')).toEqual({ erase: 2, insert: 'he ' });
    expect(textEdit('same', 'same')).toEqual({ erase: 0, insert: '' });
  });
});
