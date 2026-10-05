import type { StatsFacets, StatsFilter } from './protocol';

/**
 * The filter of the statistics page, as data.
 *
 * Everything here is pure: the chip row, the sheets and the store all read the same six functions,
 * so the label a chip shows, the value a sheet ticks and the filter that travels to the server
 * cannot drift apart. The narrowing itself happens server-side, in SQL, before the aggregation --
 * see `docs/stats-page.md` in the server repo. Nothing here computes a figure.
 */

/** The four dimensions that take a value: each one opens a list. */
export type FilterChoiceKey = 'workspace' | 'folderId' | 'model' | 'provider' | 'caller' | 'sessionId';
/** The two that are a predicate on the call rather than a choice: tapping one toggles it. */
export type FilterFlagKey = 'errorsOnly' | 'unpricedOnly';
export type FilterKey = FilterChoiceKey | FilterFlagKey;

/**
 * The chip row, in draw order.
 *
 * A chip reads `Model · glm-5.2` once the dimension is set and `Model` while it is open, so the row
 * is the state: there is no separate summary line to keep in step with it. The first two are the
 * scoping ones -- which workspace, which folder -- because "how much did that project cost" is the
 * question this page gets asked.
 */
export const FILTER_CHIPS: ReadonlyArray<{ key: FilterKey; label: string; sheet?: string }> = [
  { key: 'workspace', label: 'Workspace', sheet: 'Workspace' },
  { key: 'folderId', label: 'Folder', sheet: 'Folder' },
  { key: 'model', label: 'Model', sheet: 'Model' },
  { key: 'provider', label: 'Provider', sheet: 'Provider' },
  { key: 'caller', label: 'Source', sheet: 'Source' },
  { key: 'sessionId', label: 'Conversation', sheet: 'Conversation' },
  { key: 'errorsOnly', label: 'Failed only' },
  { key: 'unpricedOnly', label: 'Unpriced' },
];

const CHOICE_KEYS: readonly FilterKey[] = ['workspace', 'folderId', 'model', 'provider', 'caller', 'sessionId'];

export function isChoice(key: FilterKey): key is FilterChoiceKey {
  return CHOICE_KEYS.includes(key);
}

/** The one spelling of "nothing narrowed", so an empty filter has a single shape on the wire. */
export function noFilter(): StatsFilter {
  return {};
}

export function filterCount(filter: StatsFilter): number {
  return Object.values(filter).filter((value) => value !== undefined && value !== false).length;
}

export function isEmptyFilter(filter: StatsFilter): boolean {
  return filterCount(filter) === 0;
}

/**
 * Two filters are the same report when every dimension agrees.
 *
 * Not a JSON comparison, and not only because the server rebuilds the object in its own key order:
 * an absent flag and an explicit `false` are the same request. Neither narrows anything, and the
 * store must not treat the echo of one as the answer to the other.
 */
export function sameFilter(a: StatsFilter, b: StatsFilter): boolean {
  return (
    a.model === b.model &&
    a.provider === b.provider &&
    a.caller === b.caller &&
    a.sessionId === b.sessionId &&
    a.workspace === b.workspace &&
    a.folderId === b.folderId &&
    (a.errorsOnly === true) === (b.errorsOnly === true) &&
    (a.unpricedOnly === true) === (b.unpricedOnly === true)
  );
}

