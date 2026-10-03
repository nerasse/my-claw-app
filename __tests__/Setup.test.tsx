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
import { setupSteps } from '../src/core/setup';
import { labelsOf, press, renderApp, unmount, waitFor } from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

beforeEach(() => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 412, height: 900, scale: 2, fontScale: 1 });
  chatStore.clearAll();
  servicesStore.reset();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

describe('the steps', () => {
  test('the model is the one essential; services are done when none still needs a key or a URL', () => {
    const none = setupSteps({ defaultModel: '', services: null });
    expect(none.map(s => s.key)).toEqual(['model', 'services', 'profile', 'notifications', 'devices']);
    expect(none[0]).toMatchObject({ done: false, essential: true, page: 'providers' });
    expect(none[1]!.done).toBeUndefined();
    const svc = (missing: string[]) => ({ type: 'services.result' as const, install: 'native' as const, services: [{ id: 'stt' as const, source: 'cloud' as const, choices: [], missing, health: 'no-endpoint' as const }] });
    expect(setupSteps({ defaultModel: 'p/m', services: svc(['GROQ_API_KEY']) })[1]).toMatchObject({ done: false, hint: 'one service still needs a key or a URL' });
    expect(setupSteps({ defaultModel: 'p/m', services: svc([]) }).slice(0, 2).map(s => s.done)).toEqual([true, true]);
  });
});

test('a server with no model opens the assistant once, and its first step opens Providers', async () => {
  const tree = await renderApp();
  await emit({ type: 'model.list.result', models: [], defaultModel: '' });
  await waitFor(() => labelsOf(tree).includes('Setup step Pick a model'));

  await press(tree, 'Back');
  await waitFor(() => !labelsOf(tree).includes('Setup step Pick a model'));
  // A second answer with no model does not reopen it: closing it was the owner's choice.
  await emit({ type: 'model.list.result', models: [], defaultModel: '' });
  expect(labelsOf(tree)).not.toContain('Setup step Pick a model');

  await press(tree, 'Open get started');
  await press(tree, 'Setup step Pick a model');
  await waitFor(() => !labelsOf(tree).includes('Setup step Pick a model'));
  await unmount(tree);
});

test('a configured server never opens it', async () => {
  const tree = await renderApp();
  expect(labelsOf(tree)).not.toContain('Setup step Pick a model');
  await unmount(tree);
});
