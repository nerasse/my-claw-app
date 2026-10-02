/**
 * Continue -- docs/continue.md on the server.
 *
 * A button at the foot of the thread, under its last run, when that run stopped, failed or was
 * lost: a pill on its own row, big enough for a thumb. It was the last word of the run's signature,
 * in its smallest type, beside the bubble's `⋯`, and the owner kept opening the menu instead
 * (2026-10-02). It also never showed for a message stopped at once: a run that wrote nothing had no
 * item to carry the signature it rode.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore, type ChatItem, type RunInfo } from '../../core/chat';
import { continueTarget } from '../../core/runRows';
import { diffText } from '../../components/UndoSheet';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'continue-thread';
const LABEL = 'Continue where it stopped';
const noop = (): void => {};

function text(id: string, role: 'user' | 'agent', run?: RunInfo, extra: Partial<ChatItem> = {}): ChatItem {
  return { kind: 'text', id, role, text: id, attachments: [], streaming: false, ts: 0, ...(run ? { run } : {}), ...extra } as ChatItem;
}

const run = (status: RunInfo['status'], id = 'r1'): RunInfo => ({ id, status, startTs: 0, ...(status === 'running' ? {} : { endTs: 1 }) });

describe('the run Continue picks up', () => {
  test('the last run, when it stopped, failed, or was lost', () => {
    expect(continueTarget([text('q', 'user'), text('a', 'agent', run('aborted'))])?.id).toBe('r1');
    expect(continueTarget([text('q', 'user'), text('a', 'agent', run('error'))])?.id).toBe('r1');
    expect(continueTarget([text('q', 'user'), text('a', 'agent', run('running'))])?.id).toBe('r1');
  });

  test('nothing when the last run finished', () => {
    expect(continueTarget([text('q', 'user'), text('a', 'agent', run('done'))])).toBeUndefined();
    expect(continueTarget([])).toBeUndefined();
  });

  test('nothing when a newer message waits under it: that one is what comes next', () => {
    const items = [text('q', 'user'), text('a', 'agent', run('aborted')), text('q2', 'user')];
    expect(continueTarget(items)).toBeUndefined();
  });

  test('a message signed by the empty run it triggered', () => {
    expect(continueTarget([text('q', 'user', run('aborted'))])?.id).toBe('r1');
  });

  test('a command output or a notice after the run does not hide it', () => {
    const items = [text('q', 'user'), text('a', 'agent', run('aborted')), text('/stop', 'user', undefined, { command: true })];
    expect(continueTarget(items)?.id).toBe('r1');
  });
});

describe('a run that wrote nothing', () => {
  afterEach(() => chatStore.clearThread(THREAD));

  test('signs the message that triggered it, live', () => {
    act(() => {
      chatStore.addUserMessage(THREAD, 'm1', 'compte les fichiers');
      chatStore.startRun(THREAD, 'r1');
      chatStore.endRun(THREAD, 'aborted');
    });
    const message = chatStore.getItems(THREAD).find(item => item.id === 'm1');
    expect(message?.run).toMatchObject({ id: 'r1', status: 'aborted' });
  });

  test('even when the bubble its wait opened ends after it', () => {
    act(() => {
      chatStore.addUserMessage(THREAD, 'm1', 'compte les fichiers');
      chatStore.startRun(THREAD, 'r1');
      chatStore.startStream(THREAD, 's1');
      chatStore.markWaiting(THREAD, 's1', Date.now());
      chatStore.endRun(THREAD, 'aborted');
    });
    expect(chatStore.getItems(THREAD).find(item => item.id === 'm1')?.run?.id).toBe('r1');
  });

  test('a message still waiting for its turn is not the one it signs', () => {
    act(() => {
      chatStore.addUserMessage(THREAD, 'm1', 'compte les fichiers');
      chatStore.startRun(THREAD, 'r1');
      chatStore.addUserMessage(THREAD, 'm2', 'et les dossiers');
      chatStore.markQueued(THREAD, 'm2', 'injection');
      chatStore.endRun(THREAD, 'aborted');
    });
    expect(chatStore.getItems(THREAD).find(item => item.id === 'm2')?.run).toBeUndefined();
  });

  test('a run that wrote something leaves its message alone', () => {
    act(() => {
      chatStore.addUserMessage(THREAD, 'm1', 'compte les fichiers');
      chatStore.startRun(THREAD, 'r1');
      chatStore.startStream(THREAD, 's1');
      chatStore.appendDelta(THREAD, 's1', 'Je regarde');
      chatStore.endRun(THREAD, 'aborted');
    });
    expect(chatStore.getItems(THREAD).find(item => item.id === 'm1')?.run).toBeUndefined();
  });
});

describe('the Continue button', () => {
  let mounted: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => mounted?.unmount());
    mounted = null;
    chatStore.clearThread(THREAD);
  });

  function render(onContinue: () => void, streaming = false): TestRenderer.ReactTestRenderer {
    const props = {
      threadId: THREAD, title: 'A conversation', subtitle: '', connectionState: 'connected', mediaBase: 'http://localhost',
      deviceInfo: null, autoFocusHero: false, onOpenDrawer: noop, onStatusPress: noop, onSend: noop, locationEnabled: false,
      onBubbleMenu: noop, onOpenImage: noop, onOpenText: noop, onOpenVideo: noop, onOpenFile: noop, onOpenMenu: noop,
      onCommandEntered: () => false, streaming, onStop: noop, onContinue, onQuestionReply: noop, onNewThread: noop,
      subagentDoors: new Map(), onLoadOlder: noop, loadingOlder: false,
    } as unknown as React.ComponentProps<typeof ChatScreen>;
    act(() => {
      mounted = TestRenderer.create(
        <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
          <ChatScreen {...props} />
        </ThemeContext.Provider>,
      );
    });
    return mounted!;
  }

  function stopAtOnce(): void {
    act(() => {
      chatStore.addUserMessage(THREAD, 'm1', 'compte les fichiers');
      chatStore.startRun(THREAD, 'r1');
      chatStore.endRun(THREAD, 'aborted');
    });
  }

  const buttons = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll(node => node.props.accessibilityLabel === LABEL && typeof node.props.onPress === 'function' && typeof node.props.style === 'function');

  test('shows under a message stopped at once, and a tap asks for it once', () => {
    stopAtOnce();
    const onContinue = jest.fn();
    const tree = render(onContinue);
    expect(buttons(tree)).toHaveLength(1);
    act(() => buttons(tree)[0]!.props.onPress());
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(buttons(tree)).toHaveLength(0);
  });

  test('is a thumb-sized button of its own, not a word in the run signature', () => {
    stopAtOnce();
    const tree = render(jest.fn());
    const style = StyleSheet.flatten(buttons(tree)[0]!.props.style({ pressed: false }));
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Continue this run where it stopped')).toHaveLength(0);
    // The signature still says how the run ended.
    const words = tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('');
    expect(words).toContain('Stopped');
  });

  test('not while a run is going', () => {
    stopAtOnce();
    expect(buttons(render(jest.fn(), true))).toHaveLength(0);
  });

  test('not when the last run finished', () => {
    act(() => {
      chatStore.addUserMessage(THREAD, 'm1', 'bonjour');
      chatStore.startRun(THREAD, 'r1');
      chatStore.startStream(THREAD, 's1');
      chatStore.appendDelta(THREAD, 's1', 'Salut');
      chatStore.endStream(THREAD, 's1');
      chatStore.endRun(THREAD, 'done');
    });
    expect(buttons(render(jest.fn()))).toHaveLength(0);
  });
});

describe('the undo sheet says what would come back', () => {
  test('in files, so a change git counts as +0/-0 still reads as a change', () => {
    expect(diffText([{ root: '/home/neras/dev/site', files: 1, additions: 0, deletions: 0 }])).toBe('site: 1 fichier (+0/-0)');
    expect(diffText([{ root: '/ws', files: 3, additions: 12, deletions: 4 }])).toBe('ws: 3 fichiers (+12/-4)');
  });

  test('an older server, which counts no files, still gets its lines', () => {
    expect(diffText([{ root: '/ws', additions: 2, deletions: 1 }])).toBe('ws: +2/-1');
  });
});
