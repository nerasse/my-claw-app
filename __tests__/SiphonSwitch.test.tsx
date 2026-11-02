/**
 * @format
 *
 * Siphon: one model for a whole tree -- docs/siphon.md server side.
 *
 * The row and the sheet read the same state, and that state is the server's: a pin shown from a
 * local guess would disagree with what the next run actually uses, which is the one thing this
 * mode may not do.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { modelStore } from '../src/core/model';
import { quotaRetryStore } from '../src/core/quota';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-siphon';
const OTHER = 'thread-other';

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

async function emit(frame: Record<string, unknown>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

/** The state the server answers with, shaped like a `model.result`. */
function modelState(threadId: string, siphon?: string): Record<string, unknown> {
  return {
    type: 'model.result',
    threadId,
    model: 'fast-1',
    defaultModel: 'fast-1',
    effort: { level: '', levels: [], supported: false },
    context: { raw: 200000, effective: 200000 },
    ...(siphon ? { siphon } : {}),
  };
}

/** Every Siphon row on screen: the shell composes one menu per surface, so there may be several. */
function siphonHints(tree: Tree): Set<string> {
  // Matched on the whole wording, not a prefix: the retry row right above says "on · waits for the
  // provider reset", and a prefix match read that as Siphon being pinned.
  return new Set(
    textsOf(tree).filter(
      text => text === 'off · each run picks its own model' || /^on · .*, every agent$/.test(text),
    ),
  );
}

describe('Siphon in the conversation menu', () => {
  beforeEach(() => {
    modelStore.reset();
    chatStore.clearAll();
    bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  });
  afterEach(() => {
    // The model store outlives a render tree, and a pin left by one case is the next one's
    // starting state -- the same trap the switch tests hit on the quota store.
    quotaRetryStore.reset();
    modelStore.reset();
    bridge.sendMessage.mockClear();
  });

  async function openChatMenu(tree: Tree): Promise<void> {
    await waitFor(() => labelsOf(tree).includes('Commands'));
    await press(tree, 'Commands');
    await waitFor(() => labelsOf(tree).includes('Siphon'));
  }

  it('says off until the server names a pin', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await openChatMenu(tree);

    expect(siphonHints(tree)).toEqual(new Set(['off · each run picks its own model']));

    await emit(modelState(THREAD, 'strong-2'));
    // The label, not the raw id: a row naming `strong-2` over a picker calling it "Strong" reads as
    // two different models.
    expect(siphonHints(tree)).toEqual(new Set(['on · strong-2, every agent']));
    await unmount(tree);
  });

  it('opens the picker, and the picker stages a pin rather than a model pick', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await emit(modelState(THREAD));
    await openChatMenu(tree);

    // The catalogue the picker reads: without it the sheet has nothing to list.
    await emit({
      type: 'model.list.result',
      models: [
        { id: 'fast-1', label: 'Fast' },
        { id: 'strong-2', label: 'Strong' },
        { id: 'tag:Work', label: 'Work' },
      ],
      defaultModel: 'fast-1',
      unavailable: [],
    });

    await press(tree, 'Siphon');
    await waitFor(() => labelsOf(tree).includes('Strong'));

    const before = sentFrames().filter(frame => frame.type === 'model.set').length;
    await press(tree, 'Strong');

    const pins = sentFrames().filter(frame => frame.type === 'model.siphon.set');
    expect(pins).toEqual([{ type: 'model.siphon.set', threadId: THREAD, model: 'strong-2' }]);
    // The last decision applies, and it applies to the pin only: this is not a model pick.
    expect(sentFrames().filter(frame => frame.type === 'model.set').length).toBe(before);
    await unmount(tree);
  });

  it('offers tags, and a tag is pinned as the tag', async () => {
    // The server resolves a tag to the model it aliases, keeps its effort with it and walks a tag
    // route by its candidates. Filtering tags out of this sheet made the whole mode unavailable to
    // anyone whose work is organised in tags -- which is how it was reported: "je ne peux pas
    // sélectionner de tag depuis le menu".
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await emit(modelState(THREAD));
    await openChatMenu(tree);

    await emit({
      type: 'model.list.result',
      models: [
        { id: 'fast-1', label: 'Fast' },
        { id: 'tag:Work', label: 'Work', effort: 'low' },
        { id: 'tag:Default', label: 'Default' },
      ],
      defaultModel: 'fast-1',
      unavailable: [],
    });

    await press(tree, 'Siphon');
    await waitFor(() => labelsOf(tree).includes('Work'));
    expect(labelsOf(tree)).toContain('Default');

    await press(tree, 'Work');
    // The tag itself travels: resolving it here would be a second answer to "what does this tag
    // mean", and the server already has one.
    expect(sentFrames().filter(frame => frame.type === 'model.siphon.set')).toEqual([
      { type: 'model.siphon.set', threadId: THREAD, model: 'tag:Work' },
    ]);
    await unmount(tree);
  });

  it('turns the mode off from the row above the list', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await emit(modelState(THREAD, 'strong-2'));
    await openChatMenu(tree);
    await waitFor(() => labelsOf(tree).includes('on · strong-2, every agent') || siphonHints(tree).has('on · strong-2, every agent'));

    await press(tree, 'Siphon');
    await waitFor(() => labelsOf(tree).includes('Turn Siphon off'));
    await press(tree, 'Turn Siphon off');

    expect(sentFrames().filter(frame => frame.type === 'model.siphon.set')).toEqual([
      { type: 'model.siphon.set', threadId: THREAD },
    ]);
    await unmount(tree);
  });

  it('does not borrow another conversation’s pin', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await emit(modelState(OTHER, 'strong-2'));
    await openChatMenu(tree);

    expect(siphonHints(tree)).toEqual(new Set(['off · each run picks its own model']));
    await unmount(tree);
  });
});
