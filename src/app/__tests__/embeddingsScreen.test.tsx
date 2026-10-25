/**
 * Settings → Embeddings: the model every consumer runs on, then one row per consumer that can
 * follow it, take its own, or be switched off. The server owns the truth; the page sends a choice
 * and draws the answer (server docs/memory.md, docs/services.md).
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { EmbeddingsScreen } from '../EmbeddingsScreen';
import { connection } from '../../core/connection';
import { servicesStore } from '../../core/services';
import { overlayStore } from '../../core/overlay';
import type {
  EmbeddingConsumerView,
  EmbeddingModelOption,
  ServiceView,
  ServicesResultFrame,
} from '../../core/protocol';

jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn(() => Promise.resolve()) },
}));

const GEMINI = { provider: 'gemini', id: 'gemini-embedding-001', label: 'Gemini Embedding 001' };
const NOMIC = {
  provider: 'synthetic',
  id: 'hf:nomic-ai/nomic-embed-text-v1.5',
  label: 'Nomic Embed Text',
};

function consumer(over: Partial<EmbeddingConsumerView> & Pick<EmbeddingConsumerView, 'id'>): EmbeddingConsumerView {
  return { active: false, own: false, ...over };
}

function frame(over: Partial<ServicesResultFrame> = {}): ServicesResultFrame {
  const embeddings: ServiceView = {
    id: 'embeddings',
    source: 'cloud',
    choices: ['off', 'cloud', 'self-hosted', 'url'],
    missing: [],
    health: 'up',
    model: GEMINI.id,
    provider: GEMINI.provider,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
  };
  return {
    type: 'services.result',
    install: 'native',
    services: [embeddings],
    embeddingModels: [GEMINI, NOMIC] as EmbeddingModelOption[],
    embeddingConsumers: [
      consumer({ id: 'recall', active: true, model: GEMINI.id, provider: GEMINI.provider }),
      consumer({ id: 'dedup', active: true, model: GEMINI.id, provider: GEMINI.provider }),
      consumer({ id: 'consolidate', active: true, model: GEMINI.id, provider: GEMINI.provider }),
      consumer({ id: 'import', active: true, model: GEMINI.id, provider: GEMINI.provider }),
      consumer({ id: 'skills', active: true, model: GEMINI.id, provider: GEMINI.provider }),
    ],
    ...over,
  };
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
    mounted = ReactTestRenderer.create(<EmbeddingsScreen onBack={() => {}} />);
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
  overlayStore.reset();
  jest.clearAllMocks();
});

test('asks the server on open and names the model everything runs on', () => {
  const tree = render();
  expect(sent()).toEqual([{ type: 'services.get' }]);
  ReactTestRenderer.act(() => servicesStore.replace(frame()));
  const body = texts(tree).join('\n');
  // The catalogue's label, not the wire id: a person reads "Gemini Embedding 001".
  expect(body).toContain('Gemini Embedding 001');
  // And each consumer says it follows, without repeating the model five times.
  expect(body).toContain('Memory recall');
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Make Memory recall follow the default again' })).toHaveLength(0);
});

test('a consumer with its own model offers the way back, and sends inherit', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({
        embeddingConsumers: [
          consumer({ id: 'recall', active: true, own: true, model: NOMIC.id, provider: NOMIC.provider }),
          consumer({ id: 'dedup', active: true, model: GEMINI.id, provider: GEMINI.provider }),
        ],
      }),
    ),
  );
  press(tree, 'Make Memory recall follow the default again');
  expect(sent()).toContainEqual({
    type: 'services.set',
    id: 'embeddings',
    source: 'cloud',
    consumer: 'recall',
    inherit: true,
  });
});

test('switching a consumer off sends the switch, and keeps its model', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({
        embeddingConsumers: [consumer({ id: 'skills', active: true, own: true, model: NOMIC.id, provider: NOMIC.provider })],
      }),
    ),
  );
  const toggle = tree.root.findByProps({ accessibilityLabel: 'Skill suggestions on' });
  ReactTestRenderer.act(() => toggle.props.onValueChange(false));
  expect(sent()).toContainEqual({
    type: 'services.set',
    id: 'embeddings',
    source: 'cloud',
    consumer: 'skills',
    enabled: false,
  });
});

test('a consumer that follows the default has a real switch, not a shortcut to the picker', () => {
  // Off means "this one stops embedding". Opening a model picker instead was a lie: the control
  // said switch and did choose.
  const tree = render();
  ReactTestRenderer.act(() => servicesStore.replace(frame()));
  (connection.send as jest.Mock).mockClear();
  const toggle = tree.root.findByProps({ accessibilityLabel: 'Duplicate check on' });
  ReactTestRenderer.act(() => toggle.props.onValueChange(false));
  expect(sent()).toEqual([{ type: 'services.set', id: 'embeddings', source: 'cloud', consumer: 'dedup', enabled: false }]);
  expect(overlayStore.getState().menu).toBeNull();
});

test('with no default model there is nothing to switch: every row is disabled', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({
        services: [
          { id: 'embeddings', source: 'off', choices: ['off', 'cloud', 'self-hosted', 'url'], missing: [], health: 'no-endpoint' },
        ],
        embeddingConsumers: [consumer({ id: 'recall' })],
      }),
    ),
  );
  expect(tree.root.findByProps({ accessibilityLabel: 'Memory recall on' }).props.disabled).toBe(true);
});

test('the default model is picked provider first, then model, and written without a consumer', () => {
  const tree = render();
  ReactTestRenderer.act(() => servicesStore.replace(frame()));
  press(tree, `Change the model every consumer runs on: ${GEMINI.label}`);
  // Two providers carry a model: the first sheet is theirs, and it says how many each has.
  const providers = overlayStore.getState().menu;
  expect(providers?.kind).toBe('sheet');
  const options = (providers as { options: Array<{ label: string; onPress: () => void }> }).options;
  expect(options.map(o => o.label)).toEqual(['gemini', 'synthetic']);

  ReactTestRenderer.act(() => options[1]!.onPress());
  // Synthetic serves one model: nothing more to choose, so it is sent straight away.
  expect(sent()).toContainEqual({
    type: 'services.set',
    id: 'embeddings',
    source: 'cloud',
    provider: 'synthetic',
    model: NOMIC.id,
  });
});

test('a consumer with its own model sends the consumer with the pick', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({ embeddingConsumers: [consumer({ id: 'recall', active: true, model: GEMINI.id, provider: GEMINI.provider })] }),
    ),
  );
  press(tree, 'Model for Memory recall');
  const sheet = overlayStore.getState().menu as { options: Array<{ label: string; onPress: () => void }> };
  ReactTestRenderer.act(() => sheet.options[1]!.onPress());
  expect(sent()).toContainEqual({
    type: 'services.set',
    id: 'embeddings',
    source: 'cloud',
    provider: 'synthetic',
    model: NOMIC.id,
    consumer: 'recall',
  });
});

test('turning the default off is one choice, and it is offered only when something is on', () => {
  const tree = render();
  ReactTestRenderer.act(() => servicesStore.replace(frame()));
  press(tree, 'Turn embeddings off');
  expect(sent()).toContainEqual({ type: 'services.set', id: 'embeddings', source: 'off' });

  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({
        services: [
          { id: 'embeddings', source: 'off', choices: ['off', 'cloud', 'self-hosted', 'url'], missing: [], health: 'no-endpoint' },
        ],
      }),
    ),
  );
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Turn embeddings off' })).toHaveLength(0);
});

test('no provider serves an embedding: the page says so instead of offering an empty picker', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({
        embeddingModels: [],
        embeddingConsumers: [],
        services: [
          { id: 'embeddings', source: 'off', choices: ['off', 'cloud', 'self-hosted', 'url'], missing: [], health: 'no-endpoint' },
        ],
      }),
    ),
  );
  const body = texts(tree).join('\n');
  expect(body).toContain('No provider of this install serves an embedding model');
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Choose the embedding model' })).toHaveLength(0);
});

test('the URL of a self-hosted model is shown, so a person knows where the work happens', () => {
  const tree = render();
  ReactTestRenderer.act(() =>
    servicesStore.replace(
      frame({
        services: [
          {
            id: 'embeddings',
            source: 'self-hosted',
            choices: ['off', 'cloud', 'self-hosted', 'url'],
            missing: [],
            health: 'up',
            model: 'Xenova/all-MiniLM-L6-v2',
          },
        ],
      }),
    ),
  );
  expect(texts(tree).join('\n')).toContain('Xenova/all-MiniLM-L6-v2');
});

test('a refusal from the server is shown on the page, not swallowed', () => {
  const tree = render();
  ReactTestRenderer.act(() => {
    servicesStore.replace(frame());
    servicesStore.fail('unknown embedding consumer: nope');
  });
  expect(texts(tree).join('\n')).toContain('unknown embedding consumer: nope');
});
