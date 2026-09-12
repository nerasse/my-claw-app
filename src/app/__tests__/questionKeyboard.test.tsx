/**
 * A free-text answer must be visible while it is typed.
 *
 * The form is not a row of the thread any more, and it cannot be: a form with its options and its
 * field is taller than what the keyboard leaves of the pane, and the thread is a scroll area where
 * a scroller inside the inverted list loses every drag to the list (docs/text-selection.md). It is
 * a surface of its own above the composer now, and it reveals its own field: Android stopped
 * revealing a focused input when the app went edge to edge, and it never scrolled a row of a
 * conversation into view either way.
 */

import React from 'react';
import { FlatList, ScrollView, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { QuestionCard } from '../../components/QuestionCard';
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

  it('draws the form above the composer, and out of the list', () => {
    const tree = render();
    const card = tree.root.findAllByType(QuestionCard)[0];
    if (!card) throw new Error('the pending question is nowhere on the chat screen');

    // Out of the list, or the thread would be its scroll area and would win every drag.
    for (let node: typeof card | null = card.parent; node; node = node.parent) {
      if (node.type === FlatList) throw new Error('the form is a row of the conversation again');
    }

    // Above the composer: drawn earlier in the column, which is what above means here.
    const order = tree.root.findAll(() => true);
    const composer = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Message to send',
    )[0];
    if (!composer) throw new Error('no composer to sit above');
    expect(order.indexOf(card)).toBeLessThan(order.indexOf(composer));

    act(() => tree.unmount());
  });

  it('reveals the field in the card, and leaves the thread where it is', () => {
    const tree = render();
    const list = tree.root.findAllByType(FlatList)[0];
    if (!list) throw new Error('no FlatList on the chat screen');
    const scrollToOffset = jest.fn();
    list.instance.scrollToOffset = scrollToOffset;

    press(tree, 'Type your own answer');
    const field = tree.root.findAllByType(TextInput)[0];
    if (!field) throw new Error('the free-text field did not open');

    // The card's own scroll area, found by walking up from the field it has to reveal.
    let body = field.parent;
    while (body && body.type !== ScrollView) body = body.parent;
    if (!body) throw new Error('the free-text field is in no scroll area');
    const scrollToEnd = jest.fn();
    body.instance.scrollToEnd = scrollToEnd;

    expect(scrollToEnd).not.toHaveBeenCalled();
    act(() => field.props.onFocus());
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(scrollToOffset).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });
});
