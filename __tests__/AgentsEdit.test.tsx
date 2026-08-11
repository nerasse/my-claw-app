/**
 * @format
 *
 * The editable surfaces of the Agents/MCPs/Tools/Config pages: every save goes out as the
 * matching frame (never an optimistic local write), and the red "removed" sections are driven
 * by the server's unknown and missing fields.
 */import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { agentsStore } from '../src/core/agents';
import { agentsFileStore } from '../src/core/agentsFile';
import { deviceBridge } from '../src/core/nativeBridge';
import { ScopeEditorScreen } from '../src/app/ScopeEditorScreen';
import { McpsScreen } from '../src/app/McpsScreen';
import { ToolsScreen } from '../src/app/ToolsScreen';
import { WorkspacesScreen } from '../src/app/WorkspacesScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-agents-edit';

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

function typeInto(tree: Tree, label: string, value: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const target = tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onChangeText(value);
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

function agentsConfig(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    fallback: '',
    effortLevels: ['low', 'medium', 'high'],
    providers: [],
    agents: [
      { key: 'orchestrator', label: 'Orchestrator', description: 'The agent you talk to', model: 'fast-1', pinned: false, inheritsFrom: 'global' },
      { key: 'general', label: 'General sub-agent', description: 'Spawned with full tool access', model: 'fast-1', pinned: false, inheritsFrom: 'global', skills: ['forgejo', 'pdf'], mcp: ['mailcow', 'ghost'], unknownMcp: ['ghost'] },
      { key: 'reviewer', label: 'reviewer', description: 'Reviews a diff', model: 'fast-1', pinned: false, inheritsFrom: 'global', source: 'custom', path: '/agents/reviewer.md', base: 'research' },
    ],
    ...over,
  };
}

async function boot(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  await waitFor(() => labelsOf(tree).includes('Open agent reviewer'));
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  agentsStore.reset();
  agentsFileStore.reset();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('the scope editor lists the dynamic catalog and pins removed entries in red', async () => {
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <ScopeEditorScreen
          title="Skills"
          subtitle="for general"
          kind="skills"
          available={[{ name: 'forgejo', description: 'Forgejo operations' }]}
          mode="list"
          names={['forgejo', 'pdf']}
          unknown={['pdf']}
          unsetLabel="Inherit"
          unsetValue="inherit"
          error={null}
          saving={false}
          onBack={() => {}}
          onSave={() => {}}
        />
      </ThemeProvider>,
    );
  });

  const texts = textsOf(tree);
  expect(texts).toEqual(expect.arrayContaining(['forgejo', 'Forgejo operations', 'pdf', 'no such skill installed']));
  expect(labelsOf(tree)).toEqual(expect.arrayContaining(['Toggle forgejo', 'Remove removed pdf']));
  await unmount(tree);
});

test('saving the scope editor sends agents.scope.set with the chosen mode', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Edit skills scope'));
  await pressLabel(tree, 'Edit skills scope');
  await waitFor(() => labelsOf(tree).includes('Scope mode Inherit'));
  await pressLabel(tree, 'Save scope');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'agents.scope.set', agent: 'general', field: 'skills', mode: 'list', names: ['forgejo', 'pdf'] }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('the scope editor asks for both catalogs itself, instead of borrowing the agent page load', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Edit skills scope'));
  // From here on, only what the scope page asks for counts: it is the page that calls a name
  // "no such skill installed", and it reads that verdict off a catalog it must hold itself.
  bridge.sendMessage.mockClear();
  await pressLabel(tree, 'Edit skills scope');
  await waitFor(() => labelsOf(tree).includes('Scope mode Inherit'));

  expect(sentFrames().map(frame => frame.type)).toEqual(
    expect.arrayContaining(['skills.list', 'mcp.list']),
  );
  await settleAndUnmount(tree);
});

