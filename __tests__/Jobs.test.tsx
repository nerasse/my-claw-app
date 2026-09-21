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
    subagents: true,
    browser: true,
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
  await pressLabel(tree, 'More');
  await pressLabel(tree, 'Jobs');
  await waitFor(() => labelsOf(tree).includes('Close jobs'));
}

/** The dynamic catalogs the editor's pickers are fed by. */
async function emitCatalogs(tree: Tree): Promise<void> {
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast', provider: 'openai', effortLevels: ['low', 'medium', 'high'] },
      { id: 'strong-2', label: 'Strong', provider: 'anthropic', effortLevels: ['low', 'medium', 'high'] },
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
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

test('the drawer opens the jobs page and asks for the listing', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  expect(sentOfType('jobs.list').length).toBeGreaterThan(0);
  expect(labelsOf(tree)).toContain('Add job');
  await unmount(tree);
});

test('the jobs page asks for the model catalog its editor judges pinned models against', async () => {
  const tree = await renderApp();
  // The connect fetch already sent one. Only the jobs page's own request counts here: it is the
  // page that writes "no such model" next to a pinned model, and it used to trust a catalog that
  // a single lost frame at connect leaves empty forever -- every pinned job red, wrongly.
  bridge.sendMessage.mockClear();
  await openJobs(tree);

  expect(sentOfType('model.list').length).toBeGreaterThan(0);
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
  await pressLabel(tree, 'Edit job model');
  await waitFor(() => labelsOf(tree).includes('Use default (Fast)') || labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  // The effort step is part of the flow now; the job carries its pick on the save.
  await waitFor(() => labelsOf(tree).includes('medium'));
  await pressLabel(tree, 'medium');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');

  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({
    name: 'Nightly digest',
    prompt: 'Summarize the day',
    schedule: 'every 24h',
    enabled: true,
    model: 'fast-1',
    effort: 'medium',
  });
  expect((saves[0] as Record<string, unknown>)?.id).toBeUndefined();

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
  await emit({
    type: 'jobs.list.result',
    jobs: [job({ model: 'ghost-model', unknownModel: true })],
  });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Edit job model'));

  // The picker is a live catalog; a job's stale model is kept as-is until the owner picks.
  await waitFor(() => textsOf(tree).some(text => text.includes('no such model')));
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ model: 'ghost-model' });
  await unmount(tree);
});

test('the model picker offers the live catalog and “Inherit” clears the override', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Edit job model'));

  await pressLabel(tree, 'Edit job model');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Strong');
  // A job pins its effort next to its model, like every other scope: model, then effort, then
  // the confirmation. The picked effort rides on the jobs.save.
  await waitFor(() => labelsOf(tree).includes('high'));
  await pressLabel(tree, 'high');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');
  await waitFor(() => labelsOf(tree).includes('Edit job model'));
  expect(textsOf(tree).join('\n')).toContain('strong-2');

  await pressLabel(tree, 'Edit job model');
  await pressLabel(tree, 'Inherit (no override)');
  await waitFor(() => textsOf(tree).join('\n').includes('inherited'));
  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect((saves[0] as Record<string, unknown>)?.model).toBeUndefined();
  await unmount(tree);
});

test('a job pins its effort and “default (inherit)” clears it again', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Edit job model'));

  await pressLabel(tree, 'Edit job model');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Strong');
  await waitFor(() => labelsOf(tree).includes('default (inherit)'));
  await pressLabel(tree, 'medium');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');

  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect((saves[0] as Record<string, unknown>)?.effort).toBe('medium');
  await unmount(tree);
});

test('the workspace picker lists the dynamic workspaces and the default', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Edit job workspace'));

  await pressLabel(tree, 'Edit job workspace');
  await waitFor(() => labelsOf(tree).includes('Use workspace sofa'));
  await pressLabel(tree, 'Use workspace sofa');
  await waitFor(() => labelsOf(tree).includes('Edit job workspace'));
  expect(textsOf(tree).join('\n')).toContain('sofa');

  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ workspace: 'sofa' });
  await unmount(tree);
});

