/**
 * The reader's top bar: what it offers, and what a quick copy means.
 *
 * The owner reads files on the right-hand pane all day and asked for the whole document in one
 * tap rather than by selecting it block by block (2026-10-28). The rule that decides when the
 * tile is drawn lives in the component, so it is pinned here: everything this viewer draws is
 * text, so everything gets it -- a `.sh` as much as a README.
 *
 * The note below is about where the text goes, not about what it looks like: the body is fetched,
 * so every case stubs the response.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Clipboard from '@react-native-clipboard/clipboard';
import { TextViewer } from '../TextViewer';

jest.mock('react-native-webview', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  const MockWebView = (props: Record<string, unknown>) => ReactMock.createElement(View, props);
  return { __esModule: true, WebView: MockWebView, default: MockWebView };
});

const BODY = '# titre\n\nun paragraphe, et un autre.\n';

function respond(): void {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    headers: { get: () => String(BODY.length) },
    text: async () => BODY,
  });
}

/** Renders, lets the fetch settle, and hands back the tree. */
async function render(kind: 'markdown' | 'code' | 'text'): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <TextViewer url="/file" filename={kind === 'markdown' ? 'notes.md' : 'main.ts'} kind={kind} onClose={() => {}} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  return tree;
}

const copyTile = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => n.props?.accessibilityLabel === 'Copy the whole file' && typeof n.props?.onPress === 'function')[0];

beforeEach(() => {
  (Clipboard.setString as jest.Mock).mockClear();
  respond();
});

afterEach(() => {
  (global.fetch as jest.Mock).mockReset();
});

test('a markdown reader copies the whole file in one tap', async () => {
  const tree = await render('markdown');
  const tile = copyTile(tree);
  expect(tile).toBeDefined();
  ReactTestRenderer.act(() => {
    tile!.props.onPress();
  });
  expect(Clipboard.setString).toHaveBeenCalledWith(BODY);
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});

test('a plain text file, which is the same sheet of prose, copies too', async () => {
  const tree = await render('text');
  expect(copyTile(tree)).toBeDefined();
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});

test('a code reader copies too: any text on screen is one tap away', async () => {
  const tree = await render('code');
  const tile = copyTile(tree);
  expect(tile).toBeDefined();
  ReactTestRenderer.act(() => {
    tile!.props.onPress();
  });
  expect(Clipboard.setString).toHaveBeenCalledWith(BODY);
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});
