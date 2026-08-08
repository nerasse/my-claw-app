/**
 * @format
 *
 * The Jobs page: listed from the drawer, every job edited through the same dynamic pickers the
 * agent editor uses, with stale model/workspace/scope names painted red but never blocking the
 * save. The schedule is the one field the server would refuse, so it is the one that blocks.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { jobsStore } from '../src/core/jobs';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

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

function sentOfType(type: string): Array<Record<string, unknown>> {
  return sentFrames().filter(frame => frame.type === type);
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return press(tree, label);
}

function typeInto(tree: Tree, label: string, value: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const target = tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onChangeText(value);
  });
}

/** One job as the server sends it, with a sane schedule and no unknown flags by default. */
function job(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    name: 'Morning report',
    prompt: 'Summarize the house sensors',
    schedule: { kind: 'interval', minutes: 1440, display: 'every 24h' },
    enabled: true,
    state: 'scheduled',
    repeat: null,
    completedRuns: 3,
    deliver: 'local',
    model: 'fast-1',
    workspace: 'sofa',
    skillsMode: 'inherit',
    mcpMode: 'inherit',
    toolsMode: 'inherit',
    nextRunAt: '2026-08-09T09:00:00.000Z',
    lastRunAt: '2026-08-08T09:00:00.000Z',
    lastStatus: 'ok',
    lastError: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    unknownModel: false,
    unknownWorkspace: false,
    unknownSkills: [],
    unknownMcp: [],
    unknownTools: [],
    ...over,
  };
}

async function openJobs(tree: Tree): Promise<void> {
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open jobs');
  await waitFor(() => labelsOf(tree).includes('Close jobs'));
}

/** The dynamic catalogs the editor's pickers are fed by. */
async function emitCatalogs(tree: Tree): Promise<void> {
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast', provider: 'openai' },
      { id: 'strong-2', label: 'Strong', provider: 'anthropic' },
    ],
    defaultModel: 'fast-1',
  });
  await emit({
    type: 'skills.list.result',
    skills: [
      { name: 'code-review', description: 'Review a diff', source: 'custom', path: '/s/code-review' },
    ],
  });
  await emit({
    type: 'mcp.list.result',
    servers: [
      { name: 'mailcow', transport: 'sse', state: 'connected', toolCount: 2 },
    ],
  });
  await emit({
    type: 'tools.list.result',
    tools: [
      { name: 'bash', description: 'Run a command', source: 'built-in', disabled: false },
      { name: 'web_search', description: 'Search', source: 'built-in', disabled: false },
    ],
    missing: [],
  });
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/w', default: true },
      { key: 'sofa', path: '/srv/sofa', default: false },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Close jobs'));
}

beforeEach(() => {
  jest.clearAllMocks();
  jobsStore.reset();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
});

test('the drawer opens the jobs page and asks for the listing', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  expect(sentOfType('jobs.list').length).toBeGreaterThan(0);
  expect(labelsOf(tree)).toContain('Add job');
  await unmount(tree);
});

test('jobs render their schedule and state, and stale names are painted red', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({
    type: 'jobs.list.result',
    jobs: [
      job(),
      job({
        id: 'job-2',
        name: 'Night sweep',
        prompt: 'clean the logs',
        schedule: { kind: 'cron', expr: '0 2 * * *', display: '0 2 * * *' },
        enabled: false,
        state: 'paused',
        pausedReason: 'workspace gone',
        model: 'ghost-model',
        workspace: 'gone-ws',
        skillsMode: 'list',
        skills: ['code-review', 'vanished-skill'],
        unknownModel: true,
        unknownWorkspace: true,
        unknownSkills: ['vanished-skill'],
        unknownMcp: [],
        unknownTools: [],
        lastStatus: 'error',
      }),
    ],
  });

  const texts = textsOf(tree).join('\n');
  expect(texts).toContain('Morning report');
  expect(texts).toContain('every 24h');
  expect(texts).toContain('Night sweep');
  expect(texts).toContain('0 2 * * *');
  expect(texts).toContain('ghost-model · no such model');
  expect(texts).toContain('gone-ws · workspace gone');
  expect(texts).toContain('removed: skills: vanished-skill');
  await unmount(tree);
});

