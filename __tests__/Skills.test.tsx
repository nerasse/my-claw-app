/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const KEPT = 'thread-kept';
const VIEWER_BODY = '## How it works\n\nKeep the server running.';

const SKILLS = [
  {
    name: 'voice',
    description: 'Voice mode plumbing for every channel',
    version: '1.0.0',
    source: 'built-in',
    path: '/s/.builtin/voice/SKILL.md',
  },
  {
    name: 'forgejo',
    description: 'Forgejo repos and CI',
    source: 'custom',
    path: '/s/forgejo/SKILL.md',
  },
  {
    name: 'mailcow',
    description: 'Mail server chores',
    source: 'workspace',
    path: '/w/skills/mailcow/SKILL.md',
  },
];

/** The Android layer calls the last registered handler and stops when it returns true. */
function hardwareBack(): boolean {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;
  return handlers[handlers.length - 1]!();
}

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function summary(threadId: string, title: string) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
  };
}

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

function longPressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const target = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onLongPress === 'function',
      { deep: true },
    )[0]!;
    target.props.onLongPress();
  });
}

/** Every frame the app pushed, parsed: the transfer tests assert on what left the device. */
function sentFrames(): Array<{ type: string } & Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as { type: string } & Record<string, unknown>,
  );
}

/** The chat screen's 40ms scroll timer must fire before unmount, or the next test crashes. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

async function openSettings(tree: Tree): Promise<void> {
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
}

async function openSkills(tree: Tree): Promise<void> {
  await waitFor(() => labelsOf(tree).includes('Open skills'));
  await pressLabel(tree, 'Open skills');
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: KEPT });
  globalThis.fetch = jest.fn(async () =>
    new Response(`---\nname: voice\ndescription: Voice mode plumbing\nversion: 1.0.0\n---\n${VIEWER_BODY}`),
  ) as never;
});

test('the skills page lists the three tiers with their locations', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await openSkills(tree);

  // The page asks for the catalog and the workspace list when it opens, not at boot.
  const asked = bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as { type: string },
  );
  expect(asked.map(f => f.type)).toEqual(expect.arrayContaining(['skills.list', 'workspaces.list']));

  await emit({ type: 'skills.list.result', skills: SKILLS });
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/home/neras/.my-claw/workspace', default: true },
      { key: 'sofa', path: '/home/neras/dev/SOFA', default: false },
    ],
  });
  await waitFor(() => textsOf(tree).includes('forgejo'));
  expect(textsOf(tree)).toEqual(
    expect.arrayContaining(['Built-in', 'Custom', 'Workspace', 'voice', 'forgejo', 'mailcow']),
  );
  expect(textsOf(tree)).toContain('synced');
  expect(labelsOf(tree)).toContain('Open skill voice');

  await settleAndUnmount(tree);
});

test('workspace skills are grouped under their workspace key with its path', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await openSkills(tree);
  await emit({
    type: 'skills.list.result',
    skills: [
      { name: 'mailcow', description: 'Mail server chores', source: 'workspace', workspace: 'sofa', path: '/w/skills/mailcow/SKILL.md' },
    ],
  });
  await emit({
    type: 'workspaces.list.result',
    workspaces: [{ key: 'sofa', path: '/home/neras/dev/SOFA', default: false }],
  });

  await waitFor(() => textsOf(tree).includes('mailcow'));
  expect(textsOf(tree)).toContain('sofa');
  expect(textsOf(tree)).toContain('/home/neras/dev/SOFA');

  // Opening it must address that workspace: without the key the server would serve the
  // default workspace's file of the same name, or nothing.
  await pressLabel(tree, 'Open skill mailcow');
  await waitFor(() => labelsOf(tree).includes('Close skill view'));
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('workspace=sofa'));

  await settleAndUnmount(tree);
});

test('the workspaces page lists every workspace and its path', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await pressLabel(tree, 'Open workspaces');
  await emit({
    type: 'workspaces.list.result',
    workspaces: [
      { key: 'default', path: '/home/neras/.my-claw/workspace', default: true },
      { key: 'sofa', path: '/home/neras/dev/SOFA', default: false },
    ],
  });

  await waitFor(() => textsOf(tree).includes('/home/neras/dev/SOFA'));
  expect(textsOf(tree)).toEqual(
    expect.arrayContaining(['default', 'sofa', '/home/neras/.my-claw/workspace']),
  );

  // Back returns to the settings index, not out of settings.
  await ReactTestRenderer.act(async () => {
    hardwareBack();
  });
  await waitFor(() => labelsOf(tree).includes('Open workspaces'));

  await settleAndUnmount(tree);
});

test('an old server answers an error instead of a spinning page', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await openSkills(tree);

  await emit({ type: 'error', scope: 'skills', message: 'skill catalog unavailable' });
  await waitFor(() => textsOf(tree).some(text => text.includes('skill catalog unavailable')));

  await settleAndUnmount(tree);
});

test('a skill opens full screen, and the back key walks viewer, skills, general', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await openSkills(tree);
  await emit({ type: 'skills.list.result', skills: SKILLS });
  await waitFor(() => labelsOf(tree).includes('Open skill voice'));

  // The row opens the viewer, which fetches the raw SKILL.md and renders its body.
  await pressLabel(tree, 'Open skill voice');
  await waitFor(() => textsOf(tree).some(text => text.includes('How it works')));
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/skills?'));
  expect(labelsOf(tree)).toContain('Close skill view');

  // Hardware back closes the viewer first, back to the list.
  await ReactTestRenderer.act(async () => {
    hardwareBack();
  });
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));

  // Then back leaves the skills page for the general settings page.
  await ReactTestRenderer.act(async () => {
    hardwareBack();
  });
  await waitFor(() => labelsOf(tree).includes('Open skills'));

  // And one more back closes settings for good.
  await ReactTestRenderer.act(async () => {
    hardwareBack();
  });
  await waitFor(() => labelsOf(tree).includes('Open conversations'));

  await settleAndUnmount(tree);
});

test('the close arrow on the viewer walks back the same way', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await openSkills(tree);
  await emit({ type: 'skills.list.result', skills: SKILLS });
  await waitFor(() => labelsOf(tree).includes('Open skill voice'));
  await pressLabel(tree, 'Open skill voice');
  await waitFor(() => labelsOf(tree).includes('Close skill view'));

  await pressLabel(tree, 'Close skill view');
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));

  await settleAndUnmount(tree);
});

const WORKSPACES = [
  { key: 'default', path: '/home/neras/.my-claw/workspace', default: true },
  { key: 'sofa', path: '/home/neras/dev/SOFA', default: false },
];

/** A catalog where one name lives in two tiers at once, which is what the badges explain. */
const SHADOWED = [
  {
    name: 'forgejo',
    description: 'Forgejo repos and CI',
    source: 'custom',
    path: '/s/forgejo/SKILL.md',
    overriddenIn: ['sofa'],
  },
  {
    name: 'forgejo',
    description: 'Forgejo, SOFA flavour',
    source: 'workspace',
    workspace: 'sofa',
    path: '/w/sofa/skills/forgejo/SKILL.md',
    overrides: 'custom',
  },
];

