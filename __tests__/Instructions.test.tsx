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

/**
 * The workspace list, answered only if the page actually asked for it. A test that emits a result
 * out of the blue proves nothing about the request that should have caused it.
 */
async function answerWorkspacesIfAsked(): Promise<void> {
  if (!sentFrames().some(frame => frame.type === 'workspaces.list')) return;
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/home/neras/.my-claw/workspace', default: true },
      { key: 'sofa', path: '/home/neras/dev/SOFA', default: false },
      { key: 'lab', path: '/home/neras/dev/lab', default: false },
    ],
  });
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

/**
 * The instruction files live on the workspace that owns them: settings -> Workspaces -> one
 * workspace. Which one matters, so every test names it -- the rows of another workspace are on
 * another page now.
 */
async function boot(workspace = 'default'): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open workspaces');
  await answerWorkspacesIfAsked();
  await waitFor(() => labelsOf(tree).includes(`Open workspace ${workspace}`));
  await pressLabel(tree, `Open workspace ${workspace}`);
  await emit(listFrame());
  await waitFor(() => labelsOf(tree).includes(`Workspace ${workspace}`));
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

test('a workspace page carries its own files only, and asks the server for the listing', async () => {
  const tree = await boot('sofa');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'instructions.list' })]),
  );
  expect(labelsOf(tree)).toContain('Edit AGENTS.md of sofa');
  // The whole point of the move: one workspace at a time. The default's rows are on its own page.
  expect(labelsOf(tree)).not.toContain('Edit CORE.md of default');
  await settleAndUnmount(tree);
});

test('the page asks for the workspace list too, or every named source reads as broken', async () => {
  const tree = await boot('sofa');
  // Reached from the settings index, which fetches no workspaces of its own. Without this frame
  // the list stays empty, and an empty list is what makes sourceStatusOf call a source removed:
  // every `inherit: <workspace>` would show a red "no longer exists" that is pure fiction.
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'workspaces.list' })]),
  );

  // Answering a frame the app never sent is what makes a wiring test lie: the store would fill
  // either way and the row would read fine with the request removed. Only answer what was asked.
  await answerWorkspacesIfAsked();
  await emit(
    listFrame({
      entries: [
        { workspace: 'default', file: 'AGENTS.md', origin: 'own', from: 'default', bytes: 1024, sha: 'agents1111aa', inherit: 'default' },
        { workspace: 'lab', file: 'AGENTS.md', origin: 'inherited', from: 'default', bytes: 1024, sha: 'agents1111aa', inherit: 'default' },
        { workspace: 'sofa', file: 'AGENTS.md', origin: 'fallback', from: '', bytes: 800, sha: 'tpl111111aaa', inherit: 'lab' },
      ],
    }),
  );

  await waitFor(() => textsOf(tree).some(text => text.includes('lands on the shipped template')));
  expect(textsOf(tree).some(text => text.includes('no longer exists'))).toBe(false);
  await settleAndUnmount(tree);
});

test('a fallback through a source without the file says the template won, not the source', async () => {
  const tree = await boot('sofa');
  await answerWorkspacesIfAsked();
  // sofa reads AGENTS.md from lab, and lab carries no AGENTS.md of its own: one hop, so the
  // ladder stops on the shipped template instead of following lab's own inheritance. The server
  // says as much by answering `fallback` -- claiming "read from lab" here would be a lie, and
  // the byte count shown would be the template's.
  await emit(
    listFrame({
      entries: [
        { workspace: 'default', file: 'AGENTS.md', origin: 'own', from: 'default', bytes: 1024, sha: 'agents1111aa', inherit: 'default' },
        { workspace: 'lab', file: 'AGENTS.md', origin: 'inherited', from: 'default', bytes: 1024, sha: 'agents1111aa', inherit: 'default' },
        { workspace: 'sofa', file: 'AGENTS.md', origin: 'fallback', from: '', bytes: 800, sha: 'tpl111111aaa', inherit: 'lab' },
      ],
    }),
  );

  await waitFor(() => textsOf(tree).some(text => text.includes('lands on the shipped template')));
  expect(textsOf(tree).some(text => text.includes('which has no AGENTS.md either'))).toBe(true);
  expect(textsOf(tree).some(text => text.includes('read from lab · '))).toBe(false);
  await settleAndUnmount(tree);
});

