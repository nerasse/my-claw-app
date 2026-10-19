/**
 * Which tags route through a provider, read the way the server reads it.
 *
 * A tag route is a list of `provider/apiId` references, and a provider key is the head of one only
 * when a provider by that name exists (`parseModelRef` on the server, same rule): an OpenRouter id
 * like `openai/gpt-5.6-luna` has a head that names no provider, so it is part of the id.
 *
 * Why it matters here: deleting a provider whose models a tag routes through does not fail loudly.
 * The route falls back to the global default and the tag quietly stops meaning what it says. The
 * server refuses on those tags since 0.7.14; the confirmation has to name them, or the owner
 * agrees to a cascade he was not shown.
 */

import type { ProviderRenameRefs, TagInfo } from './protocol';

/** The route of a tag, whichever shape the server sent: ordered route, or the legacy single model. */
export function routeOf(tag: TagInfo): Array<{ model: string; effort?: string; contextCap?: number }> {
  if (Array.isArray(tag.route)) return tag.route.filter(entry => Boolean(entry?.model));
  return tag.model ? [{ model: tag.model, ...(tag.effort ? { effort: tag.effort } : {}), ...(tag.contextCap !== undefined ? { contextCap: tag.contextCap } : {}) }] : [];
}

/** The provider a reference names, or undefined when its head names no declared provider. */
export function providerOfRef(ref: string, providerKeys: Iterable<string>): string | undefined {
  const head = ref.split('@')[0]!.split('/')[0]!;
  for (const key of providerKeys) if (key === head) return key;
  return undefined;
}

/** Every tag whose route steps through this provider, with the candidate that does. */
export function tagRoutesThroughProvider(
  tags: TagInfo[],
  key: string,
  providerKeys: Iterable<string> = [],
): Array<{ tag: string; model: string }> {
  const out: Array<{ tag: string; model: string }> = [];
  for (const tag of tags) {
    const hit = routeOf(tag).find(candidate => providerOfRef(candidate.model, providerKeys) === key);
    if (hit) out.push({ tag: tag.name, model: hit.model });
  }
  return out;
}

/**
 * What the delete sheet says, in the three shapes the references take.
 *
 * The provider may carry declared models, tag routes, or both, and the server refuses on each
 * separately. Naming them here is the whole point: the cascade is opt-in, so the owner has to see
 * what it takes before he agrees to it.
 */
export function deleteProviderPreview(provider: { key: string; declaredModels: string[] }): string {
  if (provider.declaredModels.length > 0) {
    return `Delete the provider "${provider.key}"? It still declares ${provider.declaredModels.length} model${provider.declaredModels.length === 1 ? '' : 's'}, removed with it: ${provider.declaredModels.join(', ')}.`;
  }
  return `Delete the provider "${provider.key}"? Its discovered models leave with the catalog refresh, and a re-auth recreates the SDK providers.`;
}

/** The tag routes that would be repointed: the cascade points them at the default model. */
export function tagRoutesSuffix(routes: Array<{ tag: string; model: string }>): string {
  if (routes.length === 0) return '';
  const named = routes.map(route => `${route.tag} (${route.model})`).join(', ');
  const many = routes.length !== 1;
  return ` The tag${many ? 's' : ''} ${named} route${many ? 's' : ''} through it: the delete below repoints ${many ? 'them' : 'it'} at the default model.`;
}

export function deleteProviderCascadeLabel(provider: { declaredModels: string[]; tagRoutes: Array<{ tag: string }> }): string {
  const parts: string[] = [];
  if (provider.declaredModels.length > 0) {
    parts.push(`remove ${provider.declaredModels.length} declared model${provider.declaredModels.length === 1 ? '' : 's'}`);
  }
  if (provider.tagRoutes.length > 0) {
    parts.push(`repoint the tag route${provider.tagRoutes.length === 1 ? '' : 's'} ${provider.tagRoutes.map(route => route.tag).join(', ')}`);
  }
  return `Delete, then ${parts.join(' and ')}`;
}

/**
 * The rename sheet's one line: what follows the key, named by store, then the promise that the
 * rename writes them all. Nothing is offered per reference -- they all land on the new key, and
 * the sizes are what makes the promise checkable (server 0.7.118+).
 */
export function renamePreviewText(from: string, to: string, refs: ProviderRenameRefs): string {
  const parts: string[] = [];
  const count = (n: number, what: string): void => {
    if (n > 0) parts.push(`${n} ${what}${n === 1 ? '' : 's'}`);
  };
  count(refs.models.length, 'declared model');
  count(refs.tags.length, 'tag');
  count(refs.agents.length, 'agent');
  count(refs.sessions.length, 'conversation');
  count(refs.cron.length, 'cron job');
  count(refs.files.length, 'agent file');
  if (refs.account) parts.push('its sign-in');
  const tail = parts.length > 0 ? ` It follows ${parts.join(', ')}.` : ' Nothing else names it.';
  return `Rename "${from}" to "${to}"?${tail}`;
}

