/**
 * @format
 *
 * What a back press closes first, and what it leaves alone.
 *
 * Every layer of the shell is closed by the same cascade (`handleBack`), read by the Android back
 * key, the browser's Back button and Escape alike. Suites elsewhere walk single stacks -- the
 * settings pages, the model picker, a viewer -- but nothing pinned the **order between layers**,
 * which is the one thing a reader of that function has to trust: a sheet over a menu over the
 * drawer over the conversation, innermost first, and only an empty stack lets Android have the
 * press.
 *
 * Four surfaces of the cascade are pinned where their own harness lives, because a test that has
 * to rebuild a jobs editor or a sub-agent chat to press one key is a test nobody maintains:
 * `Jobs.test.tsx` (the delete confirmation over the editor), `Tags.test.tsx` (the discard sheet),
 * `SubAgents.test.tsx` (the hand-back sheet) and `Skills.test.tsx` (the transfer notice).
 * `docs/back-cascade.md` holds the whole list.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';
import { requestDownload } from '../src/core/downloadFlow';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-back';
const TITLE = 'Infra maison';

/** The Android layer calls the last registered handler and stops when it returns true. */
function backHandler(): { __handlers: Array<() => boolean>; exitApp: jest.Mock } {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  return back.default;
}

/** True when the press was handled: false is what makes Android close the app. */
async function hardwareBack(): Promise<boolean> {
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}

function listSessions(): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'session.list.result',
        sessions: [
          {
            threadId: THREAD,
            title: TITLE,
            messageCount: 2,
            createdAt: '2026-08-06T10:00:00.000Z',
            lastActiveAt: '2026-08-06T10:05:00.000Z',
          },
        ],
      }),
    });
  });
}

async function pressLabel(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const target = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  )[0];
  if (!target) throw new Error(`no pressable labelled ${label}`);
  await ReactTestRenderer.act(async () => target.props.onPress());
}

/**
 * Whether the slide-over drawer is on screen.
 *
 * It stays mounted when closed (it animates both ways), so its labels are no witness: what says
 * open is the wrapper that stops swallowing touches, `pointerEvents="auto"`. Identified by the
 * settings entry it holds, which no other absolute layer carries.
 */
function drawerVisible(tree: Tree): boolean {
  const layers = tree.root.findAll(
    node => node.props.pointerEvents === 'auto' || node.props.pointerEvents === 'none',
    { deep: true },
  );
  const drawer = layers.find(
    node => node.findAll(inner => inner.props.accessibilityLabel === 'Open settings', { deep: true }).length > 0,
  );
  if (!drawer) throw new Error('the drawer is not mounted');
  return drawer.props.pointerEvents === 'auto';
}

/** The conversation is on screen when its composer is. */
function chatVisible(tree: Tree): boolean {
  return labelsOf(tree).includes('Message to send');
}

function homeVisible(tree: Tree): boolean {
  return tree.root.findAll(node => node.props.testID === 'home-screen', { deep: true }).length > 0;
}

/** A menu or a confirmation is on screen when one of its rows is. */
function sheetShows(tree: Tree, label: string): boolean {
  return labelsOf(tree).includes(label);
}

function sentFrames(): Array<{ type: string }> {
  return bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as { type: string });
}

