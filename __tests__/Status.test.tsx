/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { statusStore } from '../src/core/status';
import type { StatusPayload } from '../src/core/protocol';
import {
  labelsOf,
  press,
  renderApp,
  textsOf,
  unmount,
  waitFor,
  type Tree,
} from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-status';

const PAYLOAD: StatusPayload = {
  session: {
    id: 'my-claw-app/dm/dev/thread-status',
    createdAt: '2026-08-08T10:00:00.000Z',
    lastActiveAt: '2026-08-08T10:05:00.000Z',
    turns: 3,
  },
  model: {
    current: 'claude-opus-5',
    source: 'session',
    defaultModel: 'kimi-k26-turbo',
    effort: 'high',
    effortSource: 'config',
    selfHosted: false,
    contextLimit: 512000,
    contextNotes: ['declared', 'capped from 1,000,000'],
    timeout: '120s (default)',
  },
  context: {
    measured: { tokens: 12345, pctOfLimit: 2.4 },
    estimated: 60000,
    occupied: 70000,
    autoCompactOn: true,
    autoCompactThresholdPct: 80,
    autoCompactThresholdTokens: 409600,
  },
  usage: {
    total: { calls: 9, errors: 0, promptTokens: 1_300_000, cacheReadTokens: 200_000, completionTokens: 60_000, billedUsd: 2, referenceUsd: 5.3, unpriced: 0 },
    own: {
      calls: 4,
      errors: 0,
      promptTokens: 1_000_000,
      cacheReadTokens: 200_000,
      completionTokens: 50_000,
      billedUsd: 2,
      referenceUsd: 5,
      unpriced: 0,
      durationMs: 4000,
      rows: [
        { model: 'anthropic/claude-opus-5', provider: 'api.anthropic.com', calls: 3, errors: 0, promptTokens: 900_000, cacheReadTokens: 200_000, completionTokens: 40_000, costUsd: 5, costBilled: false, costApproximate: false },
        { model: 'fireworks/kimi-k2p6-turbo', provider: 'api.fireworks.ai', calls: 1, errors: 0, promptTokens: 100_000, cacheReadTokens: 0, completionTokens: 10_000, costUsd: 2, costBilled: true, costApproximate: false },
      ],
    },
    agents: [
      {
        sessionId: 'subagent/digger-a1b2',
        displayName: 'digger',
        type: 'research',
        depth: 1,
        alive: true,
        running: true,
        calls: 4,
        errors: 0,
        promptTokens: 250_000,
        cacheReadTokens: 0,
        completionTokens: 8_000,
        billedUsd: 0,
        referenceUsd: 0.25,
        unpriced: 0,
        rows: [{ model: 'anthropic/claude-opus-5', provider: 'api.anthropic.com', calls: 4, errors: 0, promptTokens: 250_000, cacheReadTokens: 0, completionTokens: 8_000, costUsd: 0.25, costBilled: false, costApproximate: false }],
      },
      {
        sessionId: 'subagent/coder-c3d4',
        displayName: 'coder',
        type: 'general',
        depth: 2,
        alive: true,
        running: false,
        calls: 1,
        errors: 0,
        promptTokens: 50_000,
        cacheReadTokens: 0,
        completionTokens: 2_000,
        billedUsd: 0,
        referenceUsd: 0.05,
        unpriced: 0,
        rows: [{ model: 'anthropic/claude-opus-5', provider: 'api.anthropic.com', calls: 1, errors: 0, promptTokens: 50_000, cacheReadTokens: 0, completionTokens: 2_000, costUsd: 0.05, costBilled: false, costApproximate: false }],
      },
    ],
  },
  runtime: { runs: [], compacting: false, verbose: true, approvedTools: ['bash'] },
};

