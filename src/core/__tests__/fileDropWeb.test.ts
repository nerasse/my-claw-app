import { pastedName, watchFileDrop } from '../fileDrop.web';
import { COMPOSER_INPUT_ID } from '../domIds';
import type { PickedFile } from '../nativeBridge';

/**
 * Pasting a screenshot into the chat. The listener sits on the window, so the two things worth
 * testing are what it accepts (a file, from the composer or from nowhere) and what it leaves
 * alone (a paste aimed at another field).
 */

type Listener = (event: unknown) => void;

function fakeDom(activeElement: unknown): { listeners: Map<string, Listener>; restore: () => void } {
  const listeners = new Map<string, Listener>();
  const globals = globalThis as { window?: unknown; document?: unknown; URL?: unknown };
  const previous = { window: globals.window, document: globals.document };
  globals.window = {
    addEventListener: (name: string, handler: Listener) => listeners.set(name, handler),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  globals.document = {
    activeElement,
    body: { setAttribute: () => {}, removeAttribute: () => {} },
  };
  (globalThis as { URL: { createObjectURL: (blob: unknown) => string } }).URL = {
    ...(globals.URL as object),
    createObjectURL: () => 'blob:fake',
  } as never;
  return {
    listeners,
    restore: () => {
      globals.window = previous.window;
      globals.document = previous.document;
    },
  };
}

function paste(file: { name?: string; type?: string; size?: number }): unknown {
  return {
    target: null,
    preventDefault: () => {},
    clipboardData: { files: [{ name: file.name ?? '', type: file.type ?? '', size: file.size ?? 0 }] },
  };
}

test('a file pasted with the composer focused is staged', () => {
  const dom = fakeDom({ id: COMPOSER_INPUT_ID, tagName: 'TEXTAREA', isContentEditable: false });
  const staged: PickedFile[][] = [];
  const stop = watchFileDrop(files => staged.push(files));

  dom.listeners.get('paste')?.(paste({ name: 'shot.png', type: 'image/png', size: 12 }));
  stop();
  dom.restore();

  expect(staged).toHaveLength(1);
  expect(staged[0]?.[0]).toMatchObject({ name: 'shot.png', type: 'image/png', size: 12 });
});

test('a file pasted into another field is left to that field', () => {
  const dom = fakeDom({ id: 'server-url', tagName: 'INPUT', isContentEditable: false });
  const staged: PickedFile[][] = [];
  const stop = watchFileDrop(files => staged.push(files));

  dom.listeners.get('paste')?.(paste({ name: 'shot.png', type: 'image/png', size: 12 }));
  stop();
  dom.restore();

  expect(staged).toHaveLength(0);
});

test('a paste with nothing focused belongs to the chat', () => {
  const dom = fakeDom(null);
  const staged: PickedFile[][] = [];
  const stop = watchFileDrop(files => staged.push(files));

  dom.listeners.get('paste')?.(paste({ type: 'image/png', size: 12 }));
  stop();
  dom.restore();

  expect(staged).toHaveLength(1);
  expect(staged[0]?.[0]?.name).toMatch(/^pasted-\d+\.png$/);
});

test('a nameless screenshot gets an extension from its mime type', () => {
  expect(pastedName('image/png', 7)).toBe('pasted-7.png');
  expect(pastedName('image/jpeg', 7)).toBe('pasted-7.jpg');
  expect(pastedName('image/x-weird', 7)).toBe('pasted-7.xweird');
  expect(pastedName('', 7)).toBe('pasted-7');
});
