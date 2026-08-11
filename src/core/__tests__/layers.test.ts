/**
 * @format
 *
 * The layer helpers decide what the Instructions rows claim the agent actually reads. Two of
 * those claims are load-bearing and both were wrong once: a source is only "broken" when its
 * workspace is really gone (an unfetched workspace list is not evidence of anything), and a
 * fallback through a source that does not carry the file lands on the shipped template, because
 * the ladder takes one hop and never follows the source's own inheritance.
 */

import type { InstructionEntry } from '../protocol';
import { sourceStatusOf, sourceOwnsFile, layerOfFile } from '../layers';

function entry(over: Partial<InstructionEntry> = {}): InstructionEntry {
  return {
    workspace: 'sofa',
    file: 'AGENTS.md',
    origin: 'fallback',
    from: '',
    bytes: 512,
    sha: 'sha1111',
    ...over,
  };
}

test('an entry with no policy reads as the default source, not as a named workspace', () => {
  // A server that predates the layer controls sends no `inherit` at all.
  expect(sourceStatusOf(entry(), [])).toEqual({ kind: 'default' });
  expect(sourceStatusOf(entry({ inherit: 'default' }), [])).toEqual({ kind: 'default' });
});

test('builtin and none are sources of their own, never a workspace named "builtin"', () => {
  expect(sourceStatusOf(entry({ inherit: 'builtin' }), ['builtin'])).toEqual({ kind: 'builtin' });
  expect(sourceStatusOf(entry({ inherit: 'none' }), [])).toEqual({ kind: 'none' });
});

test('a named source is broken only when it is missing from a list that was actually fetched', () => {
  const configured = sourceStatusOf(entry({ inherit: 'lab' }), ['default', 'sofa', 'lab']);
  expect(configured).toEqual({ kind: 'workspace', key: 'lab', self: false, removed: false });

  const gone = sourceStatusOf(entry({ inherit: 'lab' }), ['default', 'sofa']);
  expect(gone).toEqual({ kind: 'workspace', key: 'lab', self: false, removed: true });
});

test('a workspace pointing at itself is its own kind of broken', () => {
  expect(sourceStatusOf(entry({ inherit: 'sofa' }), ['sofa'])).toEqual({
    kind: 'workspace',
    key: 'sofa',
    self: true,
    removed: false,
  });
});

test('the source owns the file only when it carries its own copy', () => {
  const target = entry({ inherit: 'lab' });
  const owned = [target, entry({ workspace: 'lab', origin: 'own', from: 'lab' })];
  expect(sourceOwnsFile(target, owned)).toBe(true);

  // The source only inherits it: the one-hop rule stops there, so it does not count as owning.
  const borrowed = [target, entry({ workspace: 'lab', origin: 'inherited', from: 'default' })];
  expect(sourceOwnsFile(target, borrowed)).toBe(false);

  // The source carries nothing for that file at all.
  expect(sourceOwnsFile(target, [target])).toBe(false);

  // A different file in the source workspace proves nothing about this one.
  const otherFile = [target, entry({ workspace: 'lab', file: 'CORE.md', origin: 'own' })];
  expect(sourceOwnsFile(target, otherFile)).toBe(false);
});

test('layerOfFile names the prompt layer, and passes unknown files through', () => {
  expect(layerOfFile('AGENTS.md')).toBe('AGENTS');
  expect(layerOfFile('CORE.md')).toBe('CORE');
  expect(layerOfFile('svc/AGENTS.md')).toBe('svc/AGENTS.md');
});