/** Sets a choice, or clears it when the value is undefined. Every other dimension is untouched. */
export function withChoice(filter: StatsFilter, key: FilterChoiceKey, value: string | undefined): StatsFilter {
  const next: StatsFilter = { ...filter };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function toggleFlag(filter: StatsFilter, key: FilterFlagKey): StatsFilter {
  const next: StatsFilter = { ...filter };
  if (filter[key] === true) delete next[key];
  else next[key] = true;
  return next;
}

/** `api.anthropic.com`, from a base url: the scheme and the path are not part of the name. */
export function hostLabel(baseUrl: string): string {
  const withoutScheme = baseUrl.replace(/^[a-z]+:\/\//i, '');
  return (withoutScheme.split('/')[0] ?? withoutScheme).replace(/^www\./, '');
}

/**
 * A model id without its vendor prefix: the chip has one line, and `z-ai/` is the same word on
 * every OpenRouter model. The tail is kept whole -- an endpoint pin (`@streamlake/fp8`) is part of
 * which bill this is, and cutting the last segment would hide exactly what tells two apart.
 */
export function modelLabel(model: string): string {
  const [, ...rest] = model.split('/');
  return rest.length === 0 ? model : rest.join('/');
}

/**
 * What a conversation is called in a chip. The facets carry the same label the ranking draws, and
 * a session this payload has never heard of falls back to its id: the filter can hold a value the
 * current window does not show, and a chip that read `Conversation · undefined` would look broken.
 */
export function sessionChoiceLabel(facets: StatsFacets | undefined, sessionId: string): string {
  const held = facets?.sessions.find((session) => session.sessionId === sessionId);
  if (held === undefined) return sessionId;
  return held.deleted ? `${held.label} · deleted` : held.label;
}

/** The same, for a folder: named by the server, and the id stands in for a payload that predates the field. */
export function folderChoiceLabel(facets: StatsFacets | undefined, folderId: string): string {
  return facets?.folders.find((folder) => folder.folderId === folderId)?.label ?? folderId;
}

/**
 * What `caller` values are called on screen.
 *
 * `compaction-speculative` is a lane inside one feature and not a word anybody says out loud. The
 * values stay what the rows carry; only the labels change.
 */
const CALLER_LABELS: Record<string, string> = {
  orchestrator: 'main agent',
  subagent: 'sub-agents',
  browser: 'browser',
  compaction: 'compaction',
  'compaction-speculative': 'compaction · speculative',
};

export function callerLabel(value: string): string {
  return CALLER_LABELS[value] ?? value;
}

/** What the server calls the calls no provider could be given. */
const UNKNOWN_PROVIDER = '(unknown)';

/**
 * A provider as the owner named it. A server older than 0.7.92 sends hosts and no names: the host
 * is then the clearest label there is.
 */
function providerChoiceLabel(facets: StatsFacets | undefined, value: string): string {
  return facets?.providerLabels?.[value] ?? hostLabel(value);
}

/** What a chip shows beside its dimension name, or '' while that dimension is open. */
export function chipValue(filter: StatsFilter, key: FilterKey, facets: StatsFacets | undefined): string {
  if (!isChoice(key)) return filter[key] === true ? 'on' : '';
  const value = filter[key];
  if (value === undefined) return '';
  if (key === 'provider') return providerChoiceLabel(facets, value);
  if (key === 'model') return modelLabel(value);
  if (key === 'sessionId') return sessionChoiceLabel(facets, value);
  if (key === 'folderId') return folderChoiceLabel(facets, value);
  return value;
}

/** One row of a choice sheet: the value the server matches, and what to draw for it. */
export interface FilterChoice {
  value: string;
  label: string;
}

/**
 * The rows a choice sheet offers, from the facets the server computed **without** the filter on
 * screen. An option list built from the current answer would keep the one choice already made and
 * drop every alternative, which is a filter nobody can undo.
 */
export function choicesOf(facets: StatsFacets | undefined, key: FilterChoiceKey): FilterChoice[] {
  if (facets === undefined) return [];
  if (key === 'workspace') return facets.workspaces.map((value) => ({ value, label: value }));
  if (key === 'folderId') return facets.folders.map((folder) => ({ value: folder.folderId, label: folder.label }));
  if (key === 'model') return facets.models.map((value) => ({ value, label: value }));
  if (key === 'provider') {
    // By name, the calls nobody could place last: the keys sort in an order the owner never chose.
    return facets.providers
      .map((value) => ({ value, label: providerChoiceLabel(facets, value) }))
      .sort((a, b) => Number(a.value === UNKNOWN_PROVIDER) - Number(b.value === UNKNOWN_PROVIDER) || a.label.localeCompare(b.label));
  }
  if (key === 'caller') return facets.callers.map((value) => ({ value, label: callerLabel(value) }));
  return facets.sessions.map((session) => ({
    value: session.sessionId,
    label: session.deleted ? `${session.label} · deleted` : session.label,
  }));
}

/**
 * What is narrowing the report, in one sentence: what an empty screen says instead of nothing.
 *
 * Drawn from the same six chips, so a dimension the row shows cannot be missing here. Empty when
 * nothing is set -- a sentence that read "everything" would be a filter that says nothing.
 */
export function filterSummary(filter: StatsFilter, facets: StatsFacets | undefined): string {
  const parts: string[] = [];
  for (const chip of FILTER_CHIPS) {
    if (isChoice(chip.key)) {
      const shown = chipValue(filter, chip.key, facets);
      if (shown !== '') parts.push(`${chip.label.toLowerCase()} ${shown}`);
      continue;
    }
    if (filter[chip.key] === true) parts.push(chip.label.toLowerCase());
  }
  return parts.join(' · ');
}
