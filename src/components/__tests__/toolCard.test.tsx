/**
 * ToolCard expansion is owned by the server pref:
 * - expandTools off (default): the card NEVER auto-opens, not even while a tool runs. Only the
 *   owner's tap opens it, and a tap survives the settle.
 * - expandTools on: the card opens when the run starts and stays open while it runs; after the
 *   settle it stays open too (the pref means "always expand").
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ToolCard } from '../ToolCard';
import { summarizeArgs } from '../../core/utils';
import type { ToolItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

function makeItem(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: 'tool-1',
    kind: 'tool',
    name: 'bash',
    args: { command: 'sleep 1' },
    ok: true,
    output: '',
    truncated: false,
    ts: Date.now(),
    ...overrides,
  };
}

function renderTool(item: ToolItem, props: Record<string, unknown> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ToolCard item={item} {...props} />
      </ThemeContext.Provider>,
    );
    mounted.push(tree);
  });
  return tree;
}

// The body is identified by its OUTPUT label, which every card has. The ARGUMENTS fold is not a
// witness: a call whose only argument is its content (bash) has no fold at all.
function bodyVisible(tree: ReactTestRenderer.ReactTestRenderer): boolean {
  return tree.root
    .findAllByType(Text)
    .some(t => [t.props.children].flat().join('').startsWith('output'));
}

function updateItem(tree: ReactTestRenderer.ReactTestRenderer, item: ToolItem, props: Record<string, unknown> = {}) {
  ReactTestRenderer.act(() => {
    tree.update(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ToolCard item={item} {...props} />
      </ThemeContext.Provider>,
    );
  });
}

describe('ToolCard expansion pref', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does NOT auto-open while running when expandTools is off', () => {
    const tree = renderTool(makeItem({ running: true }));
    expect(bodyVisible(tree)).toBe(false);
    // First chunk arrives: still collapsed.
    updateItem(tree, makeItem({ running: true, output: 'chunk' }));
    expect(bodyVisible(tree)).toBe(false);
    // Settles: still collapsed, no flash possible.
    updateItem(tree, makeItem({ running: false, output: 'result', ok: true }));
    expect(bodyVisible(tree)).toBe(false);
  });

  it('does NOT auto-open a spawn run when expandTools is off', () => {
    const tree = renderTool(makeItem({ running: false }), {
      spawn: { subagentId: 's1', displayName: 'agent', status: 'running' },
    });
    expect(bodyVisible(tree)).toBe(false);
  });

  it('auto-opens while running when expandTools is on', () => {
    const tree = renderTool(makeItem({ running: true }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
  });

  it('stays open after the settle when expandTools is on', () => {
    const tree = renderTool(makeItem({ running: true }), { expandTools: true });
    updateItem(tree, makeItem({ running: false, output: 'result' }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
  });

  it('a manual tap opens the card even with expandTools off, and the settle leaves it open', () => {
    const tree = renderTool(makeItem({ running: true }));
    expect(bodyVisible(tree)).toBe(false);
    ReactTestRenderer.act(() => {
      // The header row is a Pressable labeled 'Tool bash, running'.
      const header = tree.root.find(
        node => node.props.accessibilityLabel === 'Tool bash, running' && typeof node.props.onPress === 'function',
      );
      header.props.onPress();
    });
    expect(bodyVisible(tree)).toBe(true);
    updateItem(tree, makeItem({ running: false, output: 'result' }));
    expect(bodyVisible(tree)).toBe(true);
  });
});

/**
 * The arguments are a fold of their own inside the card. An `apply_patch` call carries the whole
 * patch twice -- once as escaped JSON in the arguments, once as a readable diff in the output --
 * and the JSON was pushing the diff off the screen.
 */
