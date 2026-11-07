/**
 * Two ways out of a message, and only one of them on a browser.
 *
 * A browser selects text on its own, so the sheet's "Select text" was the only reason to open it
 * and the copy under it is what the reader wanted: the web bubble carries that copy as a button
 * and keeps the `⋯` only where the sheet still holds something else (handing a sub-agent's answer
 * back). Pinned here so a later styling pass cannot quietly bring the second button back.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Bubble } from '../Bubble';
import { ChatFontScaleContext } from '../../theme';
import type { TextItem } from '../../core/chat';

const ITEM: TextItem = {
  kind: 'text',
  id: 'a1',
  role: 'agent',
  text: 'voici la réponse',
  attachments: [],
  streaming: false,
  ts: 1,
};

function render(props: {
  onCopy?: (item: TextItem) => void;
  menuHasExtras?: boolean;
  onMenu?: (item: TextItem) => void;
}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <GestureHandlerRootView>
        <ChatFontScaleContext.Provider value={1}>
          <Bubble
            item={ITEM}
            mediaBase="http://host:8080"
            deviceInfo={null}
            grouped={false}
            showTime={false}
            onMenu={props.onMenu ?? (() => {})}
            onCopy={props.onCopy}
            menuHasExtras={props.menuHasExtras}
          />
        </ChatFontScaleContext.Provider>
      </GestureHandlerRootView>,
    );
  });
  return tree;
}

function button(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}

test('a browser shows the copy straight away, and no menu button behind it', () => {
  const copy = jest.fn();
  const tree = render({ onCopy: copy });

  expect(button(tree, 'Copy message')).toHaveLength(1);
  expect(button(tree, 'Message actions')).toHaveLength(0);

  ReactTestRenderer.act(() => button(tree, 'Copy message')[0]!.props.onPress());
  expect(copy).toHaveBeenCalledWith(ITEM);
});

test('the menu keeps its button where the sheet holds something else, like a hand-back', () => {
  const tree = render({ onCopy: () => {}, menuHasExtras: true });
  expect(button(tree, 'Copy message')).toHaveLength(1);
  expect(button(tree, 'Message actions')).toHaveLength(1);
});

test('a phone keeps the sheet alone: its long press has nowhere else to go', () => {
  const tree = render({});
  expect(button(tree, 'Copy message')).toHaveLength(0);
  expect(button(tree, 'Message actions')).toHaveLength(1);
});
