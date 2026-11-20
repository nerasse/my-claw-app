/**
 * A free-text answer must be visible while it is typed.
 *
 * The question card is at the bottom of an inverted list, under the composer and, once the field
 * takes focus, under the keyboard. Android used to reveal a focused input on its own: the app
 * draws edge to edge, so `adjustResize` never resizes the window and that never fires. Nothing
 * scrolled, and the owner typed into a field off screen.
 */

import React from 'react';
import { FlatList, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore } from '../../core/chat';
import { questionStore } from '../../core/questionStore';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'question-keyboard-thread';

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
  } as unknown as React.ComponentProps<typeof ChatScreen>;
}

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ChatScreen {...props()} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

/** Taps the row carrying a label, the way the owner does. */
function press(tree: TestRenderer.ReactTestRenderer, label: string): void {
  const hit = tree.root.find(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  act(() => hit.props.onPress());
}

describe('a pending question and the keyboard', () => {
  beforeEach(() => {
    questionStore.clear();
    chatStore.clearAll();
    chatStore.seedHistory(THREAD, [{ role: 'user', ts: '2026-01-01T00:00:01.000Z', id: 'h-1', text: 'bonjour' }]);
    questionStore.ask({
      type: 'question.ask',
      id: 'q-keyboard',
      threadId: THREAD,
      questions: [{ header: 'Where', question: 'Where to?', options: [{ label: 'Paris' }] }],
      ts: '2026-01-01T00:00:03.000Z',
    });
  });

  it('scrolls the thread back to the bottom when the free-text field takes focus', () => {
    const tree = render();
    const list = tree.root.findAllByType(FlatList)[0];
    if (!list) throw new Error('no FlatList on the chat screen');
    const scrollToOffset = jest.fn();
    // The ref the screen scrolls through: the pill beside this field uses the very same handle.
    list.instance.scrollToOffset = scrollToOffset;

    press(tree, 'Type your own answer');
    const field = tree.root.findAllByType(TextInput)[0];
    if (!field) throw new Error('the free-text field did not open');

    expect(scrollToOffset).not.toHaveBeenCalled();
    act(() => field.props.onFocus());
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });

    act(() => tree.unmount());
  });
});
