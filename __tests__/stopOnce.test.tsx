/**
 * One stop per cycle, on the surfaces the owner touches.
 *
 * The server answers nothing to a stop requested while the abort of the same cycle is already
 * travelling. The app therefore holds the request back itself: the session menu entry reads
 * "Stopping…" and sends nothing, a `/stop` typed meanwhile (confirmed from the slash-menu, or sent
 * as a message with the arrow) is consumed without a frame and without a bubble. The run ends as
 * `aborted`, and that end is what puts the plain Stop back.
 */
import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { CommandElapsed } from '../src/components/CommandElapsed';
import { chatStore } from '../src/core/chat';
import { commandStore } from '../src/core/commands';
import { questionStore } from '../src/core/questionStore';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, waitFor, unmount, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-stop';

/** The composer's catalog, with the command this file is about. */
const STOP_CATALOG = [{ name: 'stop', description: 'Stop the running agent and its sub-agents' }];

/** Every string anywhere in the tree, including array children (bubble text renders as arrays). */
function allTexts(tree: Tree): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    const collect = (value: unknown): void => {
      if (typeof value === 'string') out.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
    };
    collect(node.props.children);
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'props' in (child as object)) {
        walk(child as ReactTestRenderer.ReactTestInstance);
      }
    }
  };
  walk(tree.root);
  return out;
}

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): string[] {
  return bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
}

const stopFrames = (): string[] => sentFrames().filter(frame => frame.includes('"type":"chat.stop"'));
const sendFrames = (): string[] => sentFrames().filter(frame => frame.includes('"type":"chat.send"'));

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

function composerField(tree: Tree): ReactTestRenderer.ReactTestInstance {
  return tree.root.find(
    node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'Message to send',
  );
}

function typeInto(tree: Tree, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    composerField(tree).props.onChangeText(text);
  });
}

/** Confirmed with Enter, the way a typed slash command is: the menu selects it. */
function submitField(tree: Tree): Promise<void> {
  return ReactTestRenderer.act(async () => {
    composerField(tree).props.onSubmitEditing();
  });
}

function draftOf(tree: Tree): string {
  return String(composerField(tree).props.value ?? '');
}

/**
 * The list scrolls on a 40ms timer; a test that ends first lets it fire outside act() and fails
 * the run. Wait it out inside act before tearing the tree down (same rule as Commands.test.tsx).
 */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

beforeEach(() => {
  chatStore.clearAll();
  commandStore.replace(STOP_CATALOG);
  // A question left pending by one test would change what a stop means in the next one.
  questionStore.clear();
  bridge.sendMessage.mockClear();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('the composer read Stopping… while a stop is in flight, sent nothing, and reads Stop once the run ends', async () => {
  // The composer's corner is the only door now (owner, 2026-11-04: "vire l'action stop du menu de
  // session ... on a déjà le bouton stop en bas"). What this keeps pinning is the cycle: one stop
  // per run, a press while one travels sends nothing, and the end of the run is what lifts the mark.
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));

  await pressLabel(tree, 'Stop generating');
  await waitFor(() => stopFrames().length === 1);

  // One in flight: the corner wears the word and a press sends nothing more.
  await waitFor(() => labelsOf(tree).includes('Stopping…'));
  const sent = stopFrames().length;
  await pressLabel(tree, 'Stopping…');
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  expect(stopFrames().length).toBe(sent);

  // The server settles the cycle: the run ends as aborted, which lifts the mark. A new run shows
  // the plain Stop again -- not a Stopping… left over from the previous one.
  await emit({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
  await waitFor(() => !labelsOf(tree).includes('Stop generating'));
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r2');
    chatStore.startStream(THREAD, 's2', 'u2');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));
  expect(labelsOf(tree)).not.toContain('Stopping…');

  await settleAndUnmount(tree);
});

test('a /stop typed during the window is consumed: no frame, no bubble, no leftover draft', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
    chatStore.appendDelta(THREAD, 's1', 'working');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));

  // The stop leaves from the composer's own button first: the window is open.
  await pressLabel(tree, 'Stop generating');
  await waitFor(() => stopFrames().length === 1);
  const stops = stopFrames().length;
  const sends = sendFrames().length;
  const items = chatStore.getItems(THREAD).length;

  // Typed and confirmed with Enter: the slash-menu takes it to the command path, which is consumed.
  await typeInto(tree, '/stop');
  await submitField(tree);
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  expect(draftOf(tree)).toBe('');
  expect(stopFrames().length).toBe(stops);
  expect(sendFrames().length).toBe(sends);
  expect(chatStore.getItems(THREAD).length).toBe(items);

  // Typed then sent with the arrow: the message path is consumed too, bubble included.
  await typeInto(tree, '/stop');
  await pressLabel(tree, 'Send message');
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  expect(draftOf(tree)).toBe('');
  expect(stopFrames().length).toBe(stops);
  expect(sendFrames().length).toBe(sends);
  expect(chatStore.getItems(THREAD).length).toBe(items);
  expect(
    chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.text === '/stop'),
  ).toBe(false);

  await settleAndUnmount(tree);
});