describe('ToolCard arguments fold', () => {
  const PATCH = { path: '/tmp/a.ts', edits: [{ old: 'a\nb', new: 'c\nd' }] };

  function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
    return tree.root
      .findAllByType(Text)
      .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
      .filter(Boolean);
  }

  function toggleArgs(tree: ReactTestRenderer.ReactTestRenderer, name = 'bash') {
    ReactTestRenderer.act(() => {
      tree.root
        .find(node => node.props.accessibilityLabel === `Arguments of ${name}` && typeof node.props.onPress === 'function')
        .props.onPress();
    });
  }

  // A shell command is the densest argument drawn here. It gets its own lines under the head,
  // where the layout wraps to the real width and cuts by line -- codex and pi both do this, and
  // neither cuts a preview by a character count.
  it('gives a shell command its own lines under the head, and keeps a path on the head row', () => {
    const long = `cd /home/neras/dev/my-claw && ${'echo x && '.repeat(20)}true`;
    const shell = renderTool(makeItem({ args: { command: long } }));
    const shellPreview = shell.root
      .findAllByType(Text)
      .find(t => t.props.children === long);
    expect(shellPreview).toBeDefined();
    expect(shellPreview!.props.numberOfLines).toBe(3);

    const path = renderTool(makeItem({ name: 'apply_patch', args: { path: '/a/b/c/manager.ts' } }));
    const pathPreview = path.root
      .findAllByType(Text)
      .find(t => t.props.children === 'c/manager.ts');
    expect(pathPreview).toBeDefined();
    expect(pathPreview!.props.numberOfLines).toBe(1);
  });

  it('shows the output and only a preview of the arguments when the card opens', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'Patched, +3', running: true }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
    const shown = texts(tree);
    expect(shown).toContain('Patched, +3');
    // The preview line, not the serialized call.
    expect(shown).toContain(summarizeArgs(PATCH).text);
    expect(shown.some(t => t.includes('"edits"'))).toBe(false);
  });

  // `+N` says the call carried N arguments more than the one on screen. Glued to the preview it
  // sat at the tail of a `flex: 1` line clipped at the pixel, so the denser the call the surer
  // the count was the first thing cut -- and a reader had no way to tell a one-argument call from
  // a nine-argument one.
  it('keeps the count of the hidden arguments out of the line the layout clips', () => {
    const item = makeItem({ name: 'mcp__thing__do', args: { first: 'x'.repeat(400), second: 2, third: 3 } });
    const tree = renderTool(item);
    const nodes = tree.root.findAllByType(Text);
    const joined = (node: ReactTestRenderer.ReactTestInstance): string => [node.props.children].flat().join('');

    const count = nodes.filter(node => joined(node) === '+2');
    expect(count).toHaveLength(1);
    // Its own node, outside any clipped one: a sibling is measured before the line that shrinks.
    expect(count[0]!.props.numberOfLines).toBeUndefined();
    expect(nodes.filter(node => node.props.numberOfLines !== undefined).some(node => joined(node).includes('+2'))).toBe(
      false,
    );
  });

  it('unfolds the arguments on tap and folds them back', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'ok', running: true }), { expandTools: true });
    toggleArgs(tree);
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(true);
    toggleArgs(tree);
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(false);
  });

  it('forgets an unfolded argument list when the card itself closes', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'ok', running: true }), { expandTools: true });
    toggleArgs(tree);
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(true);
    // The pref goes off: the card folds, and reopening it must start on the output again.
    updateItem(tree, makeItem({ args: PATCH, output: 'ok', running: false }));
    expect(bodyVisible(tree)).toBe(false);
    updateItem(tree, makeItem({ args: PATCH, output: 'ok', running: false }), { expandTools: true });
    expect(texts(tree).some(t => t.includes('"edits"'))).toBe(false);
  });
});

describe('content argument block', () => {
  function labels(tree: ReactTestRenderer.ReactTestRenderer): string[] {
    return tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
  }

  it('shows the command of a bash call unfolded, with no arguments fold beside it', () => {
    const tree = renderTool(makeItem({ running: true, output: 'done' }), { expandTools: true });
    const shown = labels(tree);
    expect(shown).toContain('command');
    expect(shown).toContain('sleep 1');
    // The command was the whole call: an ARGUMENTS fold there would offer `{}`.
    expect(shown).not.toContain('arguments');
  });

  it('shows what a write wrote, which used to appear nowhere at all', () => {
    const item = makeItem({ name: 'write', args: { path: '/tmp/a.ts', content: 'export const a = 1;' }, output: 'ok', running: true });
    const tree = renderTool(item, { expandTools: true });
    const shown = labels(tree);
    expect(shown).toContain('content');
    expect(shown).toContain('export const a = 1;');
    // The path is a label: it stays in the fold.
    expect(shown).toContain('arguments');
  });

  it('keeps a label-only tool exactly as it was', () => {
    const tree = renderTool(makeItem({ name: 'read', args: { path: '/tmp/a.ts' }, output: 'body', running: true }), { expandTools: true });
    const shown = labels(tree);
    expect(shown).toContain('arguments');
    expect(shown).not.toContain('content');
  });
});

describe('ToolCard elapsed time while running', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
    tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

  test('a running card counts the seconds since it started, and the settled duration takes over', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T10:00:00.000Z'));
    // A card that has run for a while shows nothing but a spinner: three minutes into a build,
    // nothing said whether it was three minutes or three seconds. The settled card has a duration,
    // the running one had none.
    const started = Date.now() - 42_000;
    const tree = renderTool(makeItem({ running: true, ts: started }));
    expect(textsOf(tree)).toContain('42 s');

    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(textsOf(tree)).toContain('1 min 2 s');

    updateItem(tree, makeItem({ running: false, ts: started, durationMs: 62_400 }));
    // Settled: the card holds the duration it earned -- proven by the counter being gone, since a
    // live counter would still be climbing below.
    expect(textsOf(tree)).toContain('1 min 2 s');
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(textsOf(tree)).toContain('1 min 2 s');
  });

  /**
   * The run died with this call in flight. The store settles it with the duration it had earned;
   * the card must stop counting there, whatever the clock does afterwards -- a card left running
   * read "220m 25s" on a call the server had settled in 25 s.
   */
  test('a call the run ended under says stopped, and holds the duration the run ended on', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T13:25:25.000Z'));
    const started = Date.now() - 25_000;
    const tree = renderTool(makeItem({ running: true, ts: started }));
    expect(textsOf(tree)).toContain('25 s');

    updateItem(tree, makeItem({ running: false, ok: false, interrupted: true, ts: started, durationMs: 25_000 }));
    expect(textsOf(tree)).toContain('stopped');
    // "failed" is a verdict only a result can carry: this call never returned one.
    expect(textsOf(tree)).not.toContain('failed');
    expect(textsOf(tree)).toContain('25 s');

    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(3 * 60 * 60 * 1000);
    });
    expect(textsOf(tree)).toContain('25 s');
    expect(textsOf(tree).some(text => text.includes('m') && text.endsWith('s') && text !== '25 s')).toBe(false);
  });

  test('a call that ran and came back with an error still reads failed', () => {
    const tree = renderTool(makeItem({ running: false, ok: false, output: 'boom', durationMs: 300 }));
    expect(textsOf(tree)).toContain('failed');
    expect(textsOf(tree)).not.toContain('stopped');
  });
});
