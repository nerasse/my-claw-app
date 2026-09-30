/**
 * The line at the bottom of the thread while a model call has produced nothing yet.
 *
 * It is the only thing on the screen through the wait -- the engines that think before they write
 * send nothing for twenty seconds or more -- and it has to leave the moment the turn produces
 * anything, or the thread would carry two stories at once.
 */
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore } from '../../core/chat';
import { questionStore } from '../../core/questionStore';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'thinking-thread';

const noop = (): void => {};

function props() {
  return {
    threadId: THREAD,
    title: 'A conversation',
    subtitle: '',
    connectionState: 'connected',
    mediaBase: 'http://localhost',
    deviceInfo: null,
    autoFocusHero: false,
    onOpenDrawer: noop,
    onStatusPress: noop,
    onSend: noop,
    locationEnabled: false,
    onBubbleMenu: noop,
    onOpenImage: noop,
    onOpenText: noop,
    onOpenVideo: noop,
    onOpenFile: noop,
    onOpenMenu: noop,
    onCommandEntered: () => false,
    streaming: false,
    onStop: noop,
    onQuestionReply: noop,
    onNewThread: noop,
    subagentDoors: new Map(),
    onLoadOlder: noop,
    loadingOlder: false,
  } as unknown as React.ComponentProps<typeof ChatScreen>;
}

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <ChatScreen {...props()} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function textsOf(tree: TestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap(node => (typeof node.props.children === 'string' ? [node.props.children] : []));
}

beforeEach(() => {
  questionStore.clear();
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, [{ role: 'user', ts: '2026-01-01T00:00:01.000Z', id: 'h-1', text: 'bonjour' }]);
});

afterEach(() => {
  chatStore.clearAll();
});

describe('the wait before a call produces anything', () => {
  it('is drawn at the bottom of the thread, with the wait it has been', () => {
    const tree = render();
    expect(textsOf(tree)).not.toContain('Thinking');

    act(() => {
      chatStore.setThinking(THREAD, Date.parse('2026-01-01T00:00:00.000Z'));
    });
    expect(textsOf(tree)).toContain('Thinking');
  });

  it('leaves the moment the turn produces anything', () => {
    const tree = render();
    act(() => {
      chatStore.setThinking(THREAD, Date.now());
    });
    expect(textsOf(tree)).toContain('Thinking');

    act(() => {
      chatStore.setThinking(THREAD, undefined);
    });
    expect(textsOf(tree)).not.toContain('Thinking');
  });
});
