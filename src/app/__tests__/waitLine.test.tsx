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
import { WAIT_REVEAL_MS } from '../../components/WaitLine';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'wait-thread';

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
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
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

/** Bubbles drawn: each carries one ⋯ button. */
function actions(tree: TestRenderer.ReactTestRenderer): number {
  return tree.root.findAll(node => node.props.accessibilityLabel === 'Message actions' && typeof node.props.onPress === 'function').length;
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
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('says nothing while the wait is short: a model that thinks out loud answers in a second', () => {
    const tree = render();
    act(() => {
      chatStore.startStream(THREAD, 's1');
      chatStore.markWaiting(THREAD, 's1', Date.now());
    });
    // Neither the line nor the caret: a wait too short to be worth a line is a flicker, and the
    // owner read it as "Thinking written before the model even thought" (2026-09-30).
    expect(textsOf(tree)).not.toContain('wait');
    expect(textsOf(tree)).not.toContain('▍');
    // Nor the bubble itself: an empty frame with its clock and its ⋯ is what was left once the
    // caret had gone (2026-10-04). Only the owner's message is drawn.
    expect(actions(tree)).toBe(1);

    act(() => {
      jest.advanceTimersByTime(WAIT_REVEAL_MS - 200);
    });
    expect(textsOf(tree)).not.toContain('wait');
    expect(actions(tree)).toBe(1);

    // Once the line is due, the bubble comes with it.
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(textsOf(tree)).toContain('wait');
    expect(actions(tree)).toBe(2);
  });

  it('the first token draws the bubble at once, without waiting for the line', () => {
    const tree = render();
    act(() => {
      chatStore.startStream(THREAD, 's1');
      chatStore.markWaiting(THREAD, 's1', Date.now());
    });
    expect(actions(tree)).toBe(1);
    act(() => {
      chatStore.appendDelta(THREAD, 's1', 'Bonjour');
    });
    expect(actions(tree)).toBe(2);
  });

  it('appears once the silence is real, counting from the call', () => {
    const tree = render();
    act(() => {
      chatStore.startStream(THREAD, 's1');
      chatStore.markWaiting(THREAD, 's1', Date.now() - WAIT_REVEAL_MS);
    });
    // The call began before the window drew it: the line is there at once, and its counter is the
    // call's own age rather than zero.
    expect(textsOf(tree)).toContain('wait');
    expect(textsOf(tree)).toContain('3 s');
  });

  it('never appears for a wait that ends first, and leaves no bar behind', () => {
    const tree = render();
    act(() => {
      chatStore.startStream(THREAD, 's1');
      chatStore.markWaiting(THREAD, 's1', Date.now());
    });
    act(() => {
      jest.advanceTimersByTime(WAIT_REVEAL_MS - 200);
    });
    act(() => {
      chatStore.appendReasoning(THREAD, 's1', '**Weighing options**');
    });
    act(() => {
      jest.advanceTimersByTime(WAIT_REVEAL_MS * 2);
    });
    expect(textsOf(tree)).not.toContain('wait');
    expect(textsOf(tree)).not.toContain('▍');
  });

  it('is drawn in the bubble the call opened, where its words will land', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    expect(textsOf(tree)).toContain('wait');
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
    expect(textsOf(tree).filter(text => text === 'wait')).toHaveLength(1);
  });

  it('leaves the moment the turn writes anything, and the words take its place', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    act(() => {
      chatStore.appendDelta(THREAD, 's1', 'Bonjour');
    });
    expect(textsOf(tree)).not.toContain('wait');
  });

  it('gives way to the reasoning line when the engine sends any', () => {
    const tree = render();
    act(() => {
      startWaiting();
    });
    act(() => {
      chatStore.appendReasoning(THREAD, 's1', '**Weighing options**');
    });
    expect(textsOf(tree)).not.toContain('wait');
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
    expect(textsOf(tree)).not.toContain('wait');
    expect(textsOf(tree)).not.toContain('▍');
  });
});
