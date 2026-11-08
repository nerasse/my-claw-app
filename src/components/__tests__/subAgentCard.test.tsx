/**
 * A `spawn`/`send` card is a door, not a result. Everything here guards that: the way to the
 * sub-agent is reachable while the card is folded, and the head says who and in what state
 * without unfolding anything.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SubAgentCard } from '../SubAgentCard';
import type { ToolItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

function makeItem(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: 'tool-1',
    kind: 'tool',
    name: 'spawn',
    args: { name: 'digger', type: 'research', mode: 'session', task: 'read the reasoning flow' },
    ok: true,
    output: 'found it',
    truncated: false,
    ts: Date.now(),
    ...overrides,
  };
}

function render(item: ToolItem, props: Record<string, unknown> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <SubAgentCard item={item} {...props} />
      </ThemeContext.Provider>,
    );
  });
  lastTree = tree;
  return tree;
}

// A running card counts its own seconds, so it holds an interval. Unmounted after every test:
// left alive, the tick lands after the test and React reports an act() warning for it.
let lastTree: ReactTestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (!lastTree) return;
  const tree = lastTree;
  lastTree = undefined;
  ReactTestRenderer.act(() => tree.unmount());
});

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
    .filter(Boolean);
}

function door(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Open sub-agent ') &&
      typeof node.props.onPress === 'function',
    { deep: true },
  );
}

const DOOR = { subagent: { label: 'digger', status: 'idle' as const } };

it('offers the door without unfolding anything, and hands back the card id', () => {
  const onOpen = jest.fn();
  const tree = render(makeItem(), { ...DOOR, onOpen });
  const [button] = door(tree);
  expect(button).toBeDefined();
  ReactTestRenderer.act(() => button!.props.onPress());
  expect(onOpen).toHaveBeenCalledWith('tool-1');
  // Folded: the result is not on screen yet.
  expect(texts(tree)).not.toContain('found it');
});

it('names the sub-agent and what it was asked, on one line, folded', () => {
  const tree = render(makeItem(), DOOR);
  const shown = texts(tree);
  expect(shown).toContain('digger');
  // What it is doing beats its type: a brief used to cost a second full-width line under the row,
  // which made the one door of a run the tallest thing in the thread.
  expect(shown).toContain('read the reasoning flow');
});

/**
 * The clock on a running card is one line or none: squeezed into a sliver it wrapped at its own
 * space and read `20` over `s` (owner, 2026-11-08).
 */
it('never lets the seconds wrap, however long the brief is', () => {
  const long = 'New read-only design task, same rules (no edits, no cargo). Repo /home/neras/cf/CubeFlow at main b59fcc1. ' + 'Topic: '.repeat(20);
  const item = makeItem({ args: { name: 'digger', type: 'research', mode: 'session', task: long }, running: true, ts: Date.now() - 20_000 });
  const tree = render(item, DOOR);
  const figures = tree.root.findAllByType(Text).filter(t => typeof t.props.children === 'string' && /^\d+ s$/.test(t.props.children));
  expect(figures.length).toBeGreaterThan(0);
  expect(figures.every(t => t.props.numberOfLines === 1)).toBe(true);
});

it('falls back to the shape when the call carried no brief', () => {
  const item = makeItem({ args: { name: 'digger', type: 'research', mode: 'session' } });
  const shown = texts(render(item, DOOR));
  expect(shown).toContain('digger');
  expect(shown).toContain('research · session');
});

it('has no door when the sub-agent is gone, and still says what was asked', () => {
  const tree = render(makeItem(), { onOpen: jest.fn() });
  expect(door(tree)).toHaveLength(0);
  expect(texts(tree)).toContain('read the reasoning flow');
});

