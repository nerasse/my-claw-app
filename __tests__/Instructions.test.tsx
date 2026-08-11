/**
 * @format
 *
 * The Instructions page edits the markdown that builds the system prompt. Two behaviours carry
 * the whole design and are tested here: a file a workspace does not carry is shown as inherited
 * rather than missing, and a save that would overwrite someone else's write is refused with a
 * conflict the editor has to resolve -- the agent writes AGENTS.md too.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { instructionsStore } from '../src/core/instructions';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-instructions';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
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
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

function typeInto(tree: Tree, label: string, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const input = tree.root.find(
      node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function',
    );
    input.props.onChangeText(text);
  });
}

async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

function listFrame(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'instructions.list.result',
    entries: [
      { workspace: 'default', file: 'CORE.md', origin: 'own', from: 'default', bytes: 2048, sha: 'core111111aa' },
      { workspace: 'default', file: 'AGENTS.md', origin: 'own', from: 'default', bytes: 1024, sha: 'agents1111aa' },
      { workspace: 'sofa', file: 'AGENTS.md', origin: 'inherited', from: 'default', bytes: 1024, sha: 'agents1111aa' },
    ],
    nested: [{ workspace: 'default', path: 'svc/AGENTS.md', bytes: 400 }],
    files: ['CORE.md', 'SOUL.md', 'AGENTS.md', 'USER.md'],
    maxBytes: 262144,
    ...over,
  };
}

async function boot(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open instructions');
  await emit(listFrame());
  await waitFor(() => labelsOf(tree).includes('Edit AGENTS.md of sofa'));
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  // The store outlives a screen, so a page left in `ready` by the previous test would keep
  // markUnsupported() from ever applying.
  instructionsStore.reset();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('the page groups the files by workspace and asks the server for them', async () => {
  const tree = await boot();
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'instructions.list' })]),
  );
  expect(labelsOf(tree)).toEqual(
    expect.arrayContaining(['Edit CORE.md of default', 'Edit AGENTS.md of sofa']),
  );
  await settleAndUnmount(tree);
});

test('a file a workspace does not carry reads as inherited, never as missing', async () => {
  const tree = await boot();
  // What the agent actually reads for sofa is the default workspace's copy.
  expect(textsOf(tree).some(text => text.includes('inherited from default'))).toBe(true);
  expect(textsOf(tree).some(text => text.includes('missing'))).toBe(false);
  await settleAndUnmount(tree);
});

test('opening a file asks for its content and shows it once it lands', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Edit AGENTS.md of default');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'instructions.get', workspace: 'default', file: 'AGENTS.md' }),
    ]),
  );

  await emit({
    type: 'instructions.file',
    workspace: 'default',
    file: 'AGENTS.md',
    content: '# rules',
    origin: 'own',
    from: 'default',
    sha: 'agents1111aa',
    editable: true,
  });
  await waitFor(() => labelsOf(tree).includes('AGENTS.md content'));
  await settleAndUnmount(tree);
});

test('saving an edited file echoes the sha the editor loaded', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Edit AGENTS.md of default');
  await emit({
    type: 'instructions.file',
    workspace: 'default',
    file: 'AGENTS.md',
    content: '# rules',
    origin: 'own',
    from: 'default',
    sha: 'agents1111aa',
    editable: true,
  });
  await waitFor(() => labelsOf(tree).includes('AGENTS.md content'));
  await typeInto(tree, 'AGENTS.md content', '# rules\nmore');
  await pressLabel(tree, 'Save');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'instructions.set',
        workspace: 'default',
        file: 'AGENTS.md',
        content: '# rules\nmore',
        sha: 'agents1111aa',
      }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('saving an inherited file sends no sha, so the server refuses an existing one', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Edit AGENTS.md of sofa');
  await emit({
    type: 'instructions.file',
    workspace: 'sofa',
    file: 'AGENTS.md',
    content: '# inherited body',
    origin: 'inherited',
    from: 'default',
    sha: 'agents1111aa',
    editable: true,
  });
  await waitFor(() => labelsOf(tree).includes('AGENTS.md content'));
  // Untouched on purpose: creating the override with the inherited body changes nothing for
  // the agent, which is the whole point of pre-filling it.
  await pressLabel(tree, 'Save');

  const set = sentFrames().find(f => f.type === 'instructions.set');
  expect(set).toMatchObject({ workspace: 'sofa', file: 'AGENTS.md', content: '# inherited body' });
  expect(set && 'sha' in set).toBe(false);
  await settleAndUnmount(tree);
});

test('a conflict offers a reload instead of letting the save through', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Edit AGENTS.md of default');
  await emit({
    type: 'instructions.file',
    workspace: 'default',
    file: 'AGENTS.md',
    content: '# rules',
    origin: 'own',
    from: 'default',
    sha: 'agents1111aa',
    editable: true,
  });
  await waitFor(() => labelsOf(tree).includes('AGENTS.md content'));
  await typeInto(tree, 'AGENTS.md content', 'mine');
  await pressLabel(tree, 'Save');

  // The agent wrote to AGENTS.md while the editor was open.
  await emit({
    type: 'instructions.saved',
    workspace: 'default',
    file: 'AGENTS.md',
    ok: false,
    sha: '',
    conflict: true,
    error: 'changed on the server since it was opened',
  });
  await waitFor(() => labelsOf(tree).includes('Reload from the server, losing this draft'));

  // Saving again would drop what the agent appended, so the button is out of reach.
  const saveButtons = tree.root.findAll(
    node => node.props.accessibilityLabel === 'Save' && typeof node.props.onPress === 'function',
  );
  expect(saveButtons[0]?.props.accessibilityState).toEqual({ disabled: true });
  await settleAndUnmount(tree);
});

test('reloading after a conflict asks the server again for the file', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Edit AGENTS.md of default');
  await emit({
    type: 'instructions.file',
    workspace: 'default',
    file: 'AGENTS.md',
    content: '# rules',
    origin: 'own',
    from: 'default',
    sha: 'agents1111aa',
    editable: true,
  });
  await waitFor(() => labelsOf(tree).includes('AGENTS.md content'));
  await typeInto(tree, 'AGENTS.md content', 'mine');
  await pressLabel(tree, 'Save');
  await emit({
    type: 'instructions.saved',
    workspace: 'default',
    file: 'AGENTS.md',
    ok: false,
    sha: '',
    conflict: true,
    error: 'changed on the server since it was opened',
  });
  await waitFor(() => labelsOf(tree).includes('Reload from the server, losing this draft'));
  bridge.sendMessage.mockClear();
  await pressLabel(tree, 'Reload from the server, losing this draft');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'instructions.get', workspace: 'default', file: 'AGENTS.md' }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('a successful save clears the dirty state instead of guessing it', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Edit AGENTS.md of default');
  await emit({
    type: 'instructions.file',
    workspace: 'default',
    file: 'AGENTS.md',
    content: '# rules',
    origin: 'own',
    from: 'default',
    sha: 'agents1111aa',
    editable: true,
  });
  await waitFor(() => labelsOf(tree).includes('AGENTS.md content'));
  await typeInto(tree, 'AGENTS.md content', 'edited');
  await pressLabel(tree, 'Save');
  await emit({
    type: 'instructions.saved',
    workspace: 'default',
    file: 'AGENTS.md',
    ok: true,
    sha: 'newsha111111',
    conflict: false,
  });

  await waitFor(() => {
    const save = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Save' && typeof node.props.onPress === 'function',
    );
    return save[0]?.props.accessibilityState?.disabled === true;
  });
  await settleAndUnmount(tree);
});

test('a nested AGENTS.md opens read-only, with no save button at all', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Read svc/AGENTS.md of default');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'instructions.get', workspace: 'default', nested: 'svc/AGENTS.md' }),
    ]),
  );

  await emit({
    type: 'instructions.file',
    workspace: 'default',
    file: 'svc/AGENTS.md',
    content: '# service rules',
    origin: 'nested',
    from: 'default',
    sha: 'n1',
    editable: false,
  });
  await waitFor(() => labelsOf(tree).includes('svc/AGENTS.md content'));
  expect(labelsOf(tree)).not.toContain('Save');
  await settleAndUnmount(tree);
});

test('reached from an agent, back returns to that agent and not to the index', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open agents');
  await emit({
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    effortLevels: ['low', 'high'],
    providers: [],
    agents: [
      {
        key: 'general',
        label: 'General sub-agent',
        description: 'Spawned with full tool access',
        model: 'fast-1',
        pinned: false,
        inheritsFrom: 'global',
        workspace: 'sofa',
      },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Open agent General sub-agent'));
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Open instructions'));
  // The agent's own workspace is what decides which files it reads.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['sofa workspace']));

  await pressLabel(tree, 'Open instructions');
  await emit(listFrame());
  await waitFor(() => labelsOf(tree).includes('Back to agent'));
  await pressLabel(tree, 'Back to agent');
  await waitFor(() => labelsOf(tree).includes('Open instructions'));
  await settleAndUnmount(tree);
});

test('a server too old to answer says so instead of spinning', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open instructions');
  await waitFor(() => labelsOf(tree).includes('Back to settings'));

  await ReactTestRenderer.act(async () => {
    instructionsStore.markUnsupported();
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('0.1.169')));
  await settleAndUnmount(tree);
});

test('a refused request surfaces on the page instead of vanishing', async () => {
  const tree = await boot();
  await ReactTestRenderer.act(async () => {
    instructionsStore.fail('instructions unavailable');
  });
  await waitFor(() => labelsOf(tree).includes('Instructions error instructions unavailable'));
  await settleAndUnmount(tree);
});

function policyListFrame(over: Record<string, unknown> = {}): Record<string, unknown> {
  return listFrame({
    entries: [
      { workspace: 'default', file: 'CORE.md', origin: 'own', from: 'default', bytes: 2048, sha: 'core111111aa', inherit: 'default', off: false },
      { workspace: 'sofa', file: 'SOUL.md', origin: 'fallback', from: '', bytes: 0, sha: 'soulsha11111', inherit: 'default', off: false },
      { workspace: 'sofa', file: 'CORE.md', origin: 'off', from: 'sofa', bytes: 100, sha: 'coreoff11111', inherit: 'default', off: true },
    ],
    ...over,
  });
}

async function bootPolicy(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open instructions');
  await emit(policyListFrame());
  await waitFor(() => labelsOf(tree).includes('Layer settings for SOUL.md of sofa'));
  return tree;
}

test('a current server shows the layer controls and an off badge on the row', async () => {
  const tree = await bootPolicy();
  expect(labelsOf(tree)).toEqual(
    expect.arrayContaining(['Layer settings for SOUL.md of sofa', 'CORE.md of sofa off']),
  );
  await settleAndUnmount(tree);
});

test('the layer screen changes the source and saves it', async () => {
  const tree = await bootPolicy();
  await pressLabel(tree, 'Layer settings for SOUL.md of sofa');
  await waitFor(() => labelsOf(tree).includes('SOUL.md layer'));

  // The ladder shows the shipped template winning: nothing any workspace owns, source default.
  expect(textsOf(tree).some(text => text.includes('the first step that has content wins'))).toBe(true);

  await pressLabel(tree, 'Read the shipped template instead');
  await pressLabel(tree, 'Save layer');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'instructions.layer.set',
        workspace: 'sofa',
        file: 'SOUL.md',
        inherit: 'builtin',
        off: false,
      }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('the layer screen answers a skipped layer with the danger wording', async () => {
  const tree = await bootPolicy();
  await pressLabel(tree, 'Layer settings for CORE.md of sofa');
  await waitFor(() => labelsOf(tree).includes('CORE.md layer'));

  // CORE.md is already off in this workspace: the red warning names the safety directives.
  expect(labelsOf(tree)).toContain('Warning CORE.md carries the safety directives');

  await pressLabel(tree, 'Read this layer');
  await pressLabel(tree, 'Save layer');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'instructions.layer.set',
        workspace: 'sofa',
        file: 'CORE.md',
        inherit: 'default',
        off: false,
      }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('back from the layer screen returns to the list, one level', async () => {
  const tree = await bootPolicy();
  await pressLabel(tree, 'Layer settings for SOUL.md of sofa');
  await waitFor(() => labelsOf(tree).includes('SOUL.md layer'));
  await pressLabel(tree, 'Back to instructions');
  await waitFor(() => labelsOf(tree).includes('Layer settings for SOUL.md of sofa'));
  await settleAndUnmount(tree);
});
