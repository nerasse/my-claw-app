/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { subAgentStore } from '../src/core/subagents';
import { sessionStore } from '../src/core/sessions';
import { deviceBridge } from '../src/core/nativeBridge';
import type { SubAgentEntry, ToolCallPayload } from '../src/core/protocol';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-subagents';

/** The server issues `sub-` + 16 hex; a fixture that is not shaped like one proves nothing. */
function handleFor(id: string): string {
  let hex = '';
  for (const char of id) {
    hex += char.charCodeAt(0).toString(16);
  }
  return `sub-${hex.slice(0, 16).padEnd(16, '0')}`;
}

const agent = (over: Partial<SubAgentEntry> & { id: string }): SubAgentEntry => ({
  threadId: handleFor(over.id),
  displayName: over.id.replace(/^subagent\//, '').replace(/-[0-9a-f]{4}$/, ''),
  type: 'research',
  messageCount: 4,
  status: 'idle',
  visibility: 'global',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const spawnCard = (over: Partial<ToolCallPayload> & { id: string }): ToolCallPayload => ({
  name: 'spawn',
  args: { mode: 'session', type: 'research', name: 'digger' },
  ok: true,
  output: 'spawned',
  truncated: false,
  durationMs: 4200,
  ...over,
});

beforeEach(() => {
  chatStore.clearAll();
  subAgentStore.reset();
  // The bridge mock outlives a test: without this, a frame sent by an earlier one is still in
  // the log and the next assertion reads it instead of its own.
  bridge.sendMessage.mockClear();
  bridge.prefsSet.mockClear();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

async function seed(agents: SubAgentEntry[], cards: ToolCallPayload[] = []): Promise<Tree> {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, [
      { id: 'h-0', role: 'user', text: 'delegate this', ts: '2026-01-01T10:00:00.000Z' },
    ]);
    for (const card of cards) chatStore.addToolCall(THREAD, card);
    subAgentStore.receive({ type: 'subagents.list.result', threadId: THREAD, agents });
  });
  return tree;
}

/** Drains the list's own scroll timer before unmounting, or it fires into a torn-down env. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

/**
 * Host nodes only. A Pressable appears twice in the tree (composite and its view), so counting
 * accessibility labels would double every control -- and deduping them would hide a duplicate
 * that is really there.
 */
function controlsLabelled(tree: Tree, prefix: string): string[] {
  return tree.root
    .findAll(
      node =>
        typeof node.type === 'string' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith(prefix),
      { deep: true },
    )
    .map(node => node.props.accessibilityLabel as string);
}

async function pressLabel(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const target = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  )[0];
  if (!target) throw new Error(`no pressable labelled ${label}`);
  await ReactTestRenderer.act(async () => target.props.onPress());
}

describe('the header counter', () => {
  it('is absent when the conversation has no sub-agent', async () => {
    const tree = await seed([]);
    expect(labelsOf(tree).filter(label => label.includes('sub-agent'))).toEqual([]);
    await settleAndUnmount(tree);
  });

  it('counts the roster and says how many are running', async () => {
    const tree = await seed([
      agent({ id: 'subagent/digger-a1b2' }),
      agent({ id: 'subagent/writer-c3d4', status: 'running', type: 'writer' }),
    ]);
    await waitFor(() => labelsOf(tree).some(label => label.startsWith('2 sub-agents')));
    expect(labelsOf(tree)).toContain('2 sub-agents, 1 running');
    await settleAndUnmount(tree);
  });

  it('counts one-shots kept by the server, since they are listed like any other sub-agent', async () => {
    const tree = await seed([agent({ id: 'subagent/run-7d21a04c', visibility: 'private' })]);
    await waitFor(() => labelsOf(tree).some(label => label.startsWith('1 sub-agent')));
    expect(labelsOf(tree)).toContain('1 sub-agent');
    await settleAndUnmount(tree);
  });
});

describe('the roster', () => {
  it('opens from the counter, groups by category and type, and names the way back', async () => {
    const tree = await seed([
      agent({ id: 'subagent/digger-a1b2' }),
      agent({ id: 'subagent/scribe-c3d4', type: 'writer' }),
      agent({ id: 'subagent/run-7d21a04c', visibility: 'private' }),
    ]);
    // Two named plus the kept one-shot.
    await pressLabel(tree, '3 sub-agents');

    const texts = textsOf(tree);
    expect(texts).toContain('named');
    expect(texts).toContain('temporary');
    expect(texts).toContain('research');
    expect(texts).toContain('writer');
    expect(texts).toContain('digger-a1b2');
    // The one-shot is openable, exactly like a named one.
    expect(labelsOf(tree)).toContain('Open sub-agent subagent/run-7d21a04c, idle');
    expect(labelsOf(tree).some(label => label.startsWith('Open sub-agent'))).toBe(true);
    await settleAndUnmount(tree);
  });

  it('opens a kept one-shot as a chat, naming the parent on the way back', async () => {
    const tree = await seed([agent({ id: 'subagent/run-7d21a04c', visibility: 'private' })]);
    await pressLabel(tree, '1 sub-agent');
    await pressLabel(tree, 'Open sub-agent subagent/run-7d21a04c, idle');
    expect(textsOf(tree)).toContain('run-7d21a04c · research');
    expect(labelsOf(tree).some(label => label.startsWith('Back to '))).toBe(true);
    await settleAndUnmount(tree);
  });

  it('says so when the server does not know about sub-agents at all', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await pressLabel(tree, '1 sub-agent');
    await ReactTestRenderer.act(async () => {
      subAgentStore.receive({ type: 'subagents.list.result', threadId: THREAD, agents: [] });
      subAgentStore.markUnsupported();
    });
    // A ready-but-empty roster and a server that cannot answer are different sentences.
    expect(textsOf(tree)).toContain('no sub-agent yet · the agent creates them when it delegates');
    await settleAndUnmount(tree);
  });
});

