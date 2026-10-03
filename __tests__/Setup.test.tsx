/**
 * The first-run assistant: a fresh install answers with no model, and the app opens on the steps
 * that make the agent answer, once. Each step opens the page that sets it.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { servicesStore } from '../src/core/services';
import {
  setupSettled,
  setupSteps,
  type SetupInput,
  type SetupStep,
} from '../src/core/setup';
import type { ServicesResultFrame, ServiceView } from '../src/core/protocol';
import {
  labelsOf,
  press,
  renderApp,
  unmount,
  waitFor,
} from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

beforeEach(() => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({
    width: 412,
    height: 900,
    scale: 2,
    fontScale: 1,
  });
  chatStore.clearAll();
  servicesStore.reset();
  bridge.prefsGetAll.mockResolvedValue({
    themeMode: 'dark',
    lastThreadId: 't-default',
  });
});

describe('the steps', () => {
  const view = (
    id: ServiceView['id'],
    over: Partial<ServiceView> = {},
  ): ServiceView => ({
    id,
    source: 'cloud',
    choices: ['cloud'],
    missing: [],
    health: 'no-endpoint',
    ...over,
  });
  const ALL = [
    'stt',
    'tts',
    'location',
    'search',
    'embeddings',
    'browser',
  ] as const;
  const frame = (
    over: Partial<Record<(typeof ALL)[number], Partial<ServiceView>>> = {},
    extra = {},
  ): ServicesResultFrame => ({
    type: 'services.result',
    install: 'native',
    services: ALL.map(id => view(id, over[id])),
    pushDevices: [],
    pairedDevices: 1,
    ...extra,
  });
  const input = (over: Partial<SetupInput> = {}): SetupInput => ({
    defaultModel: 'p/m',
    services: frame(),
    instructions: [],
    deviceId: 'app-1',
    pushSupported: true,
    skipped: [],
    ...over,
  });
  const state = (steps: SetupStep[], key: string) =>
    steps.find(s => s.key === key)?.state;

  test('every setup there is, in order: model, each service, profile, notifications, devices', () => {
    expect(setupSteps(input()).map(s => s.key)).toEqual([
      'model',
      'stt',
      'tts',
      'location',
      'search',
      'embeddings',
      'browser',
      'profile',
      'notifications',
      'devices',
    ]);
    // No push in this browser: no step to tick that could never be.
    expect(
      setupSteps(input({ pushSupported: false })).map(s => s.key),
    ).not.toContain('notifications');
  });

  test('a service is done when on, with no key missing, answering and not failed', () => {
    const steps = setupSteps(
      input({
        services: frame({
          stt: { missing: ['GROQ_API_KEY'] },
          location: { missing: ['GEOAPIFY_API_KEY'] },
          search: { source: 'off' },
          embeddings: {
            source: 'self-hosted',
            local: { state: 'failed', error: 'pip', bytes: 0 },
          },
          browser: { source: 'self-hosted', health: 'down' },
        }),
      }),
    );
    expect(
      ['stt', 'tts', 'location', 'search', 'embeddings', 'browser'].map(k =>
        state(steps, k),
      ),
    ).toEqual(['todo', 'done', 'todo', 'todo', 'todo', 'todo']);
  });

  test('notifications are done when this device is registered for push; devices when there is another', () => {
    const before = setupSteps(input());
    expect([state(before, 'notifications'), state(before, 'devices')]).toEqual([
      'todo',
      'todo',
    ]);
    const after = setupSteps(
      input({
        services: frame(
          {},
          { pushDevices: ['app-9', 'app-1'], pairedDevices: 2 },
        ),
      }),
    );
    expect([state(after, 'notifications'), state(after, 'devices')]).toEqual([
      'done',
      'done',
    ]);
    // Another phone registered says nothing about this one.
    expect(
      state(
        setupSteps(input({ services: frame({}, { pushDevices: ['app-9'] }) })),
        'notifications',
      ),
    ).toBe('todo');
  });

  test('a skipped step reads skipped until it is done; an older server leaves unknowns unknown', () => {
    const skipped = setupSteps(
      input({
        skipped: ['search', 'tts'],
        services: frame({ search: { source: 'off' } }),
      }),
    );
    expect([state(skipped, 'search'), state(skipped, 'tts')]).toEqual([
      'skipped',
      'done',
    ]);
    expect(setupSettled(skipped)).toBe(
      skipped.filter(s => s.state === 'done' || s.state === 'skipped').length,
    );
    const old = setupSteps(
      input({
        services: {
          type: 'services.result',
          install: 'native',
          services: ALL.filter(id => id !== 'location').map(id => view(id)),
        },
      }),
    );
    expect(old.map(s => s.key)).not.toContain('location');
    expect(state(old, 'notifications')).toBe('unknown');
  });

  test("the profile is the default workspace's USER.md, written once it is not the shipped template", () => {
    const entry = (workspace: string, template: boolean | undefined) => ({
      workspace,
      file: 'USER.md',
      origin: 'own' as const,
      from: workspace,
      bytes: 10,
      sha: 'x',
      ...(template === undefined ? {} : { template }),
    });
    const profile = (instructions: ReturnType<typeof entry>[]) =>
      state(setupSteps(input({ instructions })), 'profile');
    expect(profile([entry('default', false), entry('career', true)])).toBe(
      'done',
    );
    // Another workspace's own file, written or not, says nothing about the default one.
    expect(profile([entry('default', true), entry('career', false)])).toBe(
      'todo',
    );
    expect(profile([entry('default', undefined)])).toBe('unknown');
  });
});

test('a server with no model opens the assistant once, and its first step opens Providers', async () => {
  const tree = await renderApp();
  await emit({ type: 'model.list.result', models: [], defaultModel: '' });
  await waitFor(() => labelsOf(tree).includes('Setup step Pick a model'));

  await press(tree, 'Back to settings');
  await waitFor(() => !labelsOf(tree).includes('Setup step Pick a model'));
  // A second answer with no model does not reopen it: closing it was the owner's choice.
  await emit({ type: 'model.list.result', models: [], defaultModel: '' });
  expect(labelsOf(tree)).not.toContain('Setup step Pick a model');

  await press(tree, 'Open get started');
  await press(tree, 'Setup step Pick a model');
  await waitFor(() => !labelsOf(tree).includes('Setup step Pick a model'));
  await unmount(tree);
});

test('the profile step opens the default USER.md, and Back from it returns to the assistant', async () => {
  const tree = await renderApp();
  await press(tree, 'More');
  await waitFor(() => labelsOf(tree).includes('Settings'));
  await press(tree, 'Settings');
  await press(tree, 'Open get started');
  bridge.sendMessage.mockClear();
  await press(tree, 'Setup step Tell the agent who you are');
  const sent = bridge.sendMessage.mock.calls.map(
    ([f]) => JSON.parse(String(f)) as Record<string, unknown>,
  );
  expect(sent).toContainEqual({
    type: 'instructions.get',
    workspace: 'default',
    file: 'USER.md',
  });
  await waitFor(() => labelsOf(tree).includes('Back to instructions'));
  await press(tree, 'Back to instructions');
  await waitFor(() =>
    labelsOf(tree).includes('Setup step Tell the agent who you are'),
  );
  await unmount(tree);
});

test('a service step unfolds its card on the assistant, its key pasted there; Skip is kept on the device', async () => {
  const tree = await renderApp();
  await press(tree, 'More');
  await waitFor(() => labelsOf(tree).includes('Settings'));
  await press(tree, 'Settings');
  await press(tree, 'Open get started');
  await emit({
    type: 'services.result',
    install: 'native',
    services: [
      {
        id: 'location',
        source: 'cloud',
        choices: ['cloud'],
        missing: ['GEOAPIFY_API_KEY'],
        health: 'no-endpoint',
      },
    ],
    pushDevices: [],
    pairedDevices: 1,
  });
  await press(tree, 'Setup step Location');
  await waitFor(() => labelsOf(tree).includes('Key GEOAPIFY_API_KEY'));
  bridge.prefsSet.mockClear();
  await press(tree, 'Skip Location');
  await waitFor(() => labelsOf(tree).includes('Setup step Location, skipped'));
  expect(bridge.prefsSet).toHaveBeenCalledWith('setupSkipped', 'location');
  await press(tree, 'Unskip Location');
  await waitFor(() => labelsOf(tree).includes('Setup step Location'));
  await unmount(tree);
});

test('a configured server never opens it', async () => {
  const tree = await renderApp();
  expect(labelsOf(tree)).not.toContain('Setup step Pick a model');
  await unmount(tree);
});
