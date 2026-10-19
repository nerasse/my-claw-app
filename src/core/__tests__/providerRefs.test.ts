/**
 * The tags a provider deletion would silently break, and what the sheet says about them.
 *
 * Deleting a provider whose models a tag routes through does not fail loudly: the route falls back
 * to the global default and the tag stops meaning what it says. The server refuses on those tags
 * since 0.7.14; these helpers are what let the confirmation name them before the cascade is agreed
 * to (2026-09-12).
 */

import {
  deleteProviderCascadeLabel,
  deleteProviderPreview,
  providerOfRef,
  renamePreviewText,
  routeOf,
  tagRoutesSuffix,
  tagRoutesThroughProvider,
} from '../providerRefs';
import type { TagInfo } from '../protocol';

const PROVIDERS = ['litellm', 'anthropic', 'opencode_go'];

describe('providerOfRef', () => {
  it('reads the head as a provider only when one is declared', () => {
    expect(providerOfRef('litellm/mimo', PROVIDERS)).toBe('litellm');
    expect(providerOfRef('opencode_go/deepseek-flash', PROVIDERS)).toBe('opencode_go');
    // An OpenRouter id whose head names no declared provider is an id, not a provider.
    expect(providerOfRef('openai/gpt-5.6-luna', PROVIDERS)).toBeUndefined();
  });

  it('ignores the endpoint pin', () => {
    expect(providerOfRef('openrouter/anthropic/claude-fable-5.1@azure/eu', ['openrouter'])).toBe('openrouter');
  });
});

describe('routeOf', () => {
  it('reads the ordered route, and the legacy single model as a one-step route', () => {
    expect(routeOf({ name: 'A', route: [{ model: 'litellm/mimo', effort: 'max' }] })).toEqual([
      { model: 'litellm/mimo', effort: 'max' },
    ]);
    expect(routeOf({ name: 'B', model: 'litellm/mimo', effort: 'low' })).toEqual([
      { model: 'litellm/mimo', effort: 'low' },
    ]);
    expect(routeOf({ name: 'Default' })).toEqual([]);
  });
});

describe('tagRoutesThroughProvider', () => {
  const tags: TagInfo[] = [
    { name: 'Cheap', route: [{ model: 'opencode_go/deepseek-flash' }, { model: 'anthropic/claude-opus-5' }] },
    { name: 'Smart', route: [{ model: 'anthropic/claude-opus-5' }] },
    { name: 'Medium', model: 'anthropic/claude-opus-5' },
  ];

  it('names the tag and the candidate that steps through the provider', () => {
    expect(tagRoutesThroughProvider(tags, 'opencode_go', PROVIDERS)).toEqual([
      { tag: 'Cheap', model: 'opencode_go/deepseek-flash' },
    ]);
  });

  it('finds nothing when no route goes through it', () => {
    expect(tagRoutesThroughProvider(tags, 'litellm', PROVIDERS)).toEqual([]);
  });

  it('reads the legacy shape too, so an old config is not a blind spot', () => {
    expect(tagRoutesThroughProvider(tags, 'anthropic', PROVIDERS).map(hit => hit.tag)).toEqual([
      'Cheap',
      'Smart',
      'Medium',
    ]);
  });
});

describe('what the sheet says', () => {
  it('keeps the model-first sentence when there is no tag route', () => {
    const preview = deleteProviderPreview({ key: 'litellm', declaredModels: ['mimo'] });
    expect(preview).toContain('still declares 1 model');
    expect(preview).toContain('mimo');
    expect(tagRoutesSuffix([])).toBe('');
  });

  it('spells out the tags the cascade would repoint', () => {
    const suffix = tagRoutesSuffix([{ tag: 'Cheap', model: 'opencode_go/deepseek-flash' }]);
    expect(suffix).toContain('Cheap');
    expect(suffix).toContain('opencode_go/deepseek-flash');
    expect(suffix).toContain('repoints it at the default model');
    expect(tagRoutesSuffix([{ tag: 'Cheap', model: 'a/b' }, { tag: 'Smart', model: 'a/c' }])).toContain(
      'repoints them at the default model',
    );
  });

  it('names both halves of the cascade in the button', () => {
    expect(deleteProviderCascadeLabel({ declaredModels: ['a', 'b'], tagRoutes: [{ tag: 'Cheap' }] }))
      .toBe('Delete, then remove 2 declared models and repoint the tag route Cheap');
    // A provider with no declared model of its own is still not deletable while a tag routes to it.
    expect(deleteProviderCascadeLabel({ declaredModels: [], tagRoutes: [{ tag: 'Cheap' }, { tag: 'Smart' }] }))
      .toBe('Delete, then repoint the tag routes Cheap, Smart');
  });
});

describe('renamePreviewText', () => {
  it('names what follows the key, by store, in one line', () => {
    expect(
      renamePreviewText('claude-abo', 'claude-2', {
        models: [],
        tags: ['Cheap'],
        agents: [],
        sessions: ['s1', 's2'],
        cron: [],
        files: [],
        account: true,
      }),
    ).toBe('Rename "claude-abo" to "claude-2"? It follows 1 tag, 2 conversations, its sign-in.');
  });

  it('says so when nothing else names it', () => {
    expect(
      renamePreviewText('a', 'b', { models: [], tags: [], agents: [], sessions: [], cron: [], files: [], account: false }),
    ).toBe('Rename "a" to "b"? Nothing new names it.'.replace('new ', 'else '));
  });
});
