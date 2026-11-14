/**
 * A conversation written as a script, and read back as the rows a reader gets.
 *
 * Every UI regression the owner has reported on this screen was an ordering or a grouping that
 * changed between three views of the same conversation: the live stream, a reload that lands
 * mid-run, and a reload after the run finished. Each one is invisible in a single stage, which is
 * why they keep coming back -- the live path is one writer, the history path is another, and only
 * a test that walks the same story through all three says they agree.
 *
 * So the vocabulary lives here, once, instead of being re-built inside each suite:
 *
 * ```ts
 * const stage = visible([ask('u1', 'read it'), call('t1', 'bash', { run: run('r1') }), ...]);
 * expect(stage).toEqual(['user: read it', 'tool: bash']);
 * ```
 *
 * `visible` is the real pipeline -- `buildRows` → `pinnedSends` → `withDaySeparators` -- so a
 * change to the law is a change here, not a change to the test's own copy of it.
 */

import type { ChatItem, RunInfo, RunSummaryItem, TextItem, ToolItem } from '../src/core/chat';
import { buildRows, compactionRuleBefore, pinnedSends, withDaySeparators } from '../src/core/runRows';

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);

/** A message the owner sent. */
export function ask(id: string, text: string, extra: Partial<TextItem> = {}): TextItem {
  return {
    kind: 'text',
    id,
    role: 'user',
    text,
    attachments: [],
    streaming: false,
    ts: T0,
    ...extra,
  };
}

/** A turn the agent wrote, streaming or settled. */
export function answer(id: string, text: string, extra: Partial<TextItem> = {}): TextItem {
  return {
    kind: 'text',
    id,
    role: 'agent',
    text,
    attachments: [],
    streaming: false,
    ts: T0 + 1000,
    ...extra,
  };
}

/** A turn that thought before answering, or between two calls. */
export function thought(id: string, reasoning: string, extra: Partial<TextItem> = {}): TextItem {
  return answer(id, '', { reasoning, reasoningTokens: 420, ...extra });
}

/** A tool call, settled by default. */
export function call(
  id: string,
  name: string,
  extra: Partial<ToolItem> & { run?: RunInfo } = {},
): ToolItem {
  return {
    kind: 'tool',
    id,
    name,
    args: {},
    durationMs: 12,
    ok: true,
    output: 'ok',
    truncated: false,
    ts: T0 + 2000,
    ...extra,
  } as ToolItem;
}

/** One run. `done` by default, because a finished run is the one that folds. */
export function run(id: string, extra: Partial<RunInfo> = {}): RunInfo {
  return { id, status: 'done', startTs: T0, endTs: T0 + 60_000, ...extra };
}

/** What the server sends in place of a finished run's work -- docs/run-hydration.md. */
export function folded(
  id: string,
  extra: Partial<RunSummaryItem> & { run?: RunInfo } = {},
): RunSummaryItem {
  return {
    kind: 'run',
    id,
    run: run(id),
    toolCount: 1,
    firstTool: 'bash',
    itemCount: 1,
    lastId: `${id}-last`,
    hydration: 'idle',
    ts: T0 + 2000,
    ...extra,
  };
}

/** The screen labels of one row: what the reader sees, without the drawing. */
function labelOf(row: ReturnType<typeof buildRows>[number]): string {
  switch (row.kind) {
    case 'day':
      return 'day';
    case 'rule':
      return 'rule';
    case 'foot':
      return `foot:${row.run.status}`;
    case 'group':
      return `group:${row.items.length}`;
    case 'folded':
      return `folded:${row.summaries.reduce((total, summary) => total + summary.itemCount, 0)}`;
    case 'item': {
      const item = row.item;
      if (item.kind === 'run') return `folded:${item.itemCount}`;
      if (item.kind === 'tool') return `tool:${item.name}`;
      const owner = item.role === 'user';
      const thinking = item.reasoning ? ' (thinking)' : '';
      const streaming = item.streaming ? ' …' : '';
      const words = item.text.length > 0 ? item.text : '(no words)';
      return `${owner ? 'user' : 'agent'}: ${words}${thinking}${streaming}`;
    }
  }
}

/**
 * The rows a reader gets, in reading order (oldest first), as short labels.
 *
 * The list reverses them on a phone, and the web does not; that is a property of the list, not of
 * the law below, and it is covered by `core/threadScroll` and the app-level suites.
 */
export function visible(items: ChatItem[]): string[] {
  const rows = withDaySeparators(pinnedSends(buildRows(items, compactionRuleBefore(items))));
  return rows.map(labelOf);
}