/** One per-model line, as the server sends it. */
function rowFixture(
  model: string,
  provider?: string,
  costSource?: string,
): StatusPayload['usage'] extends null ? never : NonNullable<StatusPayload['usage']>['own']['rows'][number] {
  return {
    model,
    ...(provider ? { provider } : {}),
    ...(costSource ? { costSource } : {}),
    calls: 1,
    errors: 0,
    promptTokens: 1000,
    cacheReadTokens: 0,
    completionTokens: 100,
    costUsd: 1,
    costBilled: false,
    costApproximate: false,
  };
}

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

function summary(threadId: string, title: string) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
  };
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return press(tree, label);
}

/** Opens the drawer and the per-conversation menu (Rename / Status / Archive). */
async function openThreadMenu(tree: Tree): Promise<void> {
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).some(label => label.startsWith('Actions for conversation')));
  const label = labelsOf(tree).find(entry => entry.startsWith('Actions for conversation'))!;
  await pressLabel(tree, label);
}

beforeEach(() => {
  statusStore.reset();
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

/** The four actions a conversation carries, in the order both menus must show them. */
const CONVERSATION_ACTIONS = ['Rename…', 'Status', 'Archive', 'Delete'];

/** Labels appear once per rendered node, so the order is read from the first sighting of each. */
function actionOrder(tree: Tree): string[] {
  const seen: string[] = [];
  for (const label of labelsOf(tree)) {
    if (CONVERSATION_ACTIONS.includes(label) && !seen.includes(label)) seen.push(label);
  }
  return seen;
}

test('the drawer menu carries the conversation actions, status between rename and archive', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);

  expect(actionOrder(tree)).toEqual(CONVERSATION_ACTIONS);

  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'status.watch', threadId: THREAD })]),
  );

  await unmount(tree);
});

test('the header menu answers the same list, in the same order', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Conversation Infra maison');
  await pressLabel(tree, 'Commands');

  // The picker is the title bar's own button at this width, so the menu opens straight onto the
  // shared list (only the conversation on screen knows its own model, and that is what the button
  // is for). The narrow case is pinned in `__tests__/ModelButton.test.tsx`.
  expect(labelsOf(tree)).toContain('Change model');
  expect(labelsOf(tree)).not.toContain('Model…');
  expect(actionOrder(tree)).toEqual(CONVERSATION_ACTIONS);

  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'status.watch', threadId: THREAD })]),
  );

  await unmount(tree);
});

test('deleting from the drawer asks first, like the header always did', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Delete');

  // The first tap opens the confirmation, it does not delete.
  await waitFor(() => textsOf(tree).some(text => text.includes('Delete')));
  expect(sentFrames().some(frame => frame.type === 'session.delete')).toBe(false);

  await pressLabel(tree, 'Delete');
  await waitFor(() => sentFrames().some(frame => frame.type === 'session.delete'));

  await unmount(tree);
});

async function openReport(tree: Tree): Promise<void> {
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({ type: 'status.result', threadId: THREAD, status: PAYLOAD });
  await waitFor(() => textsOf(tree).some(text => text.includes('claude-opus-5')));
}

test('opening the page watches the thread on the server, and closing it unwatches', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  bridge.sendMessage.mockClear();
  await pressLabel(tree, 'Status');
  // The watch is the fetch: no status.get exists any more.
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'status.watch', threadId: THREAD }]));
  expect(sentFrames().some(frame => frame.type === 'status.get')).toBe(false);
  expect(textsOf(tree)).toContain('asking the server…');

  await pressLabel(tree, 'Close status');
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'status.unwatch' }]));
  await unmount(tree);
});

