/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { subAgentCallersStore, subAgentStore } from '../src/core/subagents';
import { sessionStore } from '../src/core/sessions';
import { deviceBridge } from '../src/core/nativeBridge';
import type { SubAgentCaller, SubAgentEntry, ToolCallPayload } from '../src/core/protocol';
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
  subAgentCallersStore.reset();
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
    // The drawer's pinned Sub-Agents button is not a roster: only the header counter matches
    // the N sub-agents shape, and it must be absent.
    expect(labelsOf(tree).filter(label => /^\d+ sub-agent/.test(label))).toEqual([]);
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

describe('handing an answer back to a caller', () => {
  /** Opens the hand-back sheet on the sub-agent's own answer. */
  async function openHandoff(tree: Tree): Promise<void> {
    await pressLabel(tree, '1 sub-agent');
    await pressLabel(tree, 'Open sub-agent subagent/digger-a1b2, idle');
    await ReactTestRenderer.act(async () => {
      chatStore.seedHistory(handleFor('subagent/digger-a1b2'), [
        { id: 'h-a', role: 'assistant', text: 'the cause is the token cache', ts: '2026-01-01T10:00:02.000Z' },
      ]);
    });
    await waitFor(() => textsOf(tree).includes('the cause is the token cache'));
    await pressLabel(tree, 'Message actions');
    await pressLabel(tree, 'Hand back to…');
  }

  const caller = (over: Partial<SubAgentCaller> = {}): SubAgentCaller => ({
    sessionId: 'my-claw-app/thread/owner/main',
    threadId: THREAD,
    creator: true,
    firstAt: '2026-01-01T09:00:00.000Z',
    lastAt: '2026-01-01T10:00:00.000Z',
    runs: 2,
    title: 'Parent conversation',
    ...over,
  });

  it('asks the server who called the sub-agent, and says so while it waits', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await openHandoff(tree);

    const asked = bridge.sendMessage.mock.calls
      .map(([frame]) => String(frame))
      .find(frame => frame.includes('"subagents.callers"'));
    expect(asked).toBeDefined();
    const parsed = JSON.parse(asked!) as { threadId: string; parentThreadId: string };
    expect(parsed.threadId).toBe(handleFor('subagent/digger-a1b2'));
    expect(parsed.parentThreadId).toBe(THREAD);
    // A spinner would be a lie about a list that is simply not here yet.
    expect(textsOf(tree)).toContain('Looking up who called this sub-agent…');
    await settleAndUnmount(tree);
  });

  it('pre-picks the conversation walked in from, and hands the picked answer back to it', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await openHandoff(tree);
    await ReactTestRenderer.act(async () => {
      subAgentCallersStore.receive({
        type: 'subagents.callers.result',
        threadId: handleFor('subagent/digger-a1b2'),
        callers: [caller()],
      });
    });

    // Pre-picked, so the count is on the action before anything is tapped.
    await waitFor(() => textsOf(tree).some(t => t.includes('Send for action (1)')));
    await pressLabel(tree, 'Send for action (1)');

    const sent = bridge.sendMessage.mock.calls
      .map(([frame]) => String(frame))
      .find(frame => frame.includes('"subagents.handoff"'));
    expect(sent).toBeDefined();
    const handoff = JSON.parse(sent!) as { targets: string[]; mode: string; messageId: string; threadId: string };
    expect(handoff.targets).toEqual(['my-claw-app/thread/owner/main']);
    expect(handoff.mode).toBe('ask');
    // The id of the bubble the owner picked, which is the id the replay view minted for it.
    expect(handoff.messageId).toBe('h-a');
    await settleAndUnmount(tree);
  });

  it('takes several callers at once, and files them as a note when asked', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await openHandoff(tree);
    await ReactTestRenderer.act(async () => {
      subAgentCallersStore.receive({
        type: 'subagents.callers.result',
        threadId: handleFor('subagent/digger-a1b2'),
        callers: [
          caller(),
          caller({ sessionId: 'my-claw-app/thread/owner/side', threadId: 'side', creator: false, title: 'Side thread', runs: 1 }),
        ],
      });
    });
    await waitFor(() => textsOf(tree).includes('Side thread'));

    await pressLabel(tree, 'Side thread');
    await waitFor(() => textsOf(tree).some(t => t.includes('File as a note (2)')));
    await pressLabel(tree, 'File as a note (2)');

    const sent = bridge.sendMessage.mock.calls
      .map(([frame]) => String(frame))
      .find(frame => frame.includes('"subagents.handoff"'));
    const handoff = JSON.parse(sent!) as { targets: string[]; mode: string };
    expect(handoff.targets.sort()).toEqual(['my-claw-app/thread/owner/main', 'my-claw-app/thread/owner/side']);
    expect(handoff.mode).toBe('note');
    await settleAndUnmount(tree);
  });

  // Shown rather than dropped: "that conversation is gone" is the answer to why it cannot be
  // picked, and a silently shorter list is not.
  it('shows a caller whose conversation is gone as unavailable', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await openHandoff(tree);
    await ReactTestRenderer.act(async () => {
      subAgentCallersStore.receive({
        type: 'subagents.callers.result',
        threadId: handleFor('subagent/digger-a1b2'),
        callers: [caller({ sessionId: 'my-claw-app/thread/owner/dead', threadId: undefined, creator: false, title: 'Deleted one', unreachable: 'gone' })],
      });
    });

    await waitFor(() => textsOf(tree).includes('Deleted one'));
    expect(textsOf(tree)).toContain('conversation is gone');
    // Nothing selectable, so no target count on the action.
    expect(textsOf(tree)).toContain('Send for action');
    await settleAndUnmount(tree);
  });

  it('says so when the sub-agent is no longer reachable', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await openHandoff(tree);
    await ReactTestRenderer.act(async () => {
      subAgentCallersStore.refused(handleFor('subagent/digger-a1b2'));
    });

    await waitFor(() => textsOf(tree).includes('This sub-agent is no longer reachable from here'));
    await settleAndUnmount(tree);
  });
});