describe('inside a sub-agent', () => {
  async function enter(tree: Tree): Promise<void> {
    await pressLabel(tree, '1 sub-agent');
    await pressLabel(tree, 'Open sub-agent subagent/digger-a1b2, idle');
  }

  it('the header names the parent conversation, not just "back"', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await enter(tree);
    // The parent has no server title yet, so the fallback shows; what matters is that the row
    // announces a return to a conversation rather than an anonymous back arrow.
    expect(labelsOf(tree).some(label => label.startsWith('Back to '))).toBe(true);
    expect(textsOf(tree)).toContain('digger-a1b2 · research');
    await settleAndUnmount(tree);
  });

  it('backs out to the parent, and the roster is not a level in between', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await enter(tree);
    const back = labelsOf(tree).find(label => label.startsWith('Back to '))!;
    await pressLabel(tree, back);
    // Back at the conversation: its counter is on screen again and the sub-agent header is gone.
    await waitFor(() => labelsOf(tree).includes('1 sub-agent'));
    expect(textsOf(tree)).not.toContain('digger-a1b2 · research');
    await settleAndUnmount(tree);
  });
});

describe('handing an answer to the parent', () => {
  it('sends it into the parent conversation, quoted, and lands back there', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await pressLabel(tree, '1 sub-agent');
    await pressLabel(tree, 'Open sub-agent subagent/digger-a1b2, idle');

    await ReactTestRenderer.act(async () => {
      chatStore.seedHistory(handleFor('subagent/digger-a1b2'), [
        { id: 'h-a', role: 'assistant', text: 'the cause is the token cache', ts: '2026-01-01T10:00:02.000Z' },
      ]);
    });
    await waitFor(() => textsOf(tree).includes('the cause is the token cache'));

    await pressLabel(tree, 'Message actions');

    const hand = labelsOf(tree).find(label => label.startsWith('Hand to '));
    expect(hand).toBeDefined();
    await pressLabel(tree, hand!);

    // It is a plain send on the parent thread, quoted with the sub-agent it came from: the server
    // needs no frame of its own for this.
    const sent = bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
    const quoted = sent.find(frame => frame.includes('[digger-a1b2] the cause is the token cache'));
    expect(quoted).toBeDefined();
    const parsed = JSON.parse(quoted!) as { type: string; threadId: string };
    expect(parsed.type).toBe('chat.send');
    expect(parsed.threadId).toBe(THREAD);
    await settleAndUnmount(tree);
  });
});