test('the status page leads with context and one total for everything the conversation caused', async () => {
  const tree = await renderApp();
  await openReport(tree);

  const texts = textsOf(tree).join('\n');
  expect(texts).toContain('claude-opus-5');
  expect(texts).toContain('context');
  // 70k occupied of a 512k window, and the auto-compact line that explains the meter.
  expect(texts).toContain('70k');
  expect(texts).toContain('/ 512k');
  expect(texts).toContain('13.7%');
  expect(texts).toContain('auto-compact at 80% · 410k');
  expect(texts).toContain('last call measured 12k');
  // The total is one figure: billed and reference added, own and sub-agents added.
  expect(texts).toContain('usage · total');
  expect(texts).toContain('$7.30');
  expect(texts).toContain('1.4M tokens · 1.3M in · 200k cached · 60k out · 9 calls');
  expect(texts).toContain('billed $2.00 · reference $5.30');
  // The page is live: it says so, and offers no refresh to press.
  expect(labelsOf(tree)).toContain('Live: the page follows the conversation');
  expect(labelsOf(tree)).not.toContain('Refresh status');
  // What was shown three times over is shown once: no grid of session counters, no 90-day card.
  expect(texts).not.toContain('tokens in');
  expect(texts).not.toContain('cost · 90 days');
  expect(texts).not.toContain('delegated');
  expect(texts).not.toContain('my-claw-app · dm');

  await unmount(tree);
});

test('the header gives the model its own line, and the tag its own under it', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: { ...PAYLOAD, model: { ...PAYLOAD.model, tag: 'Cheap', effort: 'high' } },
  });
  await waitFor(() => textsOf(tree).includes('tag Cheap \u00b7 effort high'));

  const page = textsOf(tree);
  expect(page).toContain('claude-opus-5');
  expect(page).toContain('tag Cheap · effort high');
  // The two share no node any more, which is the width they were fighting over when the phone cut
  // the model out of the line.
  expect(page.some(text => text.includes('claude-opus-5') && text.includes('tag Cheap'))).toBe(false);

  await unmount(tree);
});

test('the models the conversation ran on are on the page, not behind a fold', async () => {
  const tree = await renderApp();
  await openReport(tree);

  // The fold that used to hold them is gone, not merely closed: it asked for a tap to answer the
  // page's own question.
  expect(labelsOf(tree)).not.toContain('Usage of this conversation');
  const texts = textsOf(tree).join('\n');
  expect(texts).toContain('claude-opus-5');
  expect(texts).toContain('kimi-k2p6-turbo');
  expect(texts).toContain('4s of API time');
  // A reference price is marked as not a charge; a billed one is not.
  expect(texts).toContain('*$5.00');
  expect(texts).toContain('$2.00');
  expect(texts).toContain('* not a charge');

  await unmount(tree);
});

/**
 * Every string a node draws under it, joined. The two-line model row has to prove a negative --
 * that the numbers are not on the name's line -- and this is the only way to state it.
 */
function lineAround(tree: Tree, value: string): string {
  const node = tree.root.findAll(candidate => candidate.props.children === value)[0];
  if (!node) throw new Error(`nothing on the page reads ${value}`);
  let current = node.parent;
  while (current) {
    if (StyleSheet.flatten(current.props.style)?.flexDirection === 'row') {
      return current
        .findAll(child => typeof child.props.children === 'string', { deep: true })
        .map(child => child.props.children as string)
        .join(' ');
    }
    current = current.parent;
  }
  throw new Error(`${value} shares no row with anything`);
}

test('a model name gets its own line, not the tail of the numbers line', async () => {
  const tree = await renderApp();
  await openReport(tree);

  // What it shares its line with is the price, the one figure worth scanning for.
  const line = lineAround(tree, 'kimi-k2p6-turbo');
  expect(line).toContain('$2.00');
  // The calls and tokens that used to squeeze it onto a five-character budget moved under it.
  expect(line).not.toContain('100k');
  expect(line).not.toContain('cached');

  await unmount(tree);
});