it('shows the task and the result once unfolded', () => {
  const tree = render(makeItem(), DOOR);
  ReactTestRenderer.act(() => {
    tree.root
      .find(node => node.props.accessibilityLabel === 'Sub-agent digger' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  const shown = texts(tree);
  expect(shown).toContain('task');
  expect(shown).toContain('found it');
});

it('calls a send what it is: a message, not a task', () => {
  const tree = render(makeItem({ name: 'send', args: { id: 'subagent/digger-a1b2', message: 'status?' } }), DOOR);
  ReactTestRenderer.act(() => {
    tree.root
      .find(node => node.props.accessibilityLabel === 'Sub-agent digger' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  expect(texts(tree)).toContain('message');
  expect(texts(tree)).not.toContain('task');
});

it('a delegated browser task is a sub-agent card: the browser is who, the site is what, the door opens it', () => {
  // The browser used to run as a private loop with no session, so its call was an ordinary tool
  // row: nothing to open, nothing live. It is a real sub-agent now and its card says so.
  const onOpen = jest.fn();
  const tree = render(
    makeItem({
      name: 'delegate_browser_task',
      args: { url: 'https://shop.example.com/cart', instructions: 'Check the cart total' },
    }),
    { subagent: { label: 'browser-3f2a', status: 'running' as const }, spawn: { subagentId: 'subagent/browser-3f2a', displayName: 'browser-3f2a', status: 'running' as const }, onOpen },
  );
  const shown = texts(tree);
  expect(shown).toContain('browser-3f2a');
  expect(shown).toContain('browser · shop.example.com');
  const [button] = door(tree);
  expect(button).toBeDefined();
  ReactTestRenderer.act(() => button!.props.onPress());
  expect(onOpen).toHaveBeenCalledWith('tool-1');
  // Unfolded, the instructions are the task.
  ReactTestRenderer.act(() => {
    tree.root
      .find(node => node.props.accessibilityLabel === 'Sub-agent browser-3f2a, running' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  expect(texts(tree)).toContain('task');
  expect(texts(tree)).toContain('Check the cart total');
});

// One vocabulary with the tool card (core/toolState). Running and done carry no word: the
// spinner and the duration already say it, and a card that spelled out "done" next to "1.2 s"
// would be saying it twice.
it.each([
  ['error' as const, 'failed'],
  ['aborted' as const, 'stopped'],
])('says in the head that the run is %s', (status, expected) => {
  const tree = render(makeItem({ running: false }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status },
  });
  expect(texts(tree)).toContain(expected);
});

it.each(['running' as const, 'complete' as const])('a %s run draws no state word', status => {
  const tree = render(makeItem({ running: status === 'running', durationMs: status === 'complete' ? 1200 : undefined }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status },
  });
  for (const word of ['failed', 'stopped', 'truncated', 'done', 'running']) {
    expect(texts(tree)).not.toContain(word);
  }
});

// 2026-10-04: a card the server went down under is drawn from its state alone, and such a card is
// never `ok`. Read before the state, `ok: false` painted it a red "error" -- a stopped one too.
it.each(['interrupted' as const, 'aborted' as const])(
  'a card drawn from its state alone says stopped (%s), not failed',
  status => {
    const tree = render(makeItem({ ok: false, output: '' }), {
      ...DOOR,
      spawn: { subagentId: 's1', displayName: 'digger', status },
    });
    expect(texts(tree)).toContain('stopped');
    expect(texts(tree)).not.toContain('failed');
  },
);

// A running card without a clock is the same picture at ten seconds and at ten minutes, and
// nothing else on the card carries time until the result lands.
it('counts the run while it runs', () => {
  const tree = render(makeItem({ running: true, ts: Date.now() - 95_000 }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status: 'running' as const },
  });
  const shown = texts(tree);
  expect(shown.some(text => /^1 min \d+ s$/.test(text))).toBe(true);
});

it('a settled card shows its frozen duration, not a second counter', () => {
  const tree = render(makeItem({ durationMs: 4200, ts: Date.now() - 95_000 }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status: 'complete' as const },
  });
  const shown = texts(tree);
  expect(shown).toContain('4.2 s');
  expect(shown.some(text => /^1 min \d+ s$/.test(text))).toBe(false);
});