async function openSkillsWith(tree: Tree, skills: unknown[]): Promise<void> {
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await openSettings(tree);
  await openSkills(tree);
  await emit({ type: 'skills.list.result', skills });
  await emit({ type: 'workspaces.list.result', workspaces: WORKSPACES });
}

test('the catalog says which copy of a duplicated name wins', async () => {
  const tree = await renderApp();
  await openSkillsWith(tree, SHADOWED);
  await waitFor(() => textsOf(tree).includes('forgejo'));

  // Two rows, one name: without this the page shows the same skill twice and says nothing.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['masked in sofa', 'overrides custom']));

  await settleAndUnmount(tree);
});

test('a long press offers copy and move, and the target list excludes where it already is', async () => {
  const tree = await renderApp();
  await openSkillsWith(tree, SHADOWED);
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));

  await longPressLabel(tree, 'Open skill forgejo');
  await waitFor(() => labelsOf(tree).includes('Copy to…'));
  expect(labelsOf(tree)).toContain('Move to…');

  await pressLabel(tree, 'Move to…');
  await waitFor(() => labelsOf(tree).includes('Workspace · sofa'));
  // The custom row is the skill's own tier, so it is not offered as a destination.
  expect(labelsOf(tree)).not.toContain('Custom');

  await pressLabel(tree, 'Workspace · default');
  await waitFor(() => sentFrames().some(frame => frame.type === 'skills.move'));
  expect(sentFrames().find(frame => frame.type === 'skills.move')).toEqual({
    type: 'skills.move',
    source: 'custom',
    name: 'forgejo',
    target: { source: 'workspace', workspace: 'default' },
  });

  await settleAndUnmount(tree);
});

