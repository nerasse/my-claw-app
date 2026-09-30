/**
 * The wait before a model call produces anything, as the thread draws it.
 *
 * It lives in the bubble the call opened. The first version drew it at the foot of the thread,
 * outside every bubble, and the bubble it had opened stood beside it empty, wearing a bare caret:
 * a white bar at every turn (owner, 2026-09-30). So the test that matters is the one that looks at
 * the bubble, not at the line.
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

let mounted: TestRenderer.ReactTestRenderer | null = null;

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <ChatScreen {...props()} />
      </ThemeContext.Provider>,
    );
  });
  mounted = tree;
  return tree;
}

function textsOf(tree: TestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap(node => (typeof node.props.children === 'string' ? [node.props.children] : []));
}

const SINCE = Date.parse('2026-01-01T00:00:00.000Z');

function startWaiting(): void {
  chatStore.startStream(THREAD, 's1');
  chatStore.markWaiting(THREAD, 's1', SINCE);
}

beforeEach(() => {
  questionStore.clear();
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, [{ role: 'user', ts: '2026-01-01T00:00:01.000Z', id: 'h-1', text: 'bonjour' }]);
});

afterEach(() => {
  // The counter holds a one-second interval: left mounted it fires into the next test's console.
  if (mounted) act(() => mounted?.unmount());
  mounted = null;
  chatStore.clearAll();
});

describe('the wait before a call produces anything', () => {
  it('is drawn in the bubble the call opened, where its words will land', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    expect(textsOf(tree)).toContain('Thinking');
  });

  it('replaces the bare caret: no empty bar beside the line', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    // The regression: a bubble opened before it has anything to say drew its caret, one white bar
    // per turn, and the line stood somewhere else.
    expect(textsOf(tree)).not.toContain('▍');
  });

  it('is one line, however many turns went by', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    expect(textsOf(tree).filter(text => text === 'Thinking')).toHaveLength(1);
  });

  it('leaves the moment the turn writes anything, and the words take its place', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    act(() => {
      chatStore.appendDelta(THREAD, 's1', 'Bonjour');
    });
    expect(textsOf(tree)).not.toContain('Thinking');
  });

  it('gives way to the reasoning line when the engine sends any', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    act(() => {
      chatStore.appendReasoning(THREAD, 's1', '**Weighing options**');
    });
    expect(textsOf(tree)).not.toContain('Thinking');
    expect(textsOf(tree)).not.toContain('▍');
  });

  it('vanishes with its bubble when the call went straight to a tool', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    act(() => {
      chatStore.endStream(THREAD, 's1');
    });
    expect(textsOf(tree)).not.toContain('Thinking');
    expect(textsOf(tree)).not.toContain('▍');
  });
});
