import {
  encodeInstructionsList,
  encodeMcpList,
  encodeServicesGet,
  encodeSkillsList,
  encodeToolsList,
  encodeWorkspacesList,
} from '../core/protocol';

/**
 * Every page the settings stack can show. The shell holds it as state and the back cascade walks
 * it one level at a time, so both need the same names: this is where they are written down.
 */
export type SettingsPage =
  | 'index'
  | 'appearance'
  | 'notifications'
  | 'updates'
  | 'models'
  | 'agents'
  | 'agent'
  | 'provider'
  | 'provider-add'
  | 'provider-edit'
  | 'provider-env'
  | 'account'
  | 'model-edit'
  | 'tags'
  | 'skills'
  | 'devices'
  | 'nodes'
  | 'servers'
  | 'services'
  | 'setup'
  | 'approvals'
  | 'workspaces'
  | 'workspace'
  | 'instruction'
  | 'instruction-layer'
  | 'tools'
  | 'mcps'
  | 'advanced'
  | 'diagnostics'
  | 'scope'
  | 'workspace-picker'
  | 'number'
  | 'file'
  | 'newagent'
  | 'config'
  | 'model-picker'
  | 'tag-editor';

/**
 * Where Back goes from a page whose parent never changes: one table, read by the pages' own Back
 * and by the back cascade, so the two cannot disagree. The pages reached from more than one place
 * (the picker, a workspace, an instruction, the setup) are decided by the cascade.
 */
export const PARENT: Partial<Record<SettingsPage, SettingsPage>> = {
  appearance: 'index',
  notifications: 'index',
  updates: 'index',
  models: 'index',
  agents: 'index',
  services: 'index',
  workspaces: 'index',
  skills: 'index',
  tools: 'index',
  devices: 'index',
  nodes: 'index',
  servers: 'index',
  approvals: 'tools',
  advanced: 'index',
  mcps: 'tools',
  diagnostics: 'advanced',
  config: 'advanced',
  tags: 'models',
  'provider-add': 'models',
  account: 'models',
  agent: 'agents',
  newagent: 'agents',
};

export function parentOf(page: SettingsPage): SettingsPage {
  return PARENT[page] ?? 'index';
}

/**
 * The pages that call a configured name "removed" when it is missing from the skills or MCP
 * catalog. Naming them once is the point: an unfetched catalog is not evidence that a name is
 * gone, so a page that paints that verdict red has to be a page that asks for the list.
 */
export const CATALOG_JUDGING_PAGES: readonly string[] = ['agents', 'agent', 'file', 'scope'];

export function judgesCatalogNames(page: string): boolean {
  return CATALOG_JUDGING_PAGES.includes(page);
}

/**
 * The pages fed by `agents.config.result`: the agents stack, the provider stack, and the index,
 * whose rows carry live counts from the same snapshot. Naming them once is the point -- the
 * request used to live on the Agents page alone, so reaching Providers straight from the index
 * (its own category since it left the Agents page) showed an empty list and a count of zero.
 */
export const AGENTS_CONFIG_PAGES: readonly string[] = [
  'index',
  // The assistant: its model step opens the providers form or the picker, by the provider count.
  'setup',
  'agents',
  'agent',
  // The models page opens on the defaults, from the same snapshot.
  'models',
  'provider',
  'provider-add',
  'provider-edit',
  'provider-env',
];

export function readsAgentsConfig(page: string): boolean {
  return AGENTS_CONFIG_PAGES.includes(page);
}

/**
 * The pages fed by `instructions.list.result`. The workspaces list needs it for the per-row
 * prompt summary, the workspace page for its file rows, and the layer screen for the ladder it
 * resolves against -- a page that shows the listing without asking for it shows an empty one,
 * which is how Providers ended up reading "0 providers" when it was reached from the index.
 */
export const READS_INSTRUCTIONS_PAGES: ReadonlySet<string> = new Set(['workspaces', 'workspace', 'instruction-layer']);

/**
 * The catalogs a settings page asks for on entry, walked in order by a single effect. Only the
 * pure "this page is open, so ask for its list" pulls live here: a page that also seeds a store,
 * arms an unsupported timer or reads more than the page name keeps its own effect. The row order
 * is the order the frames leave in, and the matchers are the page sets themselves so a page added
 * to one of them is served without touching this table.
 */
export const PAGE_REQUESTS: ReadonlyArray<{
  match: (page: string) => boolean;
  requests: ReadonlyArray<() => string>;
}> = [
  // The skill catalog and the workspace list are asked for when their pages open: they are the
  // only surfaces that show them, and a stale list from another day would name skills or paths
  // that moved or disappeared.
  { match: page => page === 'skills', requests: [encodeSkillsList, encodeWorkspacesList] },
  // The index shows the skills/tools counts on its rows: asking for the catalogs when it opens
  // is what makes those numbers real without a first visit to either page. The pages still
  // refresh their own list on entry, so a hot-reload or an edit made elsewhere lands on the
  // next visit.
  // The setup banner counts the steps: the services and the profile file are two of them.
  { match: page => page === 'index', requests: [encodeSkillsList, encodeToolsList, encodeServicesGet, encodeInstructionsList] },
  // The workspaces list owns the CRUD: asked for on every visit, like the other lists, because
  // config.workspaces hot-reloads under it. The list also carries the per-row prompt summary,
  // which is the instruction listing, so it asks for both -- see the instructions effect below.
  { match: page => page === 'workspaces', requests: [encodeWorkspacesList] },
  // Same for the tools page: it is the only surface that shows the catalog, and plugins and
  // disabled tools change under hot-reload, so a list from earlier can already be wrong.
  { match: page => page === 'tools', requests: [encodeToolsList] },
  // The MCP list is the wire version of /mcp: asked for on the MCPs page, and on every page that
  // judges names against it.
  { match: page => page === 'mcps' || judgesCatalogNames(page), requests: [encodeMcpList] },
  // Same catalog, same rule, for the skills: the pages that call a name "removed" need the list
  // that decides it. The two used to be fetched by effects with different page sets, which is how
  // the file editor ended up checking MCP names it had against skill names it did not.
  { match: judgesCatalogNames, requests: [encodeSkillsList] },
];