test('a name already taken in the target asks to replace before it overwrites', async () => {
  const tree = await renderApp();
  await openSkillsWith(tree, SHADOWED);
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));

  await longPressLabel(tree, 'Open skill forgejo');
  await pressLabel(tree, 'Copy to…');
  await waitFor(() => labelsOf(tree).includes('Workspace · sofa'));

  // sofa already carries a forgejo: the tap asks instead of sending.
  await pressLabel(tree, 'Workspace · sofa');
  await waitFor(() => labelsOf(tree).includes('Replace'));
  expect(sentFrames().some(frame => frame.type === 'skills.copy')).toBe(false);

  await pressLabel(tree, 'Replace');
  await waitFor(() => sentFrames().some(frame => frame.type === 'skills.copy'));
  expect(sentFrames().find(frame => frame.type === 'skills.copy')).toEqual({
    type: 'skills.copy',
    source: 'custom',
    name: 'forgejo',
    target: { source: 'workspace', workspace: 'sofa' },
    overwrite: true,
  });

  await settleAndUnmount(tree);
});

test('a built-in skill can be forked but is never offered a move', async () => {
  const tree = await renderApp();
  await openSkillsWith(tree, SKILLS);
  await waitFor(() => labelsOf(tree).includes('Open skill voice'));

  await longPressLabel(tree, 'Open skill voice');
  await waitFor(() => labelsOf(tree).includes('Copy to…'));
  // Moving out of built-in would be undone by the next boot's resync, so it is not offered.
  expect(labelsOf(tree)).not.toContain('Move to…');

  await settleAndUnmount(tree);
});

test('a move closes the open reader, whose URL points at the tier the skill just left', async () => {
  const tree = await renderApp();
  await openSkillsWith(tree, SKILLS);
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));

  await pressLabel(tree, 'Open skill forgejo');
  await waitFor(() => labelsOf(tree).includes('Actions for skill forgejo'));

  await pressLabel(tree, 'Actions for skill forgejo');
  await waitFor(() => labelsOf(tree).includes('Move to…'));
  await pressLabel(tree, 'Move to…');
  await waitFor(() => labelsOf(tree).includes('Workspace · sofa'));
  await pressLabel(tree, 'Workspace · sofa');

  await waitFor(() => !labelsOf(tree).includes('Close skill view'));
  expect(textsOf(tree).some(text => text.includes('forgejo moved to Workspace · sofa'))).toBe(true);

  await settleAndUnmount(tree);
});

/**
 * The transfer notice is a line on the page, not a layer: it takes no press of its own, and the
 * back key leaves the page in one press like anywhere else. It is dropped on the way out all the
 * same -- the screen's own back arrow always did, the hardware key did not, and the stale line
 * came back the next time the page was opened.
 */
test('the back key leaves the skills page in one press, and does not keep the notice for next time', async () => {
  const tree = await renderApp();
  await openSkillsWith(tree, SHADOWED);
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));

  await longPressLabel(tree, 'Open skill forgejo');
  await pressLabel(tree, 'Move to…');
  await waitFor(() => labelsOf(tree).includes('Workspace · default'));
  await pressLabel(tree, 'Workspace · default');
  await waitFor(() => textsOf(tree).some(text => text.includes('forgejo moved to')));

  // One press, and it is the page that goes: the notice never gets a press of its own.
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = hardwareBack();
  });
  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open skills'));
  expect(textsOf(tree).some(text => text.includes('forgejo moved to'))).toBe(false);

  await openSkills(tree);
  await emit({ type: 'skills.list.result', skills: SHADOWED });
  await waitFor(() => labelsOf(tree).includes('Open skill forgejo'));
  expect(textsOf(tree).some(text => text.includes('forgejo moved to'))).toBe(false);

  await settleAndUnmount(tree);
});
