/**
 * The Services page: every optional service, where it runs, and the key or URL it still needs.
 * The server owns the truth (docs/services.md in the server repo); the page sends a choice and
 * draws the answer.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { ServicesScreen } from '../ServicesScreen';
import { connection } from '../../core/connection';
import { servicesStore } from '../../core/services';
import { providersEnvStore } from '../../core/providers';
import type { ServicesResultFrame, ServiceView } from '../../core/protocol';

jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn(() => Promise.resolve()) },
}));

function view(over: Partial<ServiceView> & Pick<ServiceView, 'id'>): ServiceView {
  return { source: 'cloud', choices: ['cloud', 'self-hosted', 'url'], missing: [], health: 'no-endpoint', ...over };
}

function frame(services: ServiceView[], install: ServicesResultFrame['install'] = 'native'): ServicesResultFrame {
  return { type: 'services.result', install, services };
}

function sent(): Array<Record<string, unknown>> {
  return (connection.send as jest.Mock).mock.calls.map(([text]) => JSON.parse(text as string) as Record<string, unknown>);
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

let mounted: ReactTestRenderer.ReactTestRenderer | null = null;
function render(): ReactTestRenderer.ReactTestRenderer {
  ReactTestRenderer.act(() => {
    mounted = ReactTestRenderer.create(<ServicesScreen onBack={() => {}} />);
  });
  return mounted!;
}

function press(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  ReactTestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: label }).props.onPress());
}

afterEach(() => {
  if (mounted) ReactTestRenderer.act(() => mounted?.unmount());
  mounted = null;
  servicesStore.reset();
  providersEnvStore.reset();
  jest.clearAllMocks();
});

test('asks the server on open, and draws each service with the source it is on', () => {
  const tree = render();
  expect(sent()).toEqual([{ type: 'services.get' }]);
  ReactTestRenderer.act(() => servicesStore.replace(frame([view({ id: 'stt' }), view({ id: 'search', source: 'off', choices: ['off', 'url'] })])));
  const stt = tree.root.findByProps({ accessibilityLabel: 'Speech-to-text: Cloud' });
  expect(stt.props.accessibilityState).toEqual({ selected: true });
  expect(tree.root.findByProps({ accessibilityLabel: 'Web search: Off' }).props.accessibilityState).toEqual({ selected: true });
  // Search cannot be self-hosted on bare metal: the server did not offer it, the page does not either.
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Web search: This server' })).toHaveLength(0);
});

test('a source is sent as it is tapped; a URL only once it is typed and saved', () => {
  const tree = render();
  ReactTestRenderer.act(() => servicesStore.replace(frame([view({ id: 'stt' })])));
  press(tree, 'Speech-to-text: This server');
  expect(sent()).toContainEqual({ type: 'services.set', id: 'stt', source: 'self-hosted' });

  ReactTestRenderer.act(() => servicesStore.replace(frame([view({ id: 'stt' })])));
  (connection.send as jest.Mock).mockClear();
  press(tree, 'Speech-to-text: My URL');
  expect(sent()).toEqual([]);
  const field = tree.root.findByProps({ accessibilityLabel: 'Speech-to-text URL' });
  ReactTestRenderer.act(() => field.props.onChangeText(' http://stt.lan:9000 '));
  press(tree, 'Save Speech-to-text URL');
  expect(sent()).toEqual([{ type: 'services.set', id: 'stt', source: 'url', url: 'http://stt.lan:9000' }]);
});

test('a missing key is pasted on the card and goes to .env, then the page asks again', () => {
  const tree = render();
  ReactTestRenderer.act(() => servicesStore.replace(frame([view({ id: 'stt', missing: ['GROQ_API_KEY'] })])));
  const field = tree.root.findByType(TextInput);
  expect(field.props.secureTextEntry).toBe(true);
  ReactTestRenderer.act(() => field.props.onChangeText('gsk_123'));
  press(tree, 'Save GROQ_API_KEY');
  expect(sent()).toContainEqual({ type: 'providers.env.set', name: 'GROQ_API_KEY', value: 'gsk_123' });

  (connection.send as jest.Mock).mockClear();
  ReactTestRenderer.act(() => providersEnvStore.receive({ names: ['GROQ_API_KEY'], present: ['GROQ_API_KEY'], usedBy: {} }));
  expect(sent()).toEqual([{ type: 'services.get' }]);
});

test('a compose engine that does not answer says how to start it; a refusal is said on the page', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(frame([view({ id: 'stt', source: 'self-hosted', endpoint: 'http://whisper:8000', health: 'down' })], 'compose')),
  );
  expect(texts(tree).some(t => t.includes('--profile whisper up -d'))).toBe(true);
  expect(texts(tree).some(t => t.includes('not answering'))).toBe(true);
  ReactTestRenderer.act(() => servicesStore.fail('an http(s) URL is needed'));
  expect(texts(tree)).toContain('an http(s) URL is needed');
});

test('an engine downloading says so and the page asks again until it is done; one not in use can be freed', () => {
  jest.useFakeTimers();
  try {
    const tree = render();
    ReactTestRenderer.act(() =>
      servicesStore.replace(frame([view({ id: 'stt', source: 'self-hosted', local: { state: 'installing', bytes: 120_000_000 } })])),
    );
    expect(texts(tree).some(t => t.includes('Downloading the local engine'))).toBe(true);
    (connection.send as jest.Mock).mockClear();
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(sent()).toEqual([{ type: 'services.get' }]);
    // In use: its files are not offered for removal.
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Free Speech-to-text files' })).toHaveLength(0);

    ReactTestRenderer.act(() => servicesStore.replace(frame([view({ id: 'stt', source: 'cloud', local: { state: 'idle', bytes: 3_600_000_000 } })])));
    (connection.send as jest.Mock).mockClear();
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(9000);
    });
    expect(sent()).toEqual([]);
    expect(texts(tree)).toContain('Free 3.6 GB on the server');
    press(tree, 'Free Speech-to-text files');
    expect(sent()).toEqual([{ type: 'services.free', id: 'stt' }]);
  } finally {
    jest.useRealTimers();
  }
});