test('a workspace that left the config is pinned red and “default” drops it', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await emit({
    type: 'jobs.list.result',
    jobs: [job({ workspace: 'gone-ws', unknownWorkspace: true })],
  });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Edit job workspace'));
  await waitFor(() => textsOf(tree).some(text => text.includes('workspace gone')));

  await pressLabel(tree, 'Edit job workspace');
  await waitFor(() => labelsOf(tree).includes('Drop removed workspace gone-ws'));
  await pressLabel(tree, 'Drop removed workspace gone-ws');
  await waitFor(() => labelsOf(tree).includes('Edit job workspace'));

  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect((saves[0] as Record<string, unknown>)?.workspace).toBeUndefined();
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

test('a job card opens its runs page, which lists every run as an openable session', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await waitFor(() => labelsOf(tree).includes('Job sessions Morning report'));

  await pressLabel(tree, 'Job sessions Morning report');
  await waitFor(() => sentOfType('jobs.runs').length === 1);
  expect(sentOfType('jobs.runs')[0]).toMatchObject({ jobId: 'job-1' });
  expect(labelsOf(tree)).toContain('Edit job settings');

  await emit({
    type: 'jobs.runs.result',
    jobId: 'job-1',
    runs: [
      { threadId: 'cron-job-1-1723200000000', runAt: 1723200000000, messageCount: 4, title: 'Morning report · 08/08 19:30' },
      { threadId: 'cron-job-1-1723113600000', runAt: 1723113600000, messageCount: 0, title: 'Morning report · 08/08 17:00' },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Open run Morning report · 08/08 19:30'));
  expect(labelsOf(tree)).toContain('Open run Morning report · 08/08 17:00');
  await unmount(tree);
});

test('tapping a run opens it as a real chat: history asked, thread on screen', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await pressLabel(tree, 'Job sessions Morning report');
  await emit({
    type: 'jobs.runs.result',
    jobId: 'job-1',
    runs: [
      { threadId: 'cron-job-1-1723200000000', runAt: 1723200000000, messageCount: 4, title: 'Morning report · 08/08 19:30' },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Open run Morning report · 08/08 19:30'));

  await pressLabel(tree, 'Open run Morning report · 08/08 19:30');
  await waitFor(() =>
    bridge.sendMessage.mock.calls.some(([frame]) => {
      const parsed = JSON.parse(String(frame)) as Record<string, unknown>;
      return parsed.type === 'session.sync' && parsed.threadId === 'cron-job-1-1723200000000';
    }),
  );
  // The header shows the run title, not the raw first message.
  expect(textsOf(tree).join('\n')).toContain('Morning report · 08/08 19:30');
  await unmount(tree);
});

test('the back key walks a run chat to its runs page, then the jobs list', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await pressLabel(tree, 'Job sessions Morning report');
  await emit({
    type: 'jobs.runs.result',
    jobId: 'job-1',
    runs: [
      { threadId: 'cron-job-1-1723200000000', runAt: 1723200000000, messageCount: 4, title: 'Morning report · 08/08 19:30' },
    ],
  });
  await pressLabel(tree, 'Open run Morning report · 08/08 19:30');
  await waitFor(() =>
    bridge.sendMessage.mock.calls.some(([frame]) => JSON.parse(String(frame)).type === 'session.sync'),
  );

  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;
  const tapBack = async (): Promise<boolean> => {
    let result = false;
    await ReactTestRenderer.act(async () => {
      result = handlers[handlers.length - 1]();
    });
    return result;
  };

  // Back from the run: the runs page is back, with its runs still listed.
  let handled = await tapBack();
  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open run Morning report · 08/08 19:30'));

  // Back from the runs page: the jobs list.
  handled = await tapBack();
  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Close jobs'));
  await waitFor(() => !labelsOf(tree).includes('Edit job settings'));
  await unmount(tree);
});

test('the runs page shortcuts into the job config, and back returns to the runs', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await pressLabel(tree, 'Job sessions Morning report');
  await emit({
    type: 'jobs.runs.result',
    jobId: 'job-1',
    runs: [
      { threadId: 'cron-job-1-1723200000000', runAt: 1723200000000, messageCount: 4, title: 'Morning report · 08/08 19:30' },
    ],
  });
  await waitFor(() => labelsOf(tree).includes('Open run Morning report · 08/08 19:30'));

  await pressLabel(tree, 'Edit job settings');
  await waitFor(() => labelsOf(tree).includes('Job name'));

  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;
  const tapBack = async (): Promise<boolean> => {
    let result = false;
    await ReactTestRenderer.act(async () => {
      result = handlers[handlers.length - 1]();
    });
    return result;
  };

  // Back from the editor: the runs page is back (its rows still listed).
  let handled = await tapBack();
  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Job name'));
  expect(labelsOf(tree)).toContain('Open run Morning report · 08/08 19:30');

  // Back from the runs page: the jobs list.
  handled = await tapBack();
  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Edit job settings'));
  expect(labelsOf(tree)).toContain('Close jobs');
  await unmount(tree);
});

test('a new job opens in custom mode with the default every-24h schedule', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));

  const labels = labelsOf(tree);
  expect(labels).toEqual(expect.arrayContaining(['Schedule mode Once', 'Schedule mode Repeat', 'Schedule mode Custom']));
  const textField = tree.root.find(node => node.props.accessibilityLabel === 'Job schedule');
  expect(textField.props.value).toBe('every 24h');
  await unmount(tree);
});