// The model reference carries its endpoint pin, and the pin is a route: `fp8` is a quantization and
// `flex` a service tier. A name cut from the whole reference read them as models of their own.
test('a routed model is named by its model, and says which provider served it', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      ...PAYLOAD,
      usage: {
        ...PAYLOAD.usage!,
        own: {
          ...PAYLOAD.usage!.own,
          rows: [
            {
              model: 'z-ai/glm-5.2@streamlake/fp8',
              provider: 'streamlake',
              variant: 'fp8',
              calls: 889,
              errors: 0,
              promptTokens: 73_600_000,
              cacheReadTokens: 36_600_000,
              completionTokens: 3_000_000,
              costUsd: 5,
              costBilled: false,
              costApproximate: false,
            },
            // No pin: the route is the base OpenRouter picked from.
            {
              model: 'google/gemini-3.7-flash',
              provider: 'openrouter.ai',
              calls: 7,
              errors: 0,
              promptTokens: 459_000,
              cacheReadTokens: 439_000,
              completionTokens: 9_897,
              costBilled: false,
              costApproximate: false,
            },
          ],
        },
      },
    },
  });
  await waitFor(() => textsOf(tree).includes('glm-5.2'));

  const page = textsOf(tree);
  expect(page).toContain('glm-5.2');
  // The quantization is a route, not a model: it never stands alone as a name.
  expect(page).not.toContain('fp8');
  expect(page).toContain('gemini-3.7-flash');
  // Where the calls went leads the line under the name.
  expect(page.some(text => text.startsWith('streamlake · fp8 · 889×'))).toBe(true);
  expect(page.some(text => text.startsWith('openrouter.ai · 7×'))).toBe(true);

  await unmount(tree);
});

// A figure nothing could price and a figure guessed from the cross-market median look the same on
// a page that does not say which rung answered. The server had the trace all along.
test('a model line says which rung of the price ladder priced it', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      ...PAYLOAD,
      usage: {
        ...PAYLOAD.usage!,
        own: {
          ...PAYLOAD.usage!.own,
          rows: [
            { ...rowFixture('claude-opus-5', 'api.anthropic.com', 'engine anthropic'), calls: 3157 },
            { ...rowFixture('gpt-5.6-luna', 'chatgpt.com', 'median of 28'), calls: 12 },
          ],
        },
      },
    },
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('median of 28')));

  const page = textsOf(tree);
  expect(page.some(text => text.startsWith('api.anthropic.com · 3157×') && text.endsWith('engine anthropic'))).toBe(true);
  expect(page.some(text => text.endsWith('median of 28'))).toBe(true);

  await unmount(tree);
});

test('two providers of one model are two rows, told apart by the provider', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      ...PAYLOAD,
      usage: {
        ...PAYLOAD.usage!,
        own: {
          ...PAYLOAD.usage!.own,
          rows: [
            { ...rowFixture('claude-opus-5', 'api.anthropic.com'), calls: 3157 },
            { ...rowFixture('claude-opus-5', 'claude-sdk'), calls: 8436 },
          ],
        },
      },
    },
  });
  await waitFor(() => textsOf(tree).includes('claude-opus-5'));

  const page = textsOf(tree);
  // Two rows, one model id, and the provider is the only thing that tells them apart.
  expect(page.some(text => text.startsWith('api.anthropic.com · 3157×'))).toBe(true);
  expect(page.some(text => text.startsWith('claude-sdk · 8436×'))).toBe(true);

  await unmount(tree);
});

test('two accounts on one route are two rows, told apart by the name the owner gave each', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      ...PAYLOAD,
      usage: {
        ...PAYLOAD.usage!,
        own: {
          ...PAYLOAD.usage!.own,
          rows: [
            { ...rowFixture('claude-opus-5', 'api.anthropic.com'), providerKey: 'anthropic', providerLabel: 'Claude perso', calls: 3 },
            { ...rowFixture('claude-opus-5', 'api.anthropic.com'), providerKey: 'claude-api', providerLabel: 'Claude API', calls: 2 },
          ],
        },
      },
    },
  });
  await waitFor(() => textsOf(tree).includes('claude-opus-5'));
  const page = textsOf(tree);
  expect(page.some(text => text.startsWith('Claude perso · api.anthropic.com · 3×'))).toBe(true);
  expect(page.some(text => text.startsWith('Claude API · api.anthropic.com · 2×'))).toBe(true);
  await unmount(tree);
});