test('a cut source with nothing to pass on reads as no layer, never as the template', async () => {
  const tree = await boot('sofa');
  await answerWorkspacesIfAsked();
  // lab cut this layer and owns no AGENTS.md, so sofa reads nothing at all. Saying "lands on the
  // shipped template" here would name content the agent never sees; the server marks it `empty`
  // because the row cannot tell this apart from an empty-handed source on its own.
  await emit(
    listFrame({
      entries: [
        { workspace: 'default', file: 'AGENTS.md', origin: 'own', from: 'default', bytes: 1024, sha: 'agents1111aa', inherit: 'default', off: false, empty: false },
        { workspace: 'lab', file: 'AGENTS.md', origin: 'off', from: 'lab', bytes: 0, sha: '', inherit: 'default', off: true, empty: true },
        { workspace: 'sofa', file: 'AGENTS.md', origin: 'fallback', from: '', bytes: 0, sha: '', inherit: 'lab', off: false, empty: true },
      ],
    }),
  );

  await waitFor(() => textsOf(tree).some(text => text.includes('nothing is read')));
  expect(textsOf(tree).some(text => text.includes('lab has this layer off and no AGENTS.md to pass on'))).toBe(true);
  expect(textsOf(tree).some(text => text.includes('shipped template'))).toBe(false);
  await settleAndUnmount(tree);
});

test('a file a workspace does not carry reads as inherited, never as missing', async () => {
  const tree = await boot('sofa');
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
  const tree = await boot('sofa');
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

test('nested AGENTS.md sit under the workspace they belong to', async () => {
  const tree = await boot('sofa');
  // They used to be one flat list at the bottom of a page that stacked every workspace, with the
  // owning key buried in the hint.
  await emit(
    listFrame({
      nested: [
        { workspace: 'default', path: 'svc/AGENTS.md', bytes: 400 },
        { workspace: 'sofa', path: 'api/AGENTS.md', bytes: 200 },
      ],
    }),
  );
  await waitFor(() => labelsOf(tree).includes('Read api/AGENTS.md of sofa'));
  expect(labelsOf(tree)).not.toContain('Read svc/AGENTS.md of default');
  // Nothing was cut, so the page must not claim it was.
  expect(labelsOf(tree)).not.toContain('Nested list truncated');
  await settleAndUnmount(tree);
});

test('a nested scan the server had to cut says so, instead of implying there is no more', async () => {
  const tree = await boot('sofa');
  // The cap is per workspace and the server names the ones it cut. Silence here reads as "this
  // is everything", which is how a crowded workspace hid files under the old shared budget.
  await emit(
    listFrame({
      nested: [{ workspace: 'sofa', path: 'api/AGENTS.md', bytes: 200 }],
      nestedTruncated: ['sofa'],
    }),
  );
  await waitFor(() => labelsOf(tree).includes('Nested list truncated'));
  await settleAndUnmount(tree);
});

test('the settings index has no Instructions row: the prompt files live under their workspace', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await waitFor(() => labelsOf(tree).includes('Open workspaces'));
  expect(labelsOf(tree)).not.toContain('Open instructions');
  await settleAndUnmount(tree);
});

test('reached from an agent, the page is the workspace that agent reads, back to that agent', async () => {
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
  // No list of every workspace in between: the agent reads sofa, so sofa's page is what opens.
  await waitFor(() => labelsOf(tree).includes('Back to agent'));
  expect(labelsOf(tree)).toEqual(
    expect.arrayContaining(['Workspace sofa', 'Edit AGENTS.md of sofa']),
  );
  expect(labelsOf(tree)).not.toContain('Edit CORE.md of default');
  await pressLabel(tree, 'Back to agent');
  await waitFor(() => labelsOf(tree).includes('Open instructions'));
  await settleAndUnmount(tree);
});

test('a server too old to answer says so instead of spinning', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open workspaces');
  await answerWorkspacesIfAsked();
  await waitFor(() => labelsOf(tree).includes('Open workspace default'));
  await pressLabel(tree, 'Open workspace default');
  await waitFor(() => labelsOf(tree).includes('Back to workspaces'));

  await ReactTestRenderer.act(async () => {
    instructionsStore.markUnsupported();
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('0.1.169')));
  await settleAndUnmount(tree);
});