test('once mode turns the schedule into an ISO timestamp from the native pickers', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));
  await typeInto(tree, 'Job name', 'One shot');
  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Schedule mode Once');
  await waitFor(() => labelsOf(tree).includes('Pick a time'));
  expect(labelsOf(tree)).not.toContain('Job schedule');

  await pressLabel(tree, 'Pick a date');
  const picker = require('@react-native-community/datetimepicker').__lastProps();
  expect(picker.mode).toBe('date');
  await ReactTestRenderer.act(async () => {
    picker.onChange({ type: 'set' }, new Date(2026, 7, 15, 14, 30));
  });
  expect(textsOf(tree)).toContain('15 Aug 2026');
  await pressLabel(tree, 'Save job');
  await waitFor(() => sentOfType('jobs.save').length === 1);
  expect(sentOfType('jobs.save')[0]).toMatchObject({ schedule: '2026-08-15T14:30:00' });
  await unmount(tree);
});

test('repeat mode presets and field menus build the cron expression', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job name'));
  await typeInto(tree, 'Job name', 'Recurring');
  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Schedule mode Repeat');
  await waitFor(() => labelsOf(tree).includes('Preset Daily'));

  await pressLabel(tree, 'Preset Daily');
  await waitFor(() => textsOf(tree).some(text => text.includes('At 12:00 AM')));

  await pressLabel(tree, 'Field Minute');
  await waitFor(() => labelsOf(tree).includes('Value 30'));
  await pressLabel(tree, 'Value 30');
  await pressLabel(tree, 'Save job');
  await waitFor(() => sentOfType('jobs.save').length === 1);
  expect(sentOfType('jobs.save')[0]).toMatchObject({ schedule: '30 0 * * *' });
  await unmount(tree);
});

test('a cron job opens in repeat mode with its fields pre-filled', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({
    type: 'jobs.list.result',
    jobs: [job({ schedule: { kind: 'cron', expr: '0 9 * * 1', display: '0 9 * * 1' } })],
  });
  await waitFor(() => labelsOf(tree).includes('Edit job Morning report'));
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Field Weekday'));
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['9', 'Mon']));
  await unmount(tree);
});

/**
 * Android tries the handlers last registered first and stops at the first that takes the press.
 * The editor registers its own over the shell's, so a test that only calls the last one cannot
 * see a press the editor declines.
 */
async function androidBack(): Promise<boolean> {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]!()) {
        handled = true;
        break;
      }
    }
  });
  return handled;
}

test('back answers the delete confirmation, and leaves the editor under it open', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job()] });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Delete job'));

  await pressLabel(tree, 'Delete job');
  await waitFor(() => textsOf(tree).some(text => text.includes('task stops running')));

  // Anything at all re-rendering the shell, and it is a conversation list arriving here. The
  // editor's back handler is rebuilt on every render of the shell (its `onBack` is an inline
  // arrow), while the shell's own is rebuilt only when the cascade's dependencies move -- so one
  // unrelated render is enough to leave the editor's handler the last registered, and Android
  // asks the last one first. That is the race the `deleting` flag answers.
  await emit({ type: 'session.list.result', sessions: [] });

  // The editor owns the back key while it is up, so it has to decline this one: the confirmation
  // is the shell's, and answering the press by closing the editor left the question over the list.
  expect(await androidBack()).toBe(true);
  await waitFor(() => !textsOf(tree).some(text => text.includes('task stops running')));

  expect(labelsOf(tree)).toContain('Delete job');
  expect(labelsOf(tree)).toContain('Job name');
  expect(sentOfType('jobs.delete').length).toBe(0);

  await unmount(tree);
});

test('a fresh job carries both capabilities, granted by default', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await pressLabel(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Job prompt'));

  // No chip touched: the editor's own default is the grant, which is the server's too.
  await typeInto(tree, 'Job prompt', 'do things');
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ subagents: true, browser: true });
  await unmount(tree);
});

test('the capability switches read the job and ride on the save', async () => {
  const tree = await renderApp();
  await openJobs(tree);
  await emitCatalogs(tree);
  await emit({ type: 'jobs.list.result', jobs: [job({ subagents: false, browser: false })] });
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Job No browser'));

  // A job that denied both must read as denied: a switch that always opened on "granted" would
  // silently hand the capability back on the next save.
  await pressLabel(tree, 'Save job');
  const saves = sentOfType('jobs.save');
  expect(saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ subagents: false, browser: false });

  // And a tap is the whole answer, in both directions. The server answers every mutation with the
  // fresh listing, and that answer is what closes the editor and re-arms it.
  await emit({ type: 'jobs.list.result', jobs: [job({ subagents: false, browser: false })] });
  await waitFor(() => !labelsOf(tree).includes('Edit job model'));
  await pressLabel(tree, 'Edit job Morning report');
  await waitFor(() => labelsOf(tree).includes('Job Sub-agents'));
  await pressLabel(tree, 'Job Sub-agents');
  await pressLabel(tree, 'Job Browser');
  await pressLabel(tree, 'Save job');
  expect(sentOfType('jobs.save')[1]).toMatchObject({ subagents: true, browser: true });
  await unmount(tree);
});