test('the agent file page asks for the skills catalog it paints red, not just the MCP one', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent reviewer');
  await waitFor(() => labelsOf(tree).includes('Edit agent file'));
  bridge.sendMessage.mockClear();
  await pressLabel(tree, 'Edit agent file');
  await waitFor(() => sentFrames().some(frame => frame.type === 'agents.file.get'));

  // Both, and for the same reason: the page flags unknown skills exactly like unknown servers.
  expect(sentFrames().map(frame => frame.type)).toEqual(
    expect.arrayContaining(['skills.list', 'mcp.list']),
  );
  await settleAndUnmount(tree);
});

test('a removed scope entry is flagged on the detail page', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Edit MCP scope'));
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['mailcow, ghost', 'removed: ghost', 'removed']));
  await settleAndUnmount(tree);
});

test('the workspace picker sends agents.workspace.set with the picked key', async () => {
  const tree = await boot();
  await emit({ type: 'workspaces.list.result', workspaces: [{ key: 'default', path: '/w', default: true }, { key: 'sofa', path: '/s', default: false }] });
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Edit workspace'));
  await pressLabel(tree, 'Edit workspace');
  await waitFor(() => labelsOf(tree).includes('Use workspace sofa'));
  await pressLabel(tree, 'Use workspace sofa');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.workspace.set', agent: 'general', workspace: 'sofa' })]),
  );
  await settleAndUnmount(tree);
});

test('the picker lists the default once, first, and apart from the named workspaces', async () => {
  const tree = await boot();
  // The listing carries the default as a `default: true` entry, and the picker owns a "no pin"
  // row for it: mapping the whole list under that row is how "default" showed up twice.
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'sofa', path: '/s', default: false },
      { key: 'default', path: '/w', default: true },
    ],
  });
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Edit workspace'));
  await pressLabel(tree, 'Edit workspace');
  await waitFor(() => labelsOf(tree).includes('Use workspace sofa'));

  // labelsOf reports one label per matching node, so dedupe before counting the rows.
  const labels = labelsOf(tree);
  const rows = [...new Set(labels)];
  expect(rows).not.toContain('Use workspace default');
  expect(rows.filter(label => label.includes('default'))).toEqual(['Use the default workspace']);
  // First whatever order the server sent, and its own section says so.
  expect(labels.indexOf('Use the default workspace')).toBeLessThan(labels.indexOf('Use workspace sofa'));
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['default', 'named', '/w', 'sofa']));
  await settleAndUnmount(tree);
});

test('the file page loads the structured file and saves it back with the loaded sha', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent reviewer');
  await waitFor(() => labelsOf(tree).includes('Edit agent file'));
  await pressLabel(tree, 'Edit agent file');
  // The page asked for the file on open.
  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'agents.file.get' && frame.agent === 'reviewer'),
  );
  await emit({
    type: 'agents.file.result',
    name: 'reviewer',
    source: 'custom',
    path: '/agents/reviewer.md',
    editable: true,
    sha: 'aaaabbbbcccc',
    description: 'Reviews a diff',
    base: 'research',
    skillsMode: 'absent',
    mcpMode: 'absent',
    prompt: 'You review code.',
    toolOptions: ['read', 'grep', 'find', 'ls'],
    unknownTools: [],
  });
  await waitFor(() => labelsOf(tree).includes('Agent description'));
  await typeInto(tree, 'Agent description', 'Reviews a diff, thoroughly');
  await pressLabel(tree, 'Save agent file');

  const saved = sentFrames().find(frame => frame.type === 'agents.file.set');
  expect(saved).toEqual(
    expect.objectContaining({
      type: 'agents.file.set',
      agent: 'reviewer',
      sha: 'aaaabbbbcccc',
      description: 'Reviews a diff, thoroughly',
      prompt: 'You review code.',
    }),
  );
  await settleAndUnmount(tree);
});

test('a built-in agent offers a fork instead of editing', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent reviewer');
  await waitFor(() => labelsOf(tree).includes('Edit agent file'));
  // Make it built-in: the file page then shows the fork path.
  await emit(agentsConfig({ agents: [{ key: 'reviewer', label: 'reviewer', description: 'Reviews a diff', model: 'fast-1', pinned: false, inheritsFrom: 'global', source: 'built-in', path: '/agents/.builtin/reviewer.md', base: 'research' }] }));
  await pressLabel(tree, 'Fork agent to custom');
  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'agents.file.create' && frame.name === 'reviewer'),
  );
  await settleAndUnmount(tree);
});

