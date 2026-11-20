/**
 * Typing in the composer must not re-render the conversation.
 *
 * `VirtualizedList` is a `PureComponent`: hand it identical props and it does not re-render at
 * all. `renderItem` was an inline arrow and the header and footer were inline elements, so those
 * three props were fresh on every render of this screen -- and the draft lives here, so every
 * keystroke re-rendered every mounted bubble of the thread.
 */

import React from 'react';
import { FlatList, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore } from '../../core/chat';
import { questionStore } from '../../core/questionStore';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'stability-thread';

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

function render(over: Partial<React.ComponentProps<typeof ChatScreen>> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ChatScreen {...props()} {...over} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

/** The props FlatList compares by identity when it decides whether to re-render. */
function listProps(tree: TestRenderer.ReactTestRenderer) {
  const list = tree.root.findAllByType(FlatList)[0];
  if (!list) throw new Error('no FlatList on the chat screen');
  return {
    renderItem: list.props.renderItem,
    header: list.props.ListHeaderComponent,
    footer: list.props.ListFooterComponent,
    data: list.props.data,
  };
}

/** The composer, which is the last text field on the screen. */
function composer(tree: TestRenderer.ReactTestRenderer) {
  const fields = tree.root.findAllByType(TextInput);
  const field = fields[fields.length - 1];
  if (!field) throw new Error('no composer on the chat screen');
  return field;
}

describe('the conversation list and the draft', () => {
  beforeEach(() => {
    questionStore.clear();
    chatStore.clearAll();
    chatStore.seedHistory(THREAD, [
      { role: 'user', ts: '2026-01-01T00:00:01.000Z', id: 'h-1', text: 'bonjour' },
      { role: 'assistant', ts: '2026-01-01T00:00:02.000Z', id: 'h-2', text: 'salut' },
    ]);
  });

  it('hands the list the same props after a keystroke, so no bubble re-renders', () => {
    // Both slots hold a real element here. With an empty question list and no page in flight they
    // are both `null`, and `null === null` would let an inline element pass for a stable one.
    questionStore.ask({
      type: 'question.ask',
      id: 'q-loose',
      threadId: THREAD,
      questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }],
      ts: '2026-01-01T00:00:03.000Z',
    });
    chatStore.setPageLoading(THREAD, true);
    const tree = render();
    const before = listProps(tree);

    act(() => {
      composer(tree).props.onChangeText('je tape un message');
    });

    const after = listProps(tree);
    expect(after.renderItem).toBe(before.renderItem);
    expect(after.header).toBe(before.header);
    expect(after.footer).toBe(before.footer);
    expect(after.data).toBe(before.data);

    act(() => tree.unmount());
  });

  it('still hands it a new list when the conversation actually moves', () => {
    const tree = render();
    const before = listProps(tree);

    act(() => {
      chatStore.addUserMessage(THREAD, 'm-new', 'une vraie nouvelle ligne');
    });

    expect(listProps(tree).data).not.toBe(before.data);

    act(() => tree.unmount());
  });
});
