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
import { View } from 'react-native';
import { ChevronIcon } from '../icons';
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
 * An unfolded card, and what it puts on screen.
 *
 * The POC gives each tool its own body -- a command block, a written file, numbered lines, a diff,
 * a table of results -- and carries no arguments fold at all: what a reader opens a card for is the
 * result. A second fold inside the first was the app's own addition, and the JSON it held for an
 * `apply_patch` was the whole patch again, pushing the readable diff off the screen.
 */
describe('ToolCard body', () => {
  const PATCH = { path: '/tmp/a.ts', edits: [{ old: 'a\nb', new: 'c\nd' }] };

  function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
    return tree.root
      .findAllByType(Text)
      .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
      .filter(Boolean);
  }

  // A shell command is the densest argument drawn here. It gets its own lines under the head,
  // where the layout wraps to the real width and cuts by line -- codex and pi both do this, and
  // neither cuts a preview by a character count.
  it('keeps one line for every tool, folded, whatever the argument', () => {
    // A shell command used to wrap under the head at three lines. A column of twenty calls read
    // as a staircase, which is the one thing a folded card exists to prevent: the POC's rule is
    // 29 px per card whatever the tool, and the command is one tap away.
    const long = `cd /home/neras/dev/my-claw && ${'echo x && '.repeat(20)}true`;
    const shell = renderTool(makeItem({ args: { command: long } }));
    const shellPreview = shell.root
      .findAllByType(Text)
      .find(t => t.props.children === long);
    expect(shellPreview).toBeDefined();
    expect(shellPreview!.props.numberOfLines).toBe(1);

    const path = renderTool(makeItem({ name: 'apply_patch', args: { path: '/a/b/c/manager.ts' } }));
    const pathPreview = path.root
      .findAllByType(Text)
      .find(t => t.props.children === 'c/manager.ts');
    expect(pathPreview).toBeDefined();
    expect(pathPreview!.props.numberOfLines).toBe(1);
  });

  // The POC carries no arguments fold at all: what a reader opens a card for is the result, and
  // every tool has its own body. A second fold inside the first was the app's own addition.
  it('draws the result only, never the serialized call', () => {
    const tree = renderTool(makeItem({ args: PATCH, output: 'Patched, +3', running: true }), { expandTools: true });
    expect(bodyVisible(tree)).toBe(true);
    const shown = texts(tree);
    expect(shown).toContain('Patched, +3');
    expect(shown.some(t => t.includes('"edits"'))).toBe(false);
    expect(shown).not.toContain('arguments');
  });

  /**
   * The hour closes every block that unfolds, in the same corner (owner, 2026-11-08). A folded card
   * is one line and has its duration in the head; the stamp belongs to the output it opened.
   */
  it('stamps the hour at the bottom of an opened card, and nowhere on a folded one', () => {
    // Today at 14:06: another day's stamp is printed with its day in front of the clock, and this
    // test is about the corner the clock closes, not about the ladder (core/clock.ts).
    const today = new Date();
    const ts = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 6).getTime();
    const closed = renderTool(makeItem({ ts, args: PATCH, output: 'Patched, +3' }));
    expect(texts(closed)).not.toContain('14:06');

    const open = renderTool(makeItem({ ts, args: PATCH, output: 'Patched, +3' }));
    ReactTestRenderer.act(() => {
      const head = open.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Tool bash') && typeof node.props.onPress === 'function')[0];
      head!.props.onPress();
    });
    const shown = texts(open);
    expect(shown).toContain('14:06');
    // Last: the stamp is what closes the block, after its output.
    expect(shown[shown.length - 1]).toBe('14:06');
  });

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

});

describe('a row of a run\'s spine', () => {
  function rootStyle(tree: ReactTestRenderer.ReactTestRenderer): Record<string, unknown> {
    const root = tree.root.findAllByType(View)[0]!;
    return Object.assign({}, ...[root.props.style].flat(Infinity).filter(Boolean));
  }

  it('carries no frame and no fill: the group already draws the column', () => {
    const style = rootStyle(renderTool(makeItem(), { dense: true }));
    expect(style.borderWidth).toBe(0);
    expect(style.backgroundColor).toBe('transparent');
    expect(style.marginBottom).toBe(0);
  });

  it('keeps its chevron, so its name sits on the same column as a reasoning line', () => {
    const tree = renderTool(makeItem(), { dense: true });
    // A reasoning phase between two calls keeps its chevron; a row without one started its name a
    // chevron to the left of theirs and the column read ragged.
    expect(tree.root.findAllByType(ChevronIcon).length).toBe(1);
  });

  it('keeps the frame when it is drawn as a card on its own', () => {
    const style = rootStyle(renderTool(makeItem()));
    expect(style.borderWidth).toBe(1);
    expect(style.backgroundColor).toBe(lightPalette.surface);
  });
});

