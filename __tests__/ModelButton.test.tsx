/**
 * One action, one door.
 *
 * The model picker can be reached from the title bar or from the command menu, and never from both
 * at once: the owner asked for the button where there is room, and for the menu entry to leave when
 * it appears ("on le vire de la liste du menu ... quand il est affiché", 2026-11-04). Two predicates
 * would eventually disagree and leave the picker in both places on one window and in neither on the
 * next, so both readers take `showsModelButton`.
 *
 * Pinned at both ends of the threshold: wide, the button is drawn and the entry is gone; narrow, the
 * entry is back and the button is not.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { AGENTS_BUTTON_MIN_WIDTH, MODEL_BUTTON_MIN_WIDTH } from '../src/app/headerControls';
import { labelsOf, press, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-model-button';

/**
 * Set before `renderApp`: the layout is read once, at mount, and the header decides from it.
 * `lastThreadId` is how a suite starts inside a conversation instead of on the list.
 */
async function openConversation(width: number): Promise<Tree> {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Commands'));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
});

test('wide, the picker is a button of the title bar and leaves the menu', async () => {
  const tree = await openConversation(MODEL_BUTTON_MIN_WIDTH + 120);

  expect(labelsOf(tree)).toContain('Change model');

  await press(tree, 'Commands');
  // The menu is open, and still carries the actions that have no control of their own.
  await waitFor(() => labelsOf(tree).includes('Instructions'));
  expect(labelsOf(tree)).not.toContain('Model…');
  // The tune sheet is not the picker: it keeps its entry at every width.
  expect(labelsOf(tree)).toContain('Effort / window…');

  await unmount(tree);
});

test('narrow, the button goes and the menu keeps the entry', async () => {
  const tree = await openConversation(MODEL_BUTTON_MIN_WIDTH - 80);

  expect(labelsOf(tree)).not.toContain('Change model');

  await press(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'));

  await unmount(tree);
});

test('the button opens the picker, which lists the catalogue the server answers', async () => {
  const tree = await openConversation(MODEL_BUTTON_MIN_WIDTH + 120);

  await press(tree, 'Change model');
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'model.list.result', models: [{ id: 'm1', label: 'M1' }], defaultModel: 'm1' }),
    });
  });
  // The sheet is open and holds the catalogue: that is the button reaching the same picker the
  // menu entry used to. Which frame asked for it is the picker's business, not this test's.
  await waitFor(() => labelsOf(tree).includes('M1'));

  await unmount(tree);
});

/**
 * The same rule for the roster, at a higher bar.
 *
 * The sub-agent badge costs the facts line twice -- a 50 pt badge, and the model name beside it is
 * what gives way. Measured at 560 with a long provider id the name is cut with the badge and whole
 * without it; at 720 the block keeps room for the name and the badge together. So below 720 the
 * roster lives in the session menu, which is where the owner said he actually looked for it
 * ("c'est useless d'avoir le bouton de la liste des sous-agents tout en haut sur mobile", 2026-11-05).
 */
async function seedAgents(tree: Tree, total = 2, running = 1): Promise<void> {
  const agents = Array.from({ length: total }, (_, index) => ({
    id: `subagent/worker-${index}`,
    displayName: `worker-${index}`,
    type: 'general',
    status: index < running ? ('running' as const) : ('idle' as const),
    messageCount: 3,
    visibility: 'private' as const,
    parentThreadId: THREAD,
  }));
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'subagents.list.result', threadId: THREAD, agents }),
    });
  });
}

test('wide, the roster is the badge in the bar and leaves the menu', async () => {
  const tree = await openConversation(AGENTS_BUTTON_MIN_WIDTH + 80);
  await seedAgents(tree);

  await waitFor(() => labelsOf(tree).some(label => label.startsWith('2 sub-agents')));
  await press(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Instructions'));
  expect(labelsOf(tree)).not.toContain('Sub-agents');

  await unmount(tree);
});

test('narrow, the badge goes and the menu carries the roster', async () => {
  const tree = await openConversation(AGENTS_BUTTON_MIN_WIDTH - 80);
  await seedAgents(tree);

  // No badge in the bar at all: that is the space the model name gets back.
  expect(labelsOf(tree).some(label => /^\d+ sub-agents?/.test(label))).toBe(false);

  await press(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Sub-agents'));
  expect(labelsOf(tree)).toContain('Sub-agents');

  await unmount(tree);
});

test('a conversation with no sub-agent offers the roster nowhere, whatever the width', async () => {
  const tree = await openConversation(AGENTS_BUTTON_MIN_WIDTH - 80);
  await seedAgents(tree, 0, 0);

  await press(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Instructions'));
  expect(labelsOf(tree)).not.toContain('Sub-agents');

  await unmount(tree);
});
