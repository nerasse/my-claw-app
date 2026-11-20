/**
 * A provider's note is a row of the thread, not a bubble.
 *
 * The screen is where that is decided: every item of kind `text` used to fall through to `Bubble`,
 * and a notice drew there as a full-ink paragraph inside a red outline -- the two boxes the owner
 * photographed above an answer on 2026-11-14. It routes to `ProviderNotice` before that now, so
 * the plate and the payload have nowhere left to appear.
 */

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';
import { Bubble } from '../../components/Bubble';
import { ProviderNotice } from '../../components/ProviderNotice';

const THREAD = 'notice-thread';
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

function render(): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ChatScreen {...props()} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

const texts = (tree: TestRenderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat(2).join(''))
    .filter(Boolean)
    .join(' ');

beforeEach(() => chatStore.clearAll());

test('a provider notice is drawn as an aside, and never as a bubble', () => {
  chatStore.addUserMessage(THREAD, 'u1', 'go');
  chatStore.addAgentMessage(
    THREAD,
    'n1',
    '[quota] synthetic/hf.deepseek-ai/DeepSeek-V4.1-Flash-1017 is out of its week allowance (Week at 100%). Moving on now.',
    [],
    undefined,
    true,
  );

  const tree = render();
  expect(tree.root.findAllByType(ProviderNotice)).toHaveLength(1);
  const drawn = texts(tree);
  expect(drawn).toContain('Quota');
  expect(drawn).not.toContain('[quota]');
  // The agent's own bubbles are the only thing left in `Bubble` on this thread.
  expect(tree.root.findAllByType(Bubble).some(node => node.props.item?.id === 'n1')).toBe(false);
});
