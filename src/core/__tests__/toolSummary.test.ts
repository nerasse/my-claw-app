/**
 * A collapsed card is only worth having if it can be scanned. It used to show the first argument
 * the model happened to serialize, so the same tool read differently from one call to the next.
 */

import { labelArgs, shortenPath, summarizeTool, toolContent } from '../toolSummary';
import { PREVIEW_GUARD, summarizeArgs } from '../utils';

it('names the argument that identifies the call, not the first one serialized', () => {
  // `path` last on purpose: object order is the model's, and the old preview followed it.
  const patch = summarizeTool('apply_patch', { edits: [{ old: 'a', new: 'b' }], path: '/home/n/dev/app/src/core/chat.ts' });
  expect(patch.detail).toBe('core/chat.ts');

  expect(summarizeTool('bash', { timeout: 120000, command: 'ls -la' }).detail).toBe('ls -la');
  expect(summarizeTool('web_search', { count: 5, query: 'rn markdown hr' }).detail).toBe('rn markdown hr');
  expect(summarizeTool('fetch', { method: 'GET', url: 'https://example.com/a' }).detail).toBe('GET https://example.com/a');
});

it('puts the verb ahead of the target where the verb is half the call', () => {
  expect(summarizeTool('memory', { action: 'remember', content: 'neras prefers terse answers' }).detail).toBe(
    'remember neras prefers terse answers',
  );
  expect(summarizeTool('cron', { action: 'pause', job_id: 'j-1' }).detail).toBe('pause j-1');
  expect(summarizeTool('spawn', { mode: 'session', type: 'research', name: 'digger' }).detail).toBe('session digger');
});

it('shortens a path from the left: the tree above a file identifies nothing', () => {
  expect(shortenPath('/home/neras/dev/my-claw-app/src/core/chat.ts')).toBe('core/chat.ts');
  // Nothing to gain, nothing lost.
  expect(shortenPath('/etc/hosts')).toBe('/etc/hosts');
  expect(shortenPath('chat.ts')).toBe('chat.ts');
});

it('flattens to one line whatever the argument holds', () => {
  expect(summarizeTool('bash', { command: 'a\n  b\n  c' }).detail).toBe('a b c');
});

// The row is `flex: 1` with `numberOfLines={1}`, so it clips at the pixel and draws its own
// ellipsis. Cutting here too meant the shorter of the two won: at a reduced chat font scale the
// character count ran out first and left the rest of the row blank behind a dead ellipsis.
it('hands the preview over whole, so the layout is what decides where it ends', () => {
  const long = summarizeTool('bash', { command: `echo ${'x'.repeat(200)}` });
  expect(long.detail.length).toBeGreaterThan(72);
  expect(long.detail).not.toContain('…');

  const unknown = summarizeTool('some_mcp_tool', {}, summarizeArgs({ q: 'y'.repeat(200), n: 2 }));
  expect(unknown.detail.length).toBeGreaterThan(72);
  expect(unknown.detail).not.toContain('…');
});

// A tool called with a whole file as its first argument would otherwise be flattened and measured
// in full on every render.
it('still refuses to build a preview no row could ever draw', () => {
  const huge = summarizeTool('bash', { command: 'z'.repeat(50_000) });
  expect(huge.detail.length).toBe(PREVIEW_GUARD);
  expect(summarizeArgs({ body: 'z'.repeat(50_000) }).length).toBe(PREVIEW_GUARD);
});

it('marks a path, a command or a pattern as code and a bare verb as prose', () => {
  expect(summarizeTool('read', { path: '/a/b/c.ts' }).mono).toBe(true);
  expect(summarizeTool('search', { pattern: '[0-9]+', path: '/src' }).mono).toBe(true);
  expect(summarizeTool('list_agents', {}).mono).toBe(false);
  expect(summarizeTool('spawn', { mode: 'session' }).mono).toBe(false);
});

