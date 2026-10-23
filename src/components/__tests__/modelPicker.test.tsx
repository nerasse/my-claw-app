import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { useModelPickerFlow, pickerStart, type PickerState } from '../ModelSheet';
import { modelStore } from '../../core/model';
import { connection } from '../../core/connection';
import type { ModelOption } from '../../core/protocol';

/**
 * The routing step of the model picker. A model served by several providers is picked, then the
 * route under it: the pin travels inside the model reference, so nothing else in the flow has to
 * know it exists, and every catalogue lookup has to look past it.
 */

jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn().mockResolvedValue(true) },
}));

const send = connection.send as jest.Mock;

const MODELS: ModelOption[] = [
  { id: 'openrouter/openai/gpt-5.6-luna', label: 'gpt-5.6-luna', group: 'OpenRouter', routes: true },
  { id: 'zen/gpt-5.6-luna', label: 'gpt-5.6-luna', group: 'OpenCode Go' },
];

const CONTEXT_MODEL: ModelOption = {
  id: 'context/model',
  label: 'Context model',
  context: 262_000,
};

interface Harness {
  state: PickerState;
  labels: () => string[];
  hint: (label: string) => string | undefined;
  selected: () => string[];
  press: (label: string) => void;
  preview: () => string;
  input: () => ReactTestRenderer.ReactTestInstance | null;
  committed: Array<{ model: string; context?: number | 'full' }>;
  unmount: () => void;
}

function mount(
  activeId: string,
  models: ModelOption[] = MODELS,
  context: Parameters<typeof useModelPickerFlow>[0]['context'] = null,
  effort: Parameters<typeof useModelPickerFlow>[0]['effort'] = null,
): Harness {
  let flow!: ReturnType<typeof useModelPickerFlow>;
  const harness: Harness = {
    state: pickerStart,
    labels: () => flow.options.map(option => option.label),
    hint: label => flow.options.find(option => option.label === label)?.hint,
    selected: () => flow.options.filter(option => option.selected).map(option => option.label),
    preview: () => flow.preview,
    input: () => {
      const inputs = tree.root.findAllByType(TextInput);
      return inputs[0] ?? null;
    },
    press: label => {
      const option = flow.options.find(entry => entry.label === label);
      if (!option) throw new Error(`no row labelled ${label} in ${flow.options.map(o => o.label).join(', ')}`);
      ReactTestRenderer.act(() => option.onPress());
    },
    committed: [],
    unmount: () => {},
  };

  function Probe(): React.JSX.Element {
    const [state, setState] = React.useState<PickerState>(pickerStart);
    harness.state = state;
    flow = useModelPickerFlow({
      title: 'Model',
      models,
      activeId,
      state,
      onStateChange: setState,
      onCommit: choice => harness.committed.push(choice),
      onClose: () => {},
      context,
      effort,
    });
    return flow.customContextInput ? (
      <TextInput
        value={flow.customContextInput.value}
        onChangeText={flow.customContextInput.onChange}
        keyboardType={flow.customContextInput.keyboardType}
        returnKeyType={flow.customContextInput.returnKeyType}
      />
    ) : (
      <Text>probe</Text>
    );
  }

  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe />);
  });
  harness.unmount = () => ReactTestRenderer.act(() => tree.unmount());
  return harness;
}

beforeEach(() => {
  send.mockClear();
  modelStore.replaceCatalog({ type: 'model.list.result', models: MODELS, defaultModel: 'zen/gpt-5.6-luna' });
});

test('a routable model asks for its routes, once the step is open and not before', () => {
  const picker = mount('zen/gpt-5.6-luna');
  picker.press('OpenRouter ›');
  expect(send).not.toHaveBeenCalled();

  picker.press('gpt-5.6-luna');
  expect(picker.state.stage).toBe('endpoint');
  expect(JSON.parse(send.mock.calls[0][0])).toEqual({
    type: 'model.endpoints',
    model: 'openrouter/openai/gpt-5.6-luna',
    // The ordering rides with the ask: the server sorts, so every surface reads one model's
    // providers in the same order.
    sort: 'price',
  });
  // Nothing is answered yet: the step says so rather than showing an empty list as a fact.
  expect(picker.labels()).toContain('loading routes...');

  ReactTestRenderer.act(() => {
    modelStore.replaceEndpoints({
      type: 'model.endpoints.result',
      model: 'openrouter/openai/gpt-5.6-luna',
      endpoints: [
        { id: 'openrouter/openai/gpt-5.6-luna@azure', label: 'Azure (azure)', promptUsd: 0.15, completionUsd: 0.6, context: 128_000, uptime30m: 99.96 },
        { id: 'openrouter/openai/gpt-5.6-luna@openai', label: 'OpenAI (openai)', promptUsd: 0.2, completionUsd: 0.8, degraded: true },
      ],
    });
  });
  // The orderings sit between the routes and Back: what the list holds, then how it is sorted.
  expect(picker.labels()).toEqual([
    'Automatic', 'Azure (azure)', 'OpenAI (openai)',
    'Sort by price', 'Sort by context', 'Sort by output', 'Sort by uptime',
    '< Back',
  ]);
  expect(picker.hint('Azure (azure)')).toBe('$0.150 in / $0.600 out per Mtok · 128k ctx · 100.0% up');
  expect(picker.hint('OpenAI (openai)')).toBe('degraded · $0.200 in / $0.800 out per Mtok');
  picker.unmount();
});