test('a stop while a question waits cancels the question; the next press is the real stop', async () => {
  // The server reads a stop while a question is pending as "cancel the question" -- the run
  // carries on, and the second press is the abort. The first press must not mark anything in
  // flight, or it would swallow the second one.
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));
  await emit({
    type: 'question.ask',
    id: 'q1',
    threadId: THREAD,
    questions: [{ header: 'Pick', question: 'Which one?', options: [{ label: 'a' }] }],
    ts: new Date().toISOString(),
  });

  // First press: the request goes out (it cancels the question), and the corner still says Stop --
  // nothing was marked in flight, so nothing swallows what comes next.
  await pressLabel(tree, 'Stop generating');
  await waitFor(() => stopFrames().length === 1);
  expect(labelsOf(tree)).toContain('Stop generating');
  expect(labelsOf(tree)).not.toContain('Stopping…');

  // The server confirms the cancellation: the question is gone, the run carries on.
  await emit({ type: 'question.resolved', id: 'q1', threadId: THREAD, reason: 'canceled' });

  // Second press: this one is the abort, and it claims the cycle.
  await pressLabel(tree, 'Stop generating');
  await waitFor(() => stopFrames().length === 2);
  await waitFor(() => labelsOf(tree).includes('Stopping…'));

  await emit({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
  await waitFor(() => !labelsOf(tree).includes('Stop generating'));

  await settleAndUnmount(tree);
});

test('the "Running /stop..." bubble of a crossed stop is resolved by the end of the run', async () => {
  // The web stopped the same thread a moment before: this device sends its own /stop as a
  // message, the server answers nothing (the abort of the cycle is already travelling), and the
  // placeholder it drew would spin for good. The end of the run resolves it, with no text
  // invented to replace it.
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
    chatStore.addUserMessage(THREAD, 'send-1', '/stop', []);
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));
  await emit({ type: 'chat.command.pending', threadId: THREAD, replyToId: 'send-1', text: 'Running /stop...' });
  await waitFor(() => allTexts(tree).some(text => text.includes('Running /stop...')), 60);
  expect(tree.root.findAllByType(CommandElapsed)).toHaveLength(1);

  await emit({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
  await waitFor(() => !allTexts(tree).some(text => text.includes('Running /stop...')), 60);
  // Nothing was invented for it, and nothing keeps spinning.
  expect(tree.root.findAllByType(CommandElapsed)).toHaveLength(0);

  await settleAndUnmount(tree);
});

test('outside the window, a /stop typed and sent still goes out as the command it is', async () => {
  // The guard is scoped to the window: with no stop in flight, the message path behaves as it
  // always did -- the text leaves, and its bubble is drawn.
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));

  await typeInto(tree, '/stop');
  await pressLabel(tree, 'Send message');
  await waitFor(() => sendFrames().length === 1);
  expect(sendFrames()[0]).toContain('"/stop"');
  expect(
    chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.role === 'user' && item.text === '/stop'),
  ).toBe(true);

  await settleAndUnmount(tree);
});

/** Every composite that can react to a press under one label. */
function pressables(tree: Tree, label: string): ReactTestRenderer.ReactTestInstance[] {
  return tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  );
}

/**
 * The state travels now: a stop taken on the web is a fact about the work in flight, broadcast as
 * `chat.run.stopping` and replayed to a window that reloads mid-abort. So a device that never
 * pressed anything reads "Stopping…" -- in the menu and in the composer -- and pressing either
 * sends nothing, exactly like a second stop of a cycle taken here.
 */
test('a stop taken on another surface reads Stopping… in the composer, and it sends nothing', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));

  // The web stopped this thread: the frame is the only thing that reaches this device -- no
  // press here, no local mark. That is the whole point of the state travelling.
  await emit({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
  await waitFor(() => labelsOf(tree).includes('Stopping…'));

  // The composer's corner: the ■ is gone, the loader wears the word, and pressing it sends
  // nothing -- the claim is refused like any second stop of the cycle.
  expect(labelsOf(tree)).not.toContain('Stop generating');
  expect(pressables(tree, 'Stopping…')).toHaveLength(1);
  const stops = stopFrames().length;
  await pressLabel(tree, 'Stopping…');
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  expect(stopFrames().length).toBe(stops);

  // The session menu no longer carries the action at all: one door, and the composer's corner is
  // the one on screen while a run is live (owner, 2026-11-04).
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Instructions'));
  // Exactly one, and it is the composer's: the menu holds no stop row at all now.
  expect(pressables(tree, 'Stopping…')).toHaveLength(1);
  expect(labelsOf(tree)).not.toContain('Stop');

  // The end of the run is what takes the state down.
  await emit({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
  await waitFor(() => !labelsOf(tree).includes('Stopping…'));

  await settleAndUnmount(tree);
});

test('the ■ gives way to a loader while a stop is in flight, and the loader is mute', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 's1', 'u1');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));

  // The press arms the mark at once: the ■ is a loader from that instant, wearing the word the
  // menu shows.
  await pressLabel(tree, 'Stop generating');
  await waitFor(() => stopFrames().length === 1);
  await waitFor(() => labelsOf(tree).includes('Stopping…'));
  expect(labelsOf(tree)).not.toContain('Stop generating');

  // The loader is the whole story: pressing it sends nothing, and no bubble is drawn for a
  // second stop the server would answer with silence.
  const stops = stopFrames().length;
  const sends = sendFrames().length;
  await pressLabel(tree, 'Stopping…');
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  expect(stopFrames().length).toBe(stops);
  expect(sendFrames().length).toBe(sends);
  expect(
    chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.text === '/stop'),
  ).toBe(false);

  await settleAndUnmount(tree);
});
