/**
 * The browser router: an address that survives a reload, and a Back button that closes a layer
 * before it leaves the app.
 *
 * The module reads `window` at import time, so each case installs its own fake window and loads
 * a fresh copy of it.
 */

interface Entry {
  path: string;
}

interface Fake {
  window: unknown;
  entries: Entry[];
  pop: () => void;
}

function fakeWindow(startPath: string): Fake {
  const entries: Entry[] = [{ path: startPath }];
  const listeners: Array<() => void> = [];
  const win = {
    location: { pathname: startPath },
    history: {
      pushState: (_state: unknown, _title: string, path: string) => {
        entries.push({ path });
        win.location.pathname = path;
      },
      replaceState: (_state: unknown, _title: string, path: string) => {
        entries[entries.length - 1] = { path };
        win.location.pathname = path;
      },
    },
    addEventListener: (name: string, handler: () => void) => {
      if (name === 'popstate') listeners.push(handler);
    },
    removeEventListener: () => {},
  };
  return {
    window: win,
    entries,
    pop: () => {
      entries.pop();
      win.location.pathname = entries[entries.length - 1]?.path ?? '/';
      for (const listener of listeners) listener();
    },
  };
}

function load(fake: Fake): typeof import('../route.web') {
  (globalThis as { window?: unknown }).window = fake.window;
  let loaded!: typeof import('../route.web');
  // require inside isolateModules, not a dynamic import: the module reads `window` while it is
  // being evaluated, so it has to be re-evaluated against each fake.
  jest.isolateModules(() => {
    loaded = require('../route.web') as typeof import('../route.web');
  });
  return loaded;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test('a deep link names the conversation to open', () => {
  const fake = fakeWindow('/t/thread-42');
  const route = load(fake);
  expect(route.initialRoute()).toEqual({ threadId: 'thread-42' });
});

test('a sub-agent id survives the round trip through the address bar', () => {
  const fake = fakeWindow('/');
  const route = load(fake);
  route.showThread('subagent/researcher-a7b3');
  expect(fake.entries.at(-1)?.path).toBe('/t/subagent%2Fresearcher-a7b3');
  expect(route.initialRoute()).toEqual({ threadId: 'subagent/researcher-a7b3' });
});

test('a sub-agent chat is addressed as the chain it was opened through', () => {
  const fake = fakeWindow('/');
  const route = load(fake);
  route.showThread('thread-1', false, ['sub-aaaa', 'sub-bbbb']);
  expect(fake.entries.at(-1)?.path).toBe('/t/thread-1/a/sub-aaaa/a/sub-bbbb');
  // Both the conversation and every level come back: the reload has to reopen the same depth, and
  // an id that is not the last one still carries its own encoding.
  expect(route.initialRoute()).toEqual({ threadId: 'thread-1', agents: ['sub-aaaa', 'sub-bbbb'] });
});

test('a tail this client does not know still opens the conversation it names', () => {
  const fake = fakeWindow('/t/thread-1/x/mystery');
  const route = load(fake);
  expect(route.initialRoute()).toEqual({ threadId: 'thread-1' });
});

test('a level id holding a slash keeps its boundary', () => {
  const fake = fakeWindow('/');
  const route = load(fake);
  route.showThread('thread-1', false, ['subagent/a']);
  expect(fake.entries.at(-1)?.path).toBe('/t/thread-1/a/subagent%2Fa');
  expect(route.initialRoute()).toEqual({ threadId: 'thread-1', agents: ['subagent/a'] });
});

test('the first sync replaces, so boot leaves no Back step that unloads the app', () => {
  const fake = fakeWindow('/');
  const route = load(fake);
  route.showThread('thread-1', true);
  expect(fake.entries).toHaveLength(1);
  route.showThread('thread-2');
  expect(fake.entries).toHaveLength(2);
});

test('Back closes the open layer and keeps the conversation it was over', () => {
  const fake = fakeWindow('/');
  const route = load(fake);
  route.showThread('thread-1', true);

  let layerOpen = true;
  const shown: Array<string | null> = [];
  route.watchBack({
    closeTopLayer: () => {
      if (!layerOpen) return false;
      layerOpen = false;
      return true;
    },
    showRoute: r => shown.push(r.threadId),
  });

  route.showThread('thread-2');
  fake.pop();
  // The layer ate the press: the address is put back, and no navigation happened.
  expect(shown).toEqual([]);
  expect(fake.entries.at(-1)?.path).toBe('/t/thread-2');

  fake.pop();
  // Nothing left to close, so the address bar wins and the app follows it.
  expect(shown).toEqual(['thread-1']);
});
