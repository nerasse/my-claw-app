/**
 * A history page leaves a long reasoning on the server and says how long it is
 * (`reasoningChars`). The line still draws, asks only once it is opened, fills in when the answer
 * lands, and says so when the server no longer has it. A bubble that streamed its reasoning live
 * keeps it through the page that follows the run, without asking.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { ReasoningLine } from '../../components/ReasoningLine';
import { resetAsideExpansion } from '../asideExpansion';
import { knownReasoning, resetReasoningFetch, dropReasoningAsks } from '../reasoningFetch';
import { chatStore } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';

const THREAD = 't1';
const handlers = {} as ServerFrameHandlers;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

function render(props: React.ComponentProps<typeof ReasoningLine>): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <ReasoningLine {...props} />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children as string)
    .join(' ');
}

function toggle(tree: ReactTestRenderer.ReactTestRenderer): void {
  ReactTestRenderer.act(() => {
    tree.root.find(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function').props.onPress();
  });
}

const asks = (): unknown[] => mockSend.mock.calls.map(([frame]) => JSON.parse(frame));

beforeEach(() => {
  mockSend.mockClear();
  resetReasoningFetch();
  resetAsideExpansion();
  chatStore.clearAll();
});

afterEach(() => {
  ReactTestRenderer.act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

test('closed, it asks nothing; opened, it asks once, then shows what came back', () => {
  const tree = render({ id: 'p1', threadId: THREAD, reasoningChars: 4800, streaming: false, durationMs: 3000 });
  expect(texts(tree)).toContain('Reasoning');
  expect(mockSend).not.toHaveBeenCalled();

  toggle(tree);
  expect(asks()).toEqual([{ type: 'chat.reasoning', threadId: THREAD, id: 'p1' }]);
  expect(texts(tree)).toContain('loading…');

  // Closed and opened again before the answer: still one ask.
  toggle(tree);
  toggle(tree);
  expect(mockSend).toHaveBeenCalledTimes(1);

  ReactTestRenderer.act(() => {
    routeServerFrame({ type: 'chat.reasoning.result', threadId: THREAD, id: 'p1', reasoning: 'first this, then that', found: true }, handlers);
  });
  expect(texts(tree)).toContain('first this, then that');
  expect(knownReasoning(THREAD, 'p1')).toBe('first this, then that');
});

test('a bubble the server no longer holds says so, and is not asked again', () => {
  const tree = render({ id: 'p1', threadId: THREAD, reasoningChars: 4800, streaming: false });
  toggle(tree);
  ReactTestRenderer.act(() => {
    routeServerFrame({ type: 'chat.reasoning.result', threadId: THREAD, id: 'p1', reasoning: '', found: false }, handlers);
  });
  expect(texts(tree)).toContain('no longer available');
  toggle(tree);
  toggle(tree);
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('an ask lost with its socket is asked again on the next open', () => {
  const tree = render({ id: 'p1', threadId: THREAD, reasoningChars: 4800, streaming: false });
  toggle(tree);
  dropReasoningAsks();
  toggle(tree);
  toggle(tree);
  expect(mockSend).toHaveBeenCalledTimes(2);
});

test('an ask that never left is asked again on the next open', async () => {
  mockSend.mockImplementationOnce(() => Promise.reject(new Error('socket down')));
  const tree = render({ id: 'p1', threadId: THREAD, reasoningChars: 4800, streaming: false });
  toggle(tree);
  await ReactTestRenderer.act(async () => {});
  toggle(tree);
  toggle(tree);
  expect(mockSend).toHaveBeenCalledTimes(2);
});

test('the expand pref opens it, and so asks at once', () => {
  render({ id: 'p1', threadId: THREAD, reasoningChars: 4800, streaming: false, expandReasoning: true });
  expect(asks()).toEqual([{ type: 'chat.reasoning', threadId: THREAD, id: 'p1' }]);
});

test('a reasoning streamed live is kept when the page after the run carries only its length', () => {
  chatStore.startStream(THREAD, 'p1');
  chatStore.appendReasoning(THREAD, 'p1', 'thought live');
  chatStore.endStream(THREAD, 'p1');
  expect(knownReasoning(THREAD, 'p1')).toBe('thought live');

  const tree = render({ id: 'p1', threadId: THREAD, reasoningChars: 12, streaming: false, expandReasoning: true });
  expect(texts(tree)).toContain('thought live');
  expect(mockSend).not.toHaveBeenCalled();
});
