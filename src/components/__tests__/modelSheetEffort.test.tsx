import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ModelSheet, pickerStart, type PickerState } from '../ModelSheet';

/**
 * Which model decides that the effort step exists.
 *
 * Measured on 2026-09-11: the owner's thread ran `opencode_go/deepseek-flash`, a model whose
 * provider table carries no effort ladder, so the server answered `supported: false`. The sheet
 * read that flag *once*, from the model in force, and dropped the step for the whole flow -- so
 * picking a model with a ladder of its own (Fable 5.1, six rungs) offered no step at all. The pin
 * belongs to the session; the ladder belongs to the subject.
 */

jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../../core/model', () => {
  const catalog = [
    // The model in force: no ladder anywhere in its table. This is the flag the sheet must stop
    // reading as if it were a property of the flow.
    { id: 'opencode_go/deepseek-flash', label: 'deepseek-flash' },
    { id: 'anthropic/claude-fable-5-1', label: 'Fable 5.1', effortLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  ];
  return {
    endpointOf: (id: string) => (id.includes('@') ? id.slice(id.lastIndexOf('@')) : null),
    withoutEndpoint: (id: string) => (id.includes('@') ? id.slice(0, id.lastIndexOf('@')) : id),
    useModelCatalog: () => ({ models: catalog, defaultModel: 'opencode_go/deepseek-flash' }),
    useModelIndex: () => new Map(catalog.map(model => [model.id, model])),
    useThreadModel: () => ({
      model: 'opencode_go/deepseek-flash',
      defaultModel: 'tag:Cheap',
      effort: {
        level: (globalThis as unknown as { __pin?: string }).__pin ?? '',
        levels: [],
        supported: false,
      },
    }),
    useModelEndpoints: () => ({ pending: false, endpoints: [] }),
  };
});

/** The rows the sheet is showing, read off the sheet itself rather than off a rendered tree. */
jest.mock('../ActionSheet', () => ({
  ActionSheet: (props: { options?: unknown }) => {
    (globalThis as unknown as { __sheetOptions?: unknown }).__sheetOptions = props.options;
    return null;
  },
}));

interface SheetOption {
  label: string;
  onPress: () => void;
}

function options(): SheetOption[] {
  return ((globalThis as unknown as { __sheetOptions?: SheetOption[] }).__sheetOptions ?? []) as SheetOption[];
}

/** The level the thread already pins, as `model.result` would have reported it. */
function setPin(level: string): void {
  (globalThis as unknown as { __pin?: string }).__pin = level;
}

beforeEach(() => setPin(''));

function mount(): { press: (label: string) => void; stage: () => string; labels: () => string[] } {
  let state: PickerState = pickerStart;

  function Probe(): React.JSX.Element {
    const [current, setCurrent] = React.useState<PickerState>(pickerStart);
    state = current;
    return <ModelSheet threadId="t1" state={current} onStateChange={setCurrent} onClose={() => {}} />;
  }

  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });

  return {
    labels: () => options().map(option => option.label),
    press: label => {
      const row = options().find(option => option.label === label);
      if (!row) throw new Error(`no row labelled ${label} in ${options().map(o => o.label).join(', ')}`);
      ReactTestRenderer.act(() => row.onPress());
    },
    stage: () => (state as { stage: string }).stage,
  };
}

test('the ladder of the model being picked decides, not the one in force', () => {
  const sheet = mount();
  expect(sheet.stage()).toBe('model');
  sheet.press('Fable 5.1');
  expect(sheet.stage()).toBe('effort');
  // The step is not merely opened: the six rungs of the subject are what it offers, and the pin of
  // the thread in force is what 'default (inherit)' means.
  expect(sheet.labels()).toEqual(expect.arrayContaining(['none (no reasoning)', 'low', 'medium', 'high', 'xhigh', 'max']));
  expect(sheet.labels()).toContain('default (inherit)');
});

test('a subject with no ladder of its own, and no pin, still skips the step', () => {
  const sheet = mount();
  sheet.press('deepseek-flash');
  expect(sheet.stage()).not.toBe('effort');
});

test('a pinned level keeps the step on a model that cannot express one, so it stays removable', () => {
  // The pin belongs to the session, not to the model: it is dead weight on a subject with no
  // ladder, and reading the ladder to decide the step is what would make it impossible to clear.
  setPin('high');
  const sheet = mount();
  sheet.press('deepseek-flash');
  expect(sheet.stage()).toBe('effort');
  expect(sheet.labels()).toContain('default (inherit)');
});