test('creating a new agent sends agents.file.create with the name and description', async () => {
  const tree = await boot();
  await pressLabel(tree, 'New agent');
  await waitFor(() => labelsOf(tree).includes('Create agent'));
  await typeInto(tree, 'New agent name', 'summarizer');
  await typeInto(tree, 'New agent description', 'Summarizes long threads');
  await pressLabel(tree, 'Create agent');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'agents.file.create', name: 'summarizer', description: 'Summarizes long threads' }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('the tools page toggles the denylist and shows removed names in red', async () => {
  let toggled: Array<[string, boolean]> = [];
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <ToolsScreen
          tools={[
            { name: 'read', description: 'Read a file', source: 'built-in', disabled: false },
            { name: 'bash', description: 'Run a command', source: 'built-in', disabled: true },
          ]}
          missing={['cron']}
          saving={false}
          onBack={() => {}}
          onToggle={(name, disabled) => toggled.push([name, disabled])}
        />
      </ThemeProvider>,
    );
  });
  const texts = textsOf(tree);
  expect(texts).toEqual(expect.arrayContaining(['removed', 'cron', 'no tool carries this name anymore']));
  await pressLabel(tree, 'Disable tool read');
  await pressLabel(tree, 'Drop removed tool cron');
  expect(toggled).toEqual([
    ['read', true],
    ['cron', false],
  ]);
  await unmount(tree);
});

test('the tools page request goes out when it opens', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Open tools'));
  await pressLabel(tree, 'Open tools');
  await emit({
    type: 'tools.list.result',
    tools: [
      { name: 'read', description: 'Read a file', source: 'built-in', disabled: false },
      { name: 'bash', description: 'Run a command', source: 'built-in', disabled: true },
    ],
    missing: ['cron'],
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('2 tools · 1 disabled · 1 removed')));
  await settleAndUnmount(tree);
});

test('the MCPs page declares, disables and removes servers', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Open MCPs'));
  await pressLabel(tree, 'Open MCPs');
  await emit({
    type: 'mcp.list.result',
    servers: [
      { name: 'mailcow', transport: 'stdio', state: 'connected', toolCount: 2, command: 'mcp-mail' },
      { name: 'weather', transport: 'http', state: 'failed', toolCount: 0, lastError: 'spawn ENOENT', url: 'http://mcp.local' },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Disable mailcow'));

  await pressLabel(tree, 'Disable mailcow');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'mcp.enable', name: 'mailcow', enabled: false })]),
  );

  await pressLabel(tree, 'Add server');
  await waitFor(() => labelsOf(tree).includes('Create server'));
  await pressLabel(tree, 'Transport http');
  await typeInto(tree, 'Server name', 'gitlab');
  await typeInto(tree, 'Server url', 'http://mcp.gitlab');
  await pressLabel(tree, 'Create server');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'mcp.add', name: 'gitlab', transport: 'http', url: 'http://mcp.gitlab' }),
    ]),
  );

  await pressLabel(tree, 'Manage weather');
  await waitFor(() => labelsOf(tree).includes('Confirm remove weather'));
  await pressLabel(tree, 'Confirm remove weather');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'mcp.remove', name: 'weather' })]),
  );
  await settleAndUnmount(tree);
});

test('the config editor saves the raw text with the loaded sha', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Open config'));
  await pressLabel(tree, 'Open config');
  await emit({ type: 'config.result', content: '{ "llm": { "defaultModel": "fast-1" } }', sha: 'abcabc', maxBytes: 4096 });
  await waitFor(() => labelsOf(tree).includes('config.json content'));
  await typeInto(tree, 'config.json content', '{ "llm": { "defaultModel": "opus" } }');
  await pressLabel(tree, 'Save config');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'config.set', sha: 'abcabc', content: '{ "llm": { "defaultModel": "opus" } }' }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('a refused agents write surfaces on the page that asked', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Edit skills scope'));
  await ReactTestRenderer.act(async () => {
    agentsStore.fail('unknown agent: ghost');
  });
  await waitFor(() => labelsOf(tree).includes('Agents error unknown agent: ghost'));
  await settleAndUnmount(tree);
});