/** The chat screen's 40ms scroll timer must fire before unmount, or the next test crashes. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

async function openThreadMenu(tree: Tree): Promise<void> {
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).includes(`Actions for conversation ${TITLE}`));
  await pressLabel(tree, `Actions for conversation ${TITLE}`);
  await waitFor(() => sheetShows(tree, 'Rename…'));
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('back walks the layers innermost first: menu, drawer, conversation, then Android', async () => {
  const tree = await renderApp();
  await listSessions();
  await openThreadMenu(tree);

  // The menu was opened from the drawer and the drawer stayed under it: both are up.
  expect(drawerVisible(tree)).toBe(true);
  expect(sheetShows(tree, 'Rename…')).toBe(true);

  // 1. The menu, and nothing else: the drawer it was opened from is still there to go back to.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !sheetShows(tree, 'Rename…'));
  expect(drawerVisible(tree)).toBe(true);
  expect(chatVisible(tree)).toBe(true);

  // 2. The drawer, which leaves the conversation it was covering.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !drawerVisible(tree));
  expect(chatVisible(tree)).toBe(true);

  // 3. The conversation: on a phone, back goes home rather than out of the app.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => homeVisible(tree));
  expect(chatVisible(tree)).toBe(false);

  // 4. Nothing left. `false` is what hands the press to Android, and only home may do that.
  expect(await hardwareBack()).toBe(false);
  expect(homeVisible(tree)).toBe(true);
  expect(backHandler().exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});

// A download's destinations are drawn by the overlay host, over whatever opened them.
test("back closes a download's destinations first, and only them", async () => {
  const tree = await renderApp();
  await listSessions();
  await openThreadMenu(tree);
  await ReactTestRenderer.act(async () => {
    requestDownload({ targets: [{ url: 'http://host/media/x', filename: 'x.png' }] });
  });
  expect(labelsOf(tree)).toContain('Save to Downloads');

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Save to Downloads'));
  // The menu under it is still up: that press was the overlay's alone.
  expect(sheetShows(tree, 'Rename…')).toBe(true);

  await settleAndUnmount(tree);
});

test('a menu outranks the drawer under it, and a screen outranks the conversation under it', async () => {
  const tree = await renderApp();
  await listSessions();
  await pressLabel(tree, 'Open conversations');
  expect(drawerVisible(tree)).toBe(true);

  // The More menu is opened from the drawer and leaves it open behind itself.
  await pressLabel(tree, 'More');
  await waitFor(() => sheetShows(tree, 'Archived'));
  expect(drawerVisible(tree)).toBe(true);

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !sheetShows(tree, 'Archived'));
  expect(drawerVisible(tree)).toBe(true);

  // Archived is a screen, not a layer over the drawer: opening it closes the drawer.
  await pressLabel(tree, 'More');
  await pressLabel(tree, 'Archived');
  await waitFor(() => labelsOf(tree).includes('Back to chat'));
  expect(drawerVisible(tree)).toBe(false);
  expect(textsOf(tree)).toContain('Archived');

  // The screen goes before the conversation it covers, which is still open underneath.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Back to chat'));
  expect(chatVisible(tree)).toBe(true);
  expect(homeVisible(tree)).toBe(false);

  await settleAndUnmount(tree);
});

/**
 * A confirmation is a question, and a back press is an answer to it: "no".
 *
 * Until these entered the cascade the press went straight through them and closed the layer
 * underneath -- the drawer went, the question stayed on screen over a shell that had moved, and
 * the next press aimed at the question hit whatever was under that.
 */
describe('sheets the cascade used to let the press through', () => {
  test('the delete confirmation goes, and the drawer under it does not', async () => {
    const tree = await renderApp();
    await listSessions();
    await openThreadMenu(tree);

    await pressLabel(tree, 'Delete');
    await waitFor(() => textsOf(tree).some(text => text.startsWith('Delete this conversation?')));
    // The menu closed itself on the way: the confirmation is the only layer the owner can see.
    expect(sheetShows(tree, 'Rename…')).toBe(false);
    expect(drawerVisible(tree)).toBe(true);

    expect(await hardwareBack()).toBe(true);
    await waitFor(() => !textsOf(tree).some(text => text.startsWith('Delete this conversation?')));

    // Nothing else moved: the drawer is where it was, and the conversation was not deleted.
    expect(drawerVisible(tree)).toBe(true);
    expect(chatVisible(tree)).toBe(true);
    expect(sentFrames().some(frame => frame.type === 'session.delete')).toBe(false);

    await settleAndUnmount(tree);
  });

  test('the workspace picker goes, and the drawer under it does not', async () => {
    const tree = await renderApp();
    await listSessions();
    await openThreadMenu(tree);

    await pressLabel(tree, 'Change workspace');
    await waitFor(() => sheetShows(tree, 'Manage workspaces…'));
    expect(drawerVisible(tree)).toBe(true);

    expect(await hardwareBack()).toBe(true);
    await waitFor(() => !sheetShows(tree, 'Manage workspaces…'));

    expect(drawerVisible(tree)).toBe(true);
    expect(chatVisible(tree)).toBe(true);
    expect(sentFrames().some(frame => frame.type === 'session.workspace')).toBe(false);

    await settleAndUnmount(tree);
  });
});