test('details name the current model, where it is picked from, and the effort with its rung', async () => {
  const tree = await renderApp();
  await openReport(tree);
  await pressLabel(tree, 'details');

  const page = textsOf(tree);
  expect(page).toContain('current model');
  expect(page).toContain('claude-opus-5');
  // Reading the model without its source is how a chat inherited a pin and still showed the
  // global default.
  expect(page).toContain('picked by');
  expect(page).toContain('this conversation');
  // What it is pinned away from, and the one line saying that is the fallback.
  expect(page).toContain('default model');
  expect(page).toContain('kimi-k26-turbo');
  expect(page.some(text => text.startsWith('The default is the fallback'))).toBe(true);
  expect(page).toContain('current effort');
  expect(page).toContain('high · the global default');

  await unmount(tree);
});

test('the sub-agents are recapped as one figure, their cards one tap below', async () => {
  const tree = await renderApp();
  await openReport(tree);

  // No per-agent row before it is asked for; the recap is what the delegation cost.
  expect(labelsOf(tree)).not.toContain('Usage of digger');
  expect(labelsOf(tree)).not.toContain('Usage of coder');
  const texts = textsOf(tree).join('\n');
  expect(texts).toContain('2 sub-agents');
  // digger's 4 calls and coder's 1, and their two reference prices, added rather than listed.
  expect(texts).toContain('5× · 300k in · 10k out');
  expect(texts).toContain('$0.30');

  await pressLabel(tree, 'By sub-agent');
  const opened = labelsOf(tree);
  expect(opened).toContain('Usage of digger');
  expect(opened).toContain('Usage of coder');
  expect(opened).toContain('digger is running');
  expect(opened).not.toContain('coder is running');
  expect(textsOf(tree).join('\n')).toContain('research');

  await unmount(tree);
});

test('a sub-agent whose session is gone is still a row, named by its id and marked gone', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      ...PAYLOAD,
      usage: {
        ...PAYLOAD.usage!,
        agents: [{ ...PAYLOAD.usage!.agents[0], sessionId: 'subagent/run-9f9f', displayName: 'run-9f9f', type: undefined, alive: false, running: false }],
      },
    },
  });
  await pressLabel(tree, 'By sub-agent');
  await waitFor(() => labelsOf(tree).includes('Usage of run-9f9f'));
  expect(textsOf(tree)).toContain('gone');
  await unmount(tree);
});

test('a conversation older than the analytics say where the figures start', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: { ...PAYLOAD, usage: { ...PAYLOAD.usage!, since: '2026-05-10T10:00:00.000Z' } },
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('since 2026-05-10 (90 days)')));
  await unmount(tree);
});

test('a conversation is a thread here, so no counter is labelled "since /new"', async () => {
  const tree = await renderApp();
  await openReport(tree);

  expect(textsOf(tree).join('\n')).not.toContain('/new');

  await unmount(tree);
});

test('the ids and the tuning stay folded until asked for, and the raw text is gone', async () => {
  const tree = await renderApp();
  await openReport(tree);

  expect(textsOf(tree).join('\n')).not.toContain('my-claw-app/dm/dev/thread-status');
  expect(labelsOf(tree)).not.toContain('raw output');
  expect(labelsOf(tree)).toContain('details');

  await pressLabel(tree, 'details');
  const opened = textsOf(tree).join('\n');
  expect(opened).toContain('my-claw-app/dm/dev/thread-status');
  expect(opened).toContain('512k · declared, capped from 1,000,000');
  expect(opened).toContain('60k · chars/4, under-counts');
  expect(opened).toContain('120s (default)');
  expect(opened).toContain('bash');
  expect(opened).toContain('3');

  await unmount(tree);
});

test('a run in flight is called out above the cards, its tree and a compaction with it', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      ...PAYLOAD,
      runtime: {
        ...PAYLOAD.runtime,
        compacting: true,
        runs: [
          // One line per node, each with the model it is calling: a run that walked its route is on
          // another account than the one it started on, and this is where that is visible.
          { label: 'digger', depth: 1, startedAt: '2026-08-08T10:05:00.000Z', model: 'gpt-6.1-sol' },
          { label: 'main', depth: 0, startedAt: '2026-08-08T10:04:00.000Z', model: 'claude-2/claude-fable-5-2' },
        ],
      },
    },
  });

  await waitFor(() => {
    const text = textsOf(tree).join('\n');
    return text.includes('main') && text.includes('claude-2/claude-fable-5-2') && text.includes('digger') && text.includes('gpt-6.1-sol') && text.includes('compacting');
  });

  await unmount(tree);
});