test('a new job saves and the fresh listing closes the editor', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));

  await typeInto(tree, 'Job name', 'Nightly digest');
  await typeInto(tree, 'Job prompt', 'Summarize the day');
  await typeInto(tree, 'Job model id', 'fast-1');

  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({
    name: 'Nightly digest',
    prompt: 'Summarize the day',
    schedule: 'every 24h',
    enabled: true,
    model: 'fast-1',
  });
  expect(saves[0]?.id).toBeUndefined();

  await emit({
    type: 'jobs.list.result',
    jobs: [job({ name: 'Nightly digest', prompt: 'Summarize the day' })],
  });
  await waitFor(() => !labelsOf(tree).includes('Job name'));
  expect(labelsOf(tree)).toContain('Edit job Nightly digest');
  await unmount(tree);
});

test('a schedule the server would refuse blocks the save, in red', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));

  await typeInto(tree, 'Job prompt', 'do things');
  await typeInto(tree, 'Job schedule', 'not a schedule');
  await waitFor(() =>
    textsOf(tree).some(text => text.includes('the server would refuse this')),
  );

  await pressLabel(tree, 'Save job');
  expect(sentOfType('jobs.save').length).toBe(0);
  await unmount(tree);
});

test('a model outside the catalog is flagged red but the save still goes', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));

  await typeInto(tree, 'Job prompt', 'do things');
  await typeInto(tree, 'Job model id', 'ghost-model');
  await waitFor(() =>
    textsOf(tree).some(text => text.includes('no such model in the catalog')),
  );

  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ model: 'ghost-model' });
  await unmount(tree);
});

test('the scope rows open the shared editor and the choice rides on the save', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Edit skills scope'));

  await pressLabel(tree, 'Edit skills scope');
  await waitFor(() => labelsOf(tree).includes('Scope mode Select'));
  await pressLabel(tree, 'Scope mode Select');
  await pressLabel(tree, 'Toggle code-review');
  await pressLabel(tree, 'Save scope');
  await waitFor(() => labelsOf(tree).includes('Edit skills scope'));
  expect(textsOf(tree).join('\n')).toContain('code-review');

  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ skills: { mode: 'list', names: ['code-review'] } });
  await unmount(tree);
});

test('a removed scope name is kept checkable in the picker, painted red', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await emit({
    type: 'jobs.list.result',
    jobs: [
      job({
        skillsMode: 'list',
        skills: ['code-review', 'vanished-skill'],
        unknownSkills: ['vanished-skill'],
      }),
    ],
  });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Edit skills scope'));
  expect(labelsOf(tree)).toContain('Delete job');

  await pressLabel(tree, 'Edit skills scope');
  await waitFor(() => labelsOf(tree).includes('Scope mode Select'));
  await waitFor(() => textsOf(tree).some(text => text.includes('no longer exists')));
  // The stale name is still carried by the job, so the picker keeps it checkable.
  expect(labelsOf(tree)).toContain('Remove removed vanished-skill');
  await unmount(tree);
});

test('editing an existing job prefills the form and saves by id', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Job name'));

  await typeInto(tree, 'Job name', 'Renamed report');
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ id: 'job-1', name: 'Renamed report' });
  await unmount(tree);
});

test('deleting a job asks first, then sends jobs.delete', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Delete job'));

  await pressLabel(tree, 'Delete job');
  await waitFor(() => textsOf(tree).some(text => text.includes('task stops running')));
  expect(sentOfType('jobs.delete').length).toBe(0);

  await pressLabel(tree, 'Delete');
  await waitFor(() => sentOfType('jobs.delete').length === 1);
  expect(sentOfType('jobs.delete')[0]).toMatchObject({ id: 'job-1' });
  await unmount(tree);
});

test('the back key walks the editor, then the page, and stops there', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));

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
  await waitFor(() => !labelsOf(tree).includes('Job name'));
  expect(labelsOf(tree)).toContain('Close jobs');

  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });
  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Close jobs'));
  expect(back.default.exitApp).not.toHaveBeenCalled();
  await unmount(tree);
});