describe('the drawer Sub-Agents entry', () => {
  it('is one pinned button with the count, not an inline list', async () => {
    const tree = await seed([
      agent({ id: 'subagent/digger-a1b2' }),
      agent({ id: 'subagent/scribe-c3d4', type: 'writer' }),
      agent({ id: 'subagent/secret-e5f6', visibility: 'private' }),
    ]);
    await pressLabel(tree, 'Open conversations');
    await pressLabel(tree, 'More');

    const texts = textsOf(tree);
    expect(texts).toContain('Agents');
    expect(texts).toContain('shared workers');
    expect(labelsOf(tree)).toContain('Agents');
    // The list lives on a page, not inside the panel.
    expect(texts).not.toContain('digger-a1b2');
    expect(texts).not.toContain('secret-e5f6');
    await settleAndUnmount(tree);
  });

  it('opens a page listing the shared agents only, and a tap opens the chat', async () => {
    const tree = await seed([
      agent({ id: 'subagent/digger-a1b2' }),
      agent({ id: 'subagent/secret-e5f6', visibility: 'private' }),
    ]);
    await pressLabel(tree, 'Open conversations');
    await pressLabel(tree, 'More');
    await pressLabel(tree, 'Agents');

    // The page: globals listed, a conversation's private one absent.
    expect(textsOf(tree)).toContain('public and per-workspace');
    expect(textsOf(tree)).toContain('digger-a1b2');
    expect(textsOf(tree)).not.toContain('secret-e5f6');
    expect(labelsOf(tree)).toContain('Open sub-agent subagent/digger-a1b2, idle');

    await pressLabel(tree, 'Open sub-agent subagent/digger-a1b2, idle');
    expect(textsOf(tree)).toContain('digger-a1b2 · research');
    expect(labelsOf(tree).some(label => label.startsWith('Back to '))).toBe(true);
    await settleAndUnmount(tree);
  });

  it('sections the page by scope: public first, then one per workspace', async () => {
    const tree = await seed([
      agent({ id: 'subagent/shared-a1b2' }),
      agent({ id: 'subagent/builder-c3d4', visibility: 'workspace', workspaceKey: 'alpha' }),
      agent({ id: 'subagent/secret-e5f6', visibility: 'private' }),
    ]);
    await pressLabel(tree, 'Open conversations');
    await pressLabel(tree, 'More');
    await pressLabel(tree, 'Agents');

    const texts = textsOf(tree);
    expect(texts).toContain('public');
    expect(texts).toContain('workspace · alpha');
    expect(texts).toContain('shared-a1b2');
    expect(texts).toContain('builder-c3d4');
    // A private agent belongs to the conversation roster, not to this page.
    expect(texts).not.toContain('secret-e5f6');
    await settleAndUnmount(tree);
  });

  it('closes on the way back, and is not a level between a sub-agent and its parent', async () => {
    const tree = await seed([agent({ id: 'subagent/digger-a1b2' })]);
    await pressLabel(tree, 'Open conversations');
    await pressLabel(tree, 'More');
    await pressLabel(tree, 'Agents');
    await pressLabel(tree, 'Back to conversations');
    await waitFor(() => labelsOf(tree).includes('More'));
    expect(textsOf(tree)).not.toContain('shared across conversations');
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
    // Three cards, and none of them has to be unfolded: the door is in the head.
    expect(controlsLabelled(tree, 'Sub-agent ')).toHaveLength(3);

    // Exactly one door: not one per spawn card, and not one for the agent that is gone. The
    // id-carrying shape excludes the drawer's pinned Sub-Agents button.
    // The trailing space is the discriminator: the drawer's "Open sub-agents" has an s, the
    // door carries the id right after "sub-agent".
    expect(controlsLabelled(tree, 'Open sub-agent ')).toEqual(['Open sub-agent digger-a1b2, idle']);
    // The two others name themselves, but lead nowhere.
    expect(labelsOf(tree).some(label => label.startsWith('Open sub-agent ghost'))).toBe(false);
    expect(labelsOf(tree).some(label => label.startsWith('Open sub-agent peek'))).toBe(false);
    await settleAndUnmount(tree);
  });
});