describe('the drawer lists the shared agents', () => {
  it('shows globals only, above the footer, and opens one as a chat', async () => {
    const tree = await seed([
      agent({ id: 'subagent/digger-a1b2' }),
      agent({ id: 'subagent/secret-c3d4', visibility: 'private' }),
      agent({ id: 'subagent/run-7d21a04c', visibility: 'private' }),
    ]);
    await pressLabel(tree, 'Open conversations');

    const texts = textsOf(tree);
    expect(texts).toContain('agents · 1');
    expect(texts).toContain('digger-a1b2');
    // A conversation's private agents are not shared: they stay in its roster.
    expect(texts).not.toContain('secret-c3d4');
    expect(texts).not.toContain('run-7d21a04c');
    // The section sits above Archived in the same panel.
    expect(labelsOf(tree)).toContain('Open shared sub-agent subagent/digger-a1b2, idle');

    await pressLabel(tree, 'Open shared sub-agent subagent/digger-a1b2, idle');
    expect(textsOf(tree)).toContain('digger-a1b2 · research');
    expect(labelsOf(tree).some(label => label.startsWith('Back to '))).toBe(true);
    await settleAndUnmount(tree);
  });

  it('shows no section when there is no shared agent', async () => {
    const tree = await seed([agent({ id: 'subagent/secret-c3d4', visibility: 'private' })]);
    await pressLabel(tree, 'Open conversations');
    expect(textsOf(tree).filter(text => text.startsWith('agents ·'))).toEqual([]);
    expect(textsOf(tree)).not.toContain('secret-c3d4');
    await settleAndUnmount(tree);
  });
});

describe('a sub-agent is not a conversation', () => {
  it('writing in one does not list it in the drawer, and does not become the thread reopened at boot', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await pressLabel(tree, '1 sub-agent');
    await pressLabel(tree, 'Open sub-agent subagent/digger-a1b2, idle');

    const composer = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Message to send' && typeof node.props.onChangeText === 'function',
      { deep: true },
    )[0]!;
    await ReactTestRenderer.act(async () => composer.props.onChangeText('how far are you?'));
    await pressLabel(tree, 'Send message');

    // Reached from the drawer it would open as a plain chat: no parent to return to, and a send
    // with no parentThreadId, which a private sub-agent refuses.
    expect(sessionStore.getActiveSnapshot().map(entry => entry.threadId)).not.toContain(handleFor('subagent/digger-a1b2'));
    // And the app must not reopen inside it.
    const stored = bridge.prefsSet.mock.calls.filter(([key]) => key === 'lastThreadId').map(([, value]) => value);
    expect(stored).not.toContain(handleFor('subagent/digger-a1b2'));

    // The message itself did go out, with the parent declared.
    const sent = bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
    const chat = sent.map(f => JSON.parse(f) as { type: string }).find(f => f.type === 'chat.send');
    expect(chat).toMatchObject({ threadId: handleFor('subagent/digger-a1b2'), parentThreadId: THREAD });
    await settleAndUnmount(tree);
  });
});

describe('the door on a spawn card', () => {
  it('is offered only for a named sub-agent the roster still lists', async () => {
    const tree = await seed(
      [agent({ id: 'subagent/digger-a1b2' })],
      [
        spawnCard({ id: 'tc-session' }),
        // A one-shot has no session left to open.
        spawnCard({ id: 'tc-run', args: { mode: 'run', type: 'research', name: 'peek' } }),
        // A named one whose agent was killed since: the card outlives it.
        spawnCard({ id: 'tc-gone', args: { mode: 'session', type: 'research', name: 'ghost' } }),
      ],
    );
    // Expand each card: the door lives in the body, so the collapsed transcript is unchanged.
    const cards = tree.root.findAll(
      node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Tool spawn') && typeof node.props.onPress === 'function',
      { deep: true },
    );
    expect(cards).toHaveLength(3);
    await ReactTestRenderer.act(async () => {
      for (const card of cards) card.props.onPress();
    });

    // Exactly one door: not one per spawn card, and not one for the agent that is gone.
    expect(controlsLabelled(tree, 'Open sub-agent')).toEqual(['Open sub-agent digger-a1b2, idle']);
    expect(labelsOf(tree).some(label => label.includes('ghost'))).toBe(false);
    expect(labelsOf(tree).some(label => label.includes('peek'))).toBe(false);
    await settleAndUnmount(tree);
  });
});
