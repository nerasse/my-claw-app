/**
 * A `spawn`/`send` card is a door, not a result -- and since the launch stopped blocking, not a
 * clock either. Everything here guards that: the way to the sub-agent is reachable while the card
 * is folded, the head says who and that it started, and nothing on it claims to know how the child
 * is doing, because this call is over.
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
  // The door is drawn in the link ink -- one blue in every theme -- so "this opens something" reads
  // the same on a spawn card, a send card and a scheduled job's delivery (owner, 2026-11-17).
  const icon = button!.findAll(node => typeof node.props.d === 'string' && typeof node.props.fill === 'string')[0];
  expect(icon?.props.fill).toBe(lightPalette.link);
  ReactTestRenderer.act(() => button!.props.onPress());
  expect(onOpen).toHaveBeenCalledWith('tool-1');
  // Folded: the result is not on screen yet.
  expect(texts(tree)).not.toContain('found it');
});

it('names the sub-agent and what it was asked, on one line, folded', () => {
  const tree = render(makeItem(), DOOR);
  const shown = texts(tree);
  expect(shown).toContain('digger');
  expect(shown).toContain('read the reasoning flow');
});

it('keeps the name on the head and gives the brief its own line', () => {
  const task = 'New read-only design task, same rules (no edits, no cargo). Repo /home/neras/cf/CubeFlow at main b59fcc1.';
  const tree = render(makeItem({ args: { name: 'digger', type: 'research', mode: 'session', task } }), DOOR);
  const shown = texts(tree);
  expect(shown).toContain('digger');
  expect(shown).toContain('research · session');
  expect(shown).toContain(task);
});

/**
 * Order, not just presence: who (name), then what it is (type), then the brief under it. A card
 * that opened on the task read as a command someone ran, which is the whole complaint.
 */
it('reads who, then what, then the job', () => {
  const task = 'read the reasoning flow';
  const tree = render(makeItem({ args: { name: 'digger', type: 'research', mode: 'session', task } }), DOOR);
  const shown = texts(tree);
  expect(shown.indexOf('digger')).toBeGreaterThanOrEqual(0);
  expect(shown.indexOf('research · session')).toBeGreaterThan(shown.indexOf('digger'));
  expect(shown.indexOf(task)).toBeGreaterThan(shown.indexOf('research · session'));
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
      .find(node => node.props.accessibilityLabel === 'Sub-agent digger, started' && typeof node.props.onPress === 'function')
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
      .find(node => node.props.accessibilityLabel === 'Sub-agent digger, sent' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  expect(texts(tree)).toContain('message');
  expect(texts(tree)).not.toContain('task');
});

it('a delegated browser task is a sub-agent card: the browser is who, the site is what, the door opens it', () => {
  const onOpen = jest.fn();
  const tree = render(
    makeItem({
      name: 'delegate_browser_task',
      args: { url: 'https://shop.example.com/cart', instructions: 'Check the cart total' },
    }),
    { subagent: { label: 'browser-3f2a', status: 'running' as const }, onOpen },
  );
  const shown = texts(tree);
  expect(shown).toContain('browser-3f2a');
  expect(shown).toContain('browser · shop.example.com');
  const [button] = door(tree);
  expect(button).toBeDefined();
  ReactTestRenderer.act(() => button!.props.onPress());
  expect(onOpen).toHaveBeenCalledWith('tool-1');
  ReactTestRenderer.act(() => {
    tree.root
      .find(node => node.props.accessibilityLabel === 'Sub-agent browser-3f2a, started' && typeof node.props.onPress === 'function')
      .props.onPress();
  });
  expect(texts(tree)).toContain('task');
  expect(texts(tree)).toContain('Check the cart total');
});

/**
 * The whole point of this card since the launch stopped blocking: it says one word, forever.
 *
 * It used to read the child's life -- a spinner while it worked, a clock climbing beside it, then
 * "failed" or "error" when it settled -- because the call stayed open for the whole run. Every one
 * of those was a lie about a call that had already returned, and a loading mark in a thread where
 * nothing was loading (owner, 2026-11-13).
 */
it.each([
  ['spawn' as const, 'started'],
  ['send' as const, 'sent'],
])('a %s says %s and nothing else', (name, word) => {
  const tree = render(makeItem({ name, args: { name: 'digger', message: 'go', task: 'go' } }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status: 'complete' as const },
  });
  expect(texts(tree)).toContain(word);
  for (const other of ['failed', 'stopped', 'error', 'running', 'done', 'returned']) {
    expect(texts(tree)).not.toContain(other);
  }
});

/** The child's fate belongs to its return card. Two cards saying it is the same fact twice. */
it('never repeats the child outcome the child reports itself', () => {
  const tree = render(makeItem(), { ...DOOR, spawn: { subagentId: 's1', displayName: 'digger', status: 'error' as const } });
  expect(texts(tree)).toContain('started');
  expect(texts(tree)).not.toContain('failed');
});

it('says refused when the launch itself was refused', () => {
  const tree = render(makeItem({ ok: false, output: 'no such agent' }), DOOR);
  expect(texts(tree)).toContain('refused');
});

/**
 * No clock anywhere on a running card: the call is over, and the child's own elapsed time is its
 * thread's business. The interval that used to feed `RunningFor` is gone with it.
 */
it('draws no clock, live or settled', () => {
  const live = texts(render(makeItem({ running: true, ts: Date.now() - 95_000 }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status: 'running' as const },
  }));
  expect(live.some(text => /^\d+ (s|min)/.test(text))).toBe(false);
  const settled = texts(render(makeItem({ durationMs: 4200 }), DOOR));
  expect(settled.some(text => text === '4.2 s')).toBe(false);
});

/**
 * Which model the agent is on: the card is where the owner watches it work, and a run that walked
 * its route on a wall answers on another account than the one it started on. `modelLive` is what
 * says the name is the current one rather than the pin.
 */
test('shows the model the agent calls, and marks it when it walked off its pin', () => {
  const tree = render(makeItem(), {
    subagent: { label: 'digger', status: 'running', model: 'claude-2/claude-fable-5-2', modelLive: true },
  });
  const shown = texts(tree);
  expect(shown).toContain('claude-2/claude-fable-5-2');
  const model_ = tree.root.findAllByType(Text).find(node => node.props.children === 'claude-2/claude-fable-5-2');
  const style = Array.isArray(model_?.props.style) ? Object.assign({}, ...model_.props.style) : model_?.props.style;
  expect((style as { color?: string } | undefined)?.color).toBe(lightPalette.accent);
});

/**
 * A run can die under a launch: the tool frame never comes, and the card would sit running for
 * good -- everything it draws is deferred to a settle that never lands. The child's own lifecycle
 * is the second sign the launch was accepted, and it is what closes the row.
 */
it('closes itself from the child lifecycle when its own frame never arrives', () => {
  const tree = render(makeItem({ running: true, ok: false, output: '' }), {
    ...DOOR,
    spawn: { subagentId: 's1', displayName: 'digger', status: 'complete' as const },
  });
  // `ok: false` on a card the store froze is not a refusal: that flag is the placeholder
  // `startToolCall` writes, and the outcome the call never got is not the launch's verdict.
  expect(texts(tree)).toContain('started');
  expect(texts(tree)).not.toContain('refused');
});