test('a typed /status answers with the page, never a bubble in the conversation, and the page watches the thread', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).some(label => label.startsWith('Open conversation')));
  bridge.sendMessage.mockClear();
  await emit({
    type: 'chat.command.result',
    threadId: THREAD,
    text: 'Status: claude-opus-5 · context 13.7%',
    status: PAYLOAD,
  });

  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(chatStore.getItems(THREAD).length).toBe(0);
  expect(textsOf(tree).join('\n')).toContain('$7.30');
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'status.watch', threadId: THREAD }]));

  await unmount(tree);
});

test('a command result without a status payload still renders as a bubble', async () => {
  const tree = await renderApp();
  await emit({
    type: 'chat.command.result',
    threadId: THREAD,
    replyToId: 'r1',
    text: 'Stopped.',
  });

  await waitFor(() => chatStore.getItems(THREAD).length > 0);
  expect(chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.command)).toBe(true);
  expect(labelsOf(tree)).not.toContain('Close status');

  await unmount(tree);
});

test('the back key closes the status page and stops there', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));

  // The Android layer calls the last registered handler and stops when it returns true.
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;

  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Close status'));
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'status.unwatch' }]));
  expect(back.default.exitApp).not.toHaveBeenCalled();
  await unmount(tree);
});

test('a refused status.watch shows on the page instead of spinning', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({ type: 'error', scope: 'status', message: 'status unavailable' });

  await waitFor(() => textsOf(tree).includes('status unavailable'));

  await unmount(tree);
});

test('a late status.result does not reopen a closed page', async () => {
  const tree = await renderApp();
  await emit({ type: 'status.result', threadId: THREAD, status: PAYLOAD });

  expect(labelsOf(tree)).not.toContain('Close status');
  expect(statusStore.getSnapshot().payload).toBeNull();

  await unmount(tree);
});

test('the page follows the conversation: every report the server pushes replaces the one on screen, and the page never asks', async () => {
  const tree = await renderApp();
  await openReport(tree);
  bridge.sendMessage.mockClear();

  // The server pushes as the run goes: a call recorded, the context grown.
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: { ...PAYLOAD, context: { ...PAYLOAD.context, occupied: 72_000 } },
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('72k')));
  expect(textsOf(tree).join('\n')).not.toContain('70k');

  // The readings the header lives on move nothing here any more: no status.get, no re-ask.
  await emit({
    type: 'model.result',
    threadId: THREAD,
    model: 'claude-opus-5',
    defaultModel: 'claude-opus-5',
    effort: { level: '', levels: [], supported: false },
    context: { raw: 1_000_000, effective: 512_000, used: 73_000 },
  });
  await emit({ type: 'chat.run.end', threadId: THREAD, reason: 'done' });
  expect(sentFrames().filter(frame => String(frame.type).startsWith('status.'))).toEqual([]);

  // A report for another conversation is not this page's business.
  await emit({
    type: 'status.result',
    threadId: 'elsewhere',
    status: { ...PAYLOAD, context: { ...PAYLOAD.context, occupied: 1 } },
  });
  expect(textsOf(tree).join('\n')).toContain('72k');

  await unmount(tree);
});

test('a new socket watches the page still open: the watch belongs to the socket that died', async () => {
  const tree = await renderApp();
  await openReport(tree);
  bridge.sendMessage.mockClear();

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state: 'disconnected', reason: 'network' });
  });
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:state', { state: 'connected' });
  });
  await waitFor(() => sentFrames().some(frame => frame.type === 'status.watch'));
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'status.watch', threadId: THREAD }]));

  await unmount(tree);
});