describe('content argument block', () => {
  function labels(tree: ReactTestRenderer.ReactTestRenderer): string[] {
    return tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
  }

  it('keeps the subject on the row when it fits, instead of printing it twice below', () => {
    const tree = renderTool(makeItem({ running: true, output: 'done' }), { expandTools: true });
    const shown = labels(tree);
    // The row carries `bash  sleep 1`; a block under it would be the same string again.
    expect(shown).not.toContain('command');
    expect(shown).toContain('output');
    // The command was the whole call: an ARGUMENTS fold there would offer `{}`.
    expect(shown).not.toContain('arguments');
  });

  it('opens a block for a command too long to sit on the row', () => {
    const command = `bun test ${'tests/llm/'.repeat(12)}resolver.test.ts`;
    const tree = renderTool(makeItem({ args: { command }, running: true, output: 'done' }), { expandTools: true });
    const shown = labels(tree);
    expect(shown).toContain('command');
    expect(shown).toContain(command);
  });

  it('opens a block for a multi-line command, which the row flattens', () => {
    const command = 'set -e\nbun test\nbun run build';
    const tree = renderTool(makeItem({ args: { command }, running: true, output: 'done' }), { expandTools: true });
    expect(labels(tree)).toContain(command);
  });

  it('shows what a write wrote, which used to appear nowhere at all', () => {
    const item = makeItem({ name: 'write', args: { path: '/tmp/a.ts', content: 'export const a = 1;' }, output: 'ok', running: true });
    const tree = renderTool(item, { expandTools: true });
    const shown = labels(tree);
    expect(shown).toContain('content');
    expect(shown).toContain('export const a = 1;');
    // Nothing folded beside it: the POC has no arguments fold, and a `write` shows what it wrote.
    expect(shown).not.toContain('arguments');
  });

  it('keeps a label-only tool exactly as it was: numbered lines, no block of arguments', () => {
    const tree = renderTool(makeItem({ name: 'read', args: { path: '/tmp/a.ts' }, output: 'body', running: true }), { expandTools: true });
    const shown = labels(tree);
    expect(shown).toContain('body');
    expect(shown).not.toContain('arguments');
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

describe('what an unfolded card reports', () => {
  const texts = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
    tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

  // A tap, not the pref: `expandTools` only auto-opens a card that is still running.
  const open = (item: ToolItem): ReactTestRenderer.ReactTestRenderer => {
    const tree = renderTool(item);
    ReactTestRenderer.act(() => {
      tree.root
        .find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Tool ') && typeof node.props.onPress === 'function')
        .props.onPress();
    });
    return tree;
  };

  it('counts the lines a patch moved', () => {
    const output = [
      'Patched a/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -1,2 +1,3 @@',
      '-one',
      '-two',
      '+one',
      '+two',
      '+three',
      ' ctx',
    ].join('\n');
    const shown = texts(open(makeItem({ name: 'apply_patch', args: { path: 'b.ts' }, output }))).join('|');
    // The one number a diff never said out loud.
    expect(shown).toContain('+3');
    expect(shown).toContain('−2');
    // The block names what it is: a patch is not an `output`, and the POC draws the diff under
    // its own label so the count reads as "lines moved" rather than as a footnote on a command.
    expect(shown).toContain('diff');
  });

  it('numbers the lines a read returned', () => {
    const shown = texts(open(makeItem({ name: 'read', args: { path: 'a.ts' }, output: 'const a = 1;\nconst b = 2;\n' })));
    expect(shown).toContain('1');
    expect(shown).toContain('const a = 1;');
    expect(shown).toContain('2');
  });

  it('does not number a read that started at an offset: the first line would be a lie', () => {
    const shown = texts(
      open(makeItem({ name: 'read', args: { path: 'a.ts', offset: 4000 }, output: 'middle of the file\nand more' })),
    );
    expect(shown).not.toContain('1');
    expect(shown.join('|')).toContain('middle of the file');
  });

  it('draws an ls as two columns', () => {
    const shown = texts(open(makeItem({ name: 'ls', args: { path: '.' }, output: 'd src\nf package.json\nd docs' })));
    expect(shown).toContain('dir');
    expect(shown).toContain('file');
    expect(shown).toContain('package.json');
  });

  it('falls back to the block when an ls answer is not the shape we know', () => {
    const shown = texts(open(makeItem({ name: 'ls', args: { path: '.' }, output: 'something else entirely' })));
    expect(shown).not.toContain('dir');
    expect(shown.join('|')).toContain('something else entirely');
  });
});
