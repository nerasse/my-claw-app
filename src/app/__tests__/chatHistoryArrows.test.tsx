/**
 * The sent history, from a phone.
 *
 * A soft keyboard has no arrow keys, so the walk the desktop gets from Up and Down is offered as
 * the jump pill read the other way: a pair at the bottom left, one step older and one step newer.
 * It is drawn only where an arrow can actually land -- the field holds the caret and is either
 * empty or already shows a recalled message -- so a draft nobody asked to lose is never replaced.
 */
import React from 'react';
import { TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore } from '../../core/chat';
import { questionStore } from '../../core/questionStore';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'history-thread';
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

let mounted: TestRenderer.ReactTestRenderer | null = null;

function render(): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ChatScreen {...props()} />
      </ThemeContext.Provider>,
    );
  });
  mounted = tree;
  return tree;
}

function button(tree: TestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}

function focusField(tree: TestRenderer.ReactTestRenderer): void {
  const field = tree.root.findByType(TextInput);
  act(() => field.props.onFocus());
}

/** What the composer holds, read from its own value. */
function draftOf(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root.findByType(TextInput).props.value as string;
}

beforeEach(() => {
  questionStore.clear();
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, [
    { role: 'user', ts: '2026-01-01T00:00:01.000Z', id: 'h-1', text: 'premier' },
    { role: 'assistant', ts: '2026-01-01T00:00:02.000Z', id: 'h-2', text: 'réponse' },
    { role: 'user', ts: '2026-01-01T00:00:03.000Z', id: 'h-3', text: 'second' },
  ]);
});

afterEach(() => {
  if (mounted) act(() => mounted?.unmount());
  mounted = null;
  chatStore.clearAll();
});

test('the pair is not drawn before the field holds the caret', () => {
  const tree = render();
  expect(button(tree, 'Previous message')).toHaveLength(0);
});

test('Up walks back one sent message at a time, past the answer in between', () => {
  const tree = render();
  focusField(tree);
  expect(button(tree, 'Previous message')).toHaveLength(1);

  act(() => button(tree, 'Previous message')[0]!.props.onPress());
  expect(draftOf(tree)).toBe('second');

  act(() => button(tree, 'Previous message')[0]!.props.onPress());
  expect(draftOf(tree)).toBe('premier');
});

test('the double arrow walks forward and empties the field past the newest', () => {
  const tree = render();
  focusField(tree);
  act(() => button(tree, 'Previous message')[0]!.props.onPress());
  act(() => button(tree, 'Previous message')[0]!.props.onPress());
  expect(draftOf(tree)).toBe('premier');

  act(() => button(tree, 'Next message')[0]!.props.onPress());
  expect(draftOf(tree)).toBe('second');

  act(() => button(tree, 'Next message')[0]!.props.onPress());
  expect(draftOf(tree)).toBe('');
});

test('a draft the owner wrote takes the arrows away rather than lose the text', () => {
  const tree = render();
  focusField(tree);
  const field = tree.root.findByType(TextInput);
  act(() => field.props.onChangeText('moitié de phrase'));

  expect(draftOf(tree)).toBe('moitié de phrase');
  expect(button(tree, 'Previous message')).toHaveLength(0);
});

test('nothing to recall, nothing drawn: an empty thread offers no history', () => {
  chatStore.clearAll();
  const tree = render();
  focusField(tree);
  expect(button(tree, 'Previous message')).toHaveLength(0);
});
