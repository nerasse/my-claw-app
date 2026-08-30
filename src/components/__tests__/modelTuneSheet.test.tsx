import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ModelTuneSheet } from '../ModelTuneSheet';
import { modelStore } from '../../core/model';
import { connection } from '../../core/connection';

jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn().mockResolvedValue(true) },
}));

const send = connection.send as jest.Mock;

function mount(thread: Parameters<typeof modelStore.replaceThread>[0]) {
  modelStore.replaceCatalog({
    type: 'model.list.result',
    models: [
      { id: 'claude-opus-5', label: 'Opus 5', context: 1_000_000 },
    ],
    defaultModel: 'claude-opus-5',
  });
  modelStore.replaceThread(thread);

  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ModelTuneSheet threadId="t1" onClose={() => {}} />,
    );
  });

  const labels = () => {
    const texts = tree.root.findAllByType(Text);
    return texts.map(node => node.props.children).flat().filter(Boolean).map(String);
  };
  const press = (label: string) => {
    const nodes = tree.root.findAll(
      node =>
        node.type === Text && String(node.props.children) === label,
    );
    if (nodes.length === 0) throw new Error(`no row ${label}`);
    // The pressable rows hold their label in a Text child; walk up to the Pressable.
    let current: ReactTestRenderer.ReactTestInstance | null = nodes[0]!;
    while (current && typeof current.props.onPress !== 'function') {
      current = current.parent;
    }
    ReactTestRenderer.act(() => current?.props.onPress());
  };
  return {
    labels,
    press,
    unmount: () => ReactTestRenderer.act(() => tree.unmount()),
  };
}

beforeEach(() => {
  send.mockClear();
});

test('the tune sheet lists effort levels and the full window', () => {
  const sheet = mount({
    type: 'model.result',
    threadId: 't1',
    model: 'claude-opus-5',
    defaultModel: 'claude-opus-5',
    effort: { level: 'medium', levels: ['low', 'medium', 'high'], supported: true },
    context: { raw: 1_000_000, effective: 1_000_000 },
  });

  const labels = sheet.labels().join(' | ');
  expect(labels).toContain('low');
  expect(labels).toContain('medium');
  expect(labels).toContain('high');
  expect(labels).toContain('default (inherit)');
  expect(labels).toContain('Full: 1.0M');
  sheet.unmount();
});

test('picking an effort level sends model.effort.set and closes', () => {
  const onClose = jest.fn();
  modelStore.replaceCatalog({
    type: 'model.list.result',
    models: [{ id: 'claude-opus-5', label: 'Opus 5', context: 1_000_000 }],
    defaultModel: 'claude-opus-5',
  });
  modelStore.replaceThread({
    type: 'model.result',
    threadId: 't1',
    model: 'claude-opus-5',
    defaultModel: 'claude-opus-5',
    effort: { level: 'medium', levels: ['low', 'medium', 'high'], supported: true },
    context: { raw: 1_000_000, effective: 1_000_000 },
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<ModelTuneSheet threadId="t1" onClose={onClose} />);
  });
  const nodes = tree.root.findAll(
    node => node.type === Text && String(node.props.children) === 'high',
  );
  expect(nodes.length).toBeGreaterThan(0);
  let current: ReactTestRenderer.ReactTestInstance | null = nodes[0]!;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  ReactTestRenderer.act(() => current?.props.onPress());
  expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'model.effort.set', threadId: 't1', level: 'high' }));
  expect(onClose).toHaveBeenCalled();
  ReactTestRenderer.act(() => tree.unmount());
});

test('picking a context ceiling sends model.context.set', () => {
  const onClose = jest.fn();
  modelStore.replaceCatalog({
    type: 'model.list.result',
    models: [{ id: 'claude-opus-5', label: 'Opus 5', context: 1_000_000 }],
    defaultModel: 'claude-opus-5',
  });
  modelStore.replaceThread({
    type: 'model.result',
    threadId: 't1',
    model: 'claude-opus-5',
    defaultModel: 'claude-opus-5',
    effort: { level: 'medium', levels: ['low', 'medium', 'high'], supported: true },
    context: { raw: 1_000_000, effective: 1_000_000 },
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<ModelTuneSheet threadId="t1" onClose={onClose} />);
  });
  const nodes = tree.root.findAll(
    node => node.type === Text && String(node.props.children) === '256k',
  );
  expect(nodes.length).toBeGreaterThan(0);
  let current: ReactTestRenderer.ReactTestInstance | null = nodes[0]!;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  ReactTestRenderer.act(() => current?.props.onPress());
  expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'model.context.set', threadId: 't1', choice: 256_000 }));
  expect(onClose).toHaveBeenCalled();
  ReactTestRenderer.act(() => tree.unmount());
});