test('a file row stacks its title over its hint, so the size cannot run over the ⋯ button', async () => {
  const tree = await boot();
  // The row is a flex box holding the pressable, the ⋯ button and the chevron side by side.
  // The pressable itself must stack: laid out as a row, its hint (which carries the size) sits
  // beside the title and overflows the box, printing over the button next to it.
  const pressable = tree.root.find(
    node =>
      node.props.accessibilityLabel === 'Edit CORE.md of default' &&
      typeof node.props.onPress === 'function',
  );
  const style = Object.assign({}, ...[pressable.props.style].flat(Infinity).filter(Boolean)) as {
    flexDirection?: string;
    flex?: number;
  };
  expect(style.flexDirection).toBeUndefined();
  expect(style.flex).toBe(1);
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
  await pressLabel(tree, 'Open workspaces');
  await answerWorkspacesIfAsked();
  await waitFor(() => labelsOf(tree).includes('Open workspace sofa'));
  await pressLabel(tree, 'Open workspace sofa');
  await emit(policyListFrame());
  await waitFor(() => labelsOf(tree).includes('Actions for SOUL.md of sofa'));
  return tree;
}

async function openLayerFromMenu(tree: Tree, file: string, workspace = 'sofa'): Promise<void> {
  await pressLabel(tree, `Actions for ${file} of ${workspace}`);
  await pressLabel(tree, 'Layer settings');
  await waitFor(() => labelsOf(tree).includes(`${file} layer`));
}

test('an inherited file exposes Create from template in its row menu', async () => {
  const tree = await boot('sofa');
  await pressLabel(tree, 'Actions for AGENTS.md of sofa');
  await waitFor(() => labelsOf(tree).includes('Create from template'));

  await pressLabel(tree, 'Create from template');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'instructions.get', workspace: 'sofa', file: 'AGENTS.md' }),
    ]),
  );
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
  expect(textsOf(tree).some(text => text.includes('saving creates sofa/AGENTS.md, today read from default'))).toBe(true);
  await settleAndUnmount(tree);
});

test('a current server shows the layer controls and an off badge on the row', async () => {
  const tree = await bootPolicy();
  expect(labelsOf(tree)).toEqual(
    expect.arrayContaining(['Actions for SOUL.md of sofa', 'CORE.md of sofa off']),
  );
  await settleAndUnmount(tree);
});

test('the layer screen changes the source and saves it', async () => {
  const tree = await bootPolicy();
  await openLayerFromMenu(tree, 'SOUL.md');

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

test('the layer ladder offers the default workspace once, at the top of the steps', async () => {
  const tree = await bootPolicy();
  await openLayerFromMenu(tree, 'SOUL.md');
  // The listing is what carries the default entry, so the steps below only mean something once
  // the page has it: default, sofa and lab.
  await answerWorkspacesIfAsked();
  await waitFor(() => labelsOf(tree).includes('Read from workspace lab instead'));

  // "the default workspace" is its own step at the top; the workspace list that follows must
  // exclude it, or the same fallback is offered twice under two different names.
  // labelsOf reports one label per matching node, so dedupe, and keep only the step rows: the
  // ladder summary mentions default/SOUL.md too without being an offered step.
  const labels = labelsOf(tree);
  const steps = [...new Set(labels)].filter(label => label.startsWith('Read from'));
  expect(steps).not.toContain('Read from workspace default instead');
  expect(steps.filter(label => label.includes('default'))).toEqual([
    'Read from the default workspace instead',
  ]);
  expect(labels.indexOf('Read from the default workspace instead')).toBeLessThan(
    labels.indexOf('Read from workspace lab instead'),
  );
  await settleAndUnmount(tree);
});

test('the layer screen answers a skipped layer with the danger wording', async () => {
  const tree = await bootPolicy();
  await openLayerFromMenu(tree, 'CORE.md');

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

test('back from the layer screen returns to the workspace, one level', async () => {
  const tree = await bootPolicy();
  await openLayerFromMenu(tree, 'SOUL.md');
  await pressLabel(tree, 'Back to the workspace');
  await waitFor(() => labelsOf(tree).includes('Actions for SOUL.md of sofa'));
  // One level: the workspace it came from, not the list of every workspace.
  expect(labelsOf(tree)).toContain('Workspace sofa');
  await settleAndUnmount(tree);
});