test('the picked route rides inside the reference the server is asked to run', () => {
  modelStore.replaceEndpoints({
    type: 'model.endpoints.result',
    model: 'openrouter/openai/gpt-5.6-luna',
    endpoints: [{ id: 'openrouter/openai/gpt-5.6-luna@azure', label: 'Azure (azure)' }],
  });
  const picker = mount('zen/gpt-5.6-luna');
  picker.press('OpenRouter ›');
  picker.press('gpt-5.6-luna');
  picker.press('Azure (azure)');

  // The last decision applies: there is no Apply screen between the pick and the server.
  expect(picker.committed).toEqual([{ model: 'openrouter/openai/gpt-5.6-luna@azure' }]);
  picker.unmount();
});

test('automatic is a choice of its own, and it is the one marked when nothing is pinned', () => {
  modelStore.replaceEndpoints({
    type: 'model.endpoints.result',
    model: 'openrouter/openai/gpt-5.6-luna',
    endpoints: [{ id: 'openrouter/openai/gpt-5.6-luna@azure', label: 'Azure (azure)' }],
  });
  const picker = mount('openrouter/openai/gpt-5.6-luna@azure');
  picker.press('OpenRouter ›');
  // The pinned model is still the one marked in the list: the pin is a route on top of it.
  expect(picker.selected()).toEqual(['gpt-5.6-luna']);

  picker.press('gpt-5.6-luna');
  expect(picker.selected()).toEqual(['Azure (azure)']);
  picker.press('Automatic');
  expect(picker.committed).toEqual([{ model: 'openrouter/openai/gpt-5.6-luna' }]);
  picker.unmount();
});

test('a model with a single route never shows the step, and picking it applies at once', () => {
  const picker = mount('openrouter/openai/gpt-5.6-luna');
  picker.press('OpenCode Go ›');
  picker.press('gpt-5.6-luna');
  expect(picker.committed).toEqual([{ model: 'zen/gpt-5.6-luna' }]);
  expect(picker.labels()).not.toContain('Apply');
  expect(send).not.toHaveBeenCalled();
  picker.unmount();
});

test('back walks out of the routing step the way it walked in', () => {
  const picker = mount('zen/gpt-5.6-luna');
  picker.press('OpenRouter ›');
  picker.press('gpt-5.6-luna');
  expect(picker.state.stage).toBe('endpoint');
  picker.press('< Back');
  expect(picker.state.stage).toBe('model');
  expect(picker.state.path).toEqual(['OpenRouter']);
  picker.unmount();
});

test('a custom context ceiling is validated, and the last step applies it', () => {
  const picker = mount('context/model', [CONTEXT_MODEL], { current: 'full' });
  picker.press('Context model');
  expect(picker.state.stage).toBe('context');
  picker.press('Custom…');
  expect(picker.state.stage).toBe('context-custom');
  expect(picker.labels()).toContain('Enter a valid token ceiling');

  const input = picker.input();
  expect(input?.props.keyboardType).toBe('number-pad');
  ReactTestRenderer.act(() => input?.props.onChangeText('128k000'));
  expect(picker.state.contextDraft).toBe('128000');
  expect(picker.labels()).toContain('Use 128k tokens');

  picker.press('Use 128k tokens');
  expect(picker.committed).toEqual([{ model: 'context/model', context: 128_000 }]);
  picker.unmount();
});

test('a custom context cannot exceed the known model window', () => {
  const picker = mount('context/model', [CONTEXT_MODEL], { current: 'full' });
  picker.press('Context model');
  picker.press('Custom…');
  const input = picker.input();
  ReactTestRenderer.act(() => input?.props.onChangeText('262001'));
  expect(picker.labels()).toContain('Enter a valid token ceiling');
  picker.press('Enter a valid token ceiling');
  expect(picker.state.stage).toBe('context-custom');
  picker.unmount();
});

test('a pinned reference is named by its model and its route, never by the raw string', () => {
  expect(modelStore.catalogModel('openrouter/openai/gpt-5.6-luna@azure')).toBe('gpt-5.6-luna @ azure');
  expect(modelStore.catalogModel('zen/gpt-5.6-luna')).toBe('gpt-5.6-luna');
  expect(modelStore.catalogModel('unknown/model')).toBe('unknown/model');
});

test('a tag is indivisible: no effort step, no context step, and it applies on the tap', () => {
  const TAG_MODELS: ModelOption[] = [
    { id: 'tag:opus', label: 'opus', group: 'Tags' },
    { id: 'tag:fast', label: 'fast', group: 'Tags' },
    { id: 'context/model', label: 'Context model', context: 262_000 },
  ];
  const picker = mount('context/model', TAG_MODELS, {});

  picker.press('Tags ›');
  picker.press('opus');

  expect(picker.committed).toEqual([{ model: 'tag:opus' }]);
  expect(picker.labels()).not.toContain('Apply');
  picker.unmount();
});

test('a tag drops any effort or window staged for the previous model', () => {
  const TAG_MODELS: ModelOption[] = [
    { id: 'tag:opus', label: 'opus', group: 'Tags' },
    { id: 'context/model', label: 'Context model', context: 262_000, effortLevels: ['low', 'high'] },
  ];
  const picker = mount('context/model', TAG_MODELS, {}, { current: '' });

  // The step picks both pins for the staged model: effort first, then the window, and the window
  // is the last decision, so it applies as it is picked.
  picker.press('Context model');
  expect(picker.state.stage).toBe('effort');
  picker.press('high');
  expect(picker.state.stage).toBe('context');
  picker.press('64k');
  expect(picker.committed).toEqual([{ model: 'context/model', effort: 'high', context: 64_000 }]);

  // Back to the model list (the harness keeps the flow open where the app would have closed it),
  // then the tag: the pins staged for the previous model must not ride along.
  picker.press('< Back');
  picker.press('< Back');

  picker.press('Tags ›');
  picker.press('opus');
  expect(picker.committed).toEqual([
    { model: 'context/model', effort: 'high', context: 64_000 },
    { model: 'tag:opus' },
  ]);
  picker.unmount();
});