it('draws no mark of its own: the row already has a chevron', () => {
  // A per-family glyph was tried and read as a stray arrow beside the chevron, not as a category.
  for (const call of [['read', { path: 'a' }], ['bash', { command: 'ls' }], ['some_mcp_tool', { a: 1 }]] as const) {
    expect(Object.keys(summarizeTool(call[0], call[1])).sort()).toEqual(['block', 'detail', 'mono']);
  }
});

it('falls back to the generic preview for a tool it has never heard of', () => {
  // An MCP server's tool, or a plugin: unknown here, and still readable.
  expect(summarizeTool('mcp__thing__do', { whatever: 'x' }, 'x +2').detail).toBe('x +2');
  // Known tool, argument missing: better the generic preview than an empty line.
  expect(summarizeTool('read', {}, 'fallback').detail).toBe('fallback');
});

describe('content arguments', () => {
  it('names the argument whose value is the subject of the call', () => {
    expect(toolContent('bash', { command: 'ls -l' })).toEqual({ key: 'command', text: 'ls -l' });
    expect(toolContent('write', { path: '/a.ts', content: 'hello' })?.key).toBe('content');
    expect(toolContent('cron', { action: 'create', prompt: 'do it' })?.text).toBe('do it');
  });

  it('has none for a label-only tool, so nothing is unfolded that a card head already says', () => {
    expect(toolContent('read', { path: '/a.ts' })).toBeNull();
    expect(toolContent('search', { pattern: 'x' })).toBeNull();
    // Nothing to lay out: an empty list is not a content block.
    expect(toolContent('apply_patch', { path: '/a.ts', edits: [] })).toBeNull();
    // An MCP tool: unknown, and a block titled after a guessed key would be a lie.
    expect(toolContent('mcp__thing__do', { content: 'x' })).toBeNull();
  });

  it('drops an empty or absent content argument rather than drawing an empty block', () => {
    // fetch only carries a body on POST/PUT.
    expect(toolContent('fetch', { url: 'https://x', method: 'GET' })).toBeNull();
    expect(toolContent('fetch', { url: 'https://x', method: 'POST', body: '{}' })?.text).toBe('{}');
    expect(toolContent('write', { path: '/a', content: '   ' })).toBeNull();
  });

  it('leaves the label arguments to the fold, and never the content one twice', () => {
    expect(labelArgs('write', { path: '/a.ts', content: 'hello' })).toEqual({ path: '/a.ts' });
    expect(labelArgs('read', { path: '/a.ts' })).toEqual({ path: '/a.ts' });
  });

  it('reports no fold at all when the content argument was the only one', () => {
    // bash: the command is the whole call. An ARGUMENTS fold there offers `{}`.
    expect(labelArgs('bash', { command: 'ls' })).toBeNull();
    expect(labelArgs('list_agents', {})).toBeNull();
  });
});

describe('apply_patch edits', () => {
  it('lays the replacements out as pairs, not as escaped JSON', () => {
    // The output carries the diff only when the patch applied. A refused one answers with an
    // error, and what the agent tried to write would otherwise appear nowhere.
    const content = toolContent('apply_patch', {
      path: '/a.ts',
      edits: [{ old: 'const a = 1;', new: 'const a = 2;' }],
    });
    expect(content?.key).toBe('edits');
    expect(content?.text).toBe('edit \u00b7 old\nconst a = 1;\n\nedit \u00b7 new\nconst a = 2;');
    expect(content?.text).not.toContain('\\n');
  });

  it('numbers the pairs when there are several, and names a deletion', () => {
    const content = toolContent('apply_patch', {
      path: '/a.ts',
      edits: [{ old: 'a', new: 'b' }, { old: 'gone', new: '' }],
    });
    expect(content?.text).toContain('edit 1 \u00b7 old');
    expect(content?.text).toContain('edit 2 \u00b7 new\n(deleted)');
  });

  it('falls back to the fold on a shape it does not recognise', () => {
    // An older client, a plugin passing something else: better the raw fold than a wrong layout.
    expect(toolContent('apply_patch', { edits: ['not a pair'] })).toBeNull();
    expect(labelArgs('apply_patch', { path: '/a.ts', edits: ['x'] })).toEqual({ path: '/a.ts' });
  });
});