test('the workspaces page adds, edits key and path, and removes workspaces', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Open workspaces'));
  await pressLabel(tree, 'Open workspaces');
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/w', default: true },
      { key: 'sofa', path: '/srv/sofa', default: false },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Edit workspace sofa'));

  await pressLabel(tree, 'Remove workspace sofa');
  await waitFor(() => labelsOf(tree).includes('Confirm remove workspace sofa'));
  await pressLabel(tree, 'Confirm remove workspace sofa');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'workspaces.remove', key: 'sofa' })]),
  );
  // Every mutation answers with the fresh listing, which is also what clears the busy state.
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/w', default: true },
      { key: 'sofa', path: '/srv/sofa', default: false },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Edit workspace sofa'));

  // One edit form handles the key: changing it renames and moves the agent pins.
  await pressLabel(tree, 'Edit workspace sofa');
  await waitFor(() => labelsOf(tree).includes('Workspace key'));
  // The form is pre-filled with the current values.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['sofa', '/srv/sofa']));
  await typeInto(tree, 'Workspace key', 'couch');
  await pressLabel(tree, 'Save workspace');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'workspaces.rename', from: 'sofa', to: 'couch' })]),
  );
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/w', default: true },
      { key: 'couch', path: '/srv/sofa', default: false },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Edit workspace couch'));

  // The same form handles the path: changing it repoints the key at a new directory.
  await pressLabel(tree, 'Edit workspace couch');
  await waitFor(() => labelsOf(tree).includes('Workspace path'));
  await typeInto(tree, 'Workspace path', '/srv/couch');
  await pressLabel(tree, 'Save workspace');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'workspaces.path.set', key: 'couch', path: '/srv/couch' }),
    ]),
  );
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/w', default: true },
      { key: 'couch', path: '/srv/couch', default: false },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Add workspace'));

  await pressLabel(tree, 'Add workspace');
  await waitFor(() => labelsOf(tree).includes('Workspace path'));
  await typeInto(tree, 'Workspace key', 'desk');
  await typeInto(tree, 'Workspace path', '/srv/desk');
  await pressLabel(tree, 'Save workspace');
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'workspaces.add', key: 'desk', path: '/srv/desk' }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('WorkspacesScreen direct render shows the default and the named workspaces', async () => {
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <WorkspacesScreen
          workspaces={[
            { key: 'default', path: '/w', default: true },
            { key: 'sofa', path: '/srv/sofa', default: false },
          ]}
          error={null}
          busy={false}
          onBack={() => {}}
          onAdd={() => {}}
          onRemove={() => {}}
          onRename={() => {}}
          onSetPath={() => {}}
        />
      </ThemeProvider>,
    );
  });
  const texts = textsOf(tree);
  expect(texts).toEqual(expect.arrayContaining(['default', '/srv/sofa', '1 named · the default holds your conversations and memory']));
  expect(labelsOf(tree)).toEqual(expect.arrayContaining(['Add workspace', 'Edit workspace sofa', 'Remove workspace sofa']));
  await unmount(tree);
});

test('McpsScreen direct render shows declared wiring minus the add form', async () => {
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <McpsScreen
          servers={[
            { name: 'mailcow', transport: 'stdio', state: 'connected', toolCount: 2, command: 'mcp-mail', args: ['--port', '2525'] },
            { name: 'off', transport: 'sse', state: 'disabled', toolCount: 0, enabled: false, url: 'http://mcp.local/sse' },
          ]}
          error={null}
          busy={false}
          onBack={() => {}}
          onAdd={() => {}}
          onRemove={() => {}}
          onEnable={() => {}}
        />
      </ThemeProvider>,
    );
  });
  const texts = textsOf(tree);
  expect(texts).toEqual(expect.arrayContaining(['mailcow', 'stdio · mcp-mail', 'off', 'sse · http://mcp.local/sse', '2 declared · agents scope themselves with these names']));
  await unmount(tree);
});
