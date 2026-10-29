/**
 * The reader's top bar: what it offers, and what a quick copy means.
 *
 * The owner reads files on the right-hand pane all day and asked for the whole document in one
 * tap rather than by selecting it block by block (2026-10-28). The rule that decides when the
 * tile is drawn lives in the component, so it is pinned here: everything this viewer draws is
 * text, so everything gets it -- a `.sh` as much as a README.
 *
 * The zoom follows the same rule, and it was the reason this file grew a second half: it used to
 * be drawn only for markdown, so a `.txt`, a script or a CSV had no way to grow its text
 * (2026-10-29). One preference, every kind.
 *
 * The note below is about where the text goes, not about what it looks like: the body is fetched,
 * so every case stubs the response.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Clipboard from '@react-native-clipboard/clipboard';
import { TextStyle } from 'react-native';
import { TextViewer } from '../TextViewer';
import { prefs } from '../../core/prefs';

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
async function render(kind: 'markdown' | 'code' | 'text' | 'csv'): Promise<ReactTestRenderer.ReactTestRenderer> {
  const name = { markdown: 'notes.md', code: 'main.ts', text: 'notes.txt', csv: 'report.csv' }[kind];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<TextViewer url="/file" filename={name} kind={kind} onClose={() => {}} />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  return tree;
}

const copyTile = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => n.props?.accessibilityLabel === 'Copy the whole file' && typeof n.props?.onPress === 'function')[0];

const zoomIn = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => n.props?.accessibilityLabel === 'Larger text' && typeof n.props?.onPress === 'function')[0];

/** The editor host, which is what the code kind draws: `fontSize` is the whole of its zoom. */
function editorFontSize(tree: ReactTestRenderer.ReactTestRenderer): number | undefined {
  const host = tree.root.findAll(n => n.props?.testID === 'code-editor' || typeof n.props?.onError === 'function' && n.props?.readOnly === true && 'fontSize' in (n.props ?? {}));
  return host.length > 0 ? (host[0].props.fontSize as number) : undefined;
}

/** The plain-text body: the one selectable Text on screen. */
function proseStyle(tree: ReactTestRenderer.ReactTestRenderer): TextStyle {
  const body = tree.root.findAll(n => n.props?.selectable === true && typeof n.type === 'string')[0];
  return [body.props.style].flat(4).find((style): style is TextStyle => Boolean(style) && typeof style.fontSize === 'number')!;
}

beforeEach(async () => {
  (Clipboard.setString as jest.Mock).mockClear();
  await prefs.hydrate();
  prefs.set('docFontScale', 1);
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

// The zoom used to be drawn for markdown only, so a `.txt` or a script -- the two kinds the owner
// reads most -- had no way to grow their text (2026-10-29).
test.each([
  ['markdown' as const],
  ['text' as const],
  ['code' as const],
  ['csv' as const],
])('a %s reader offers the zoom, and the body follows it', async kind => {
  const tree = await render(kind);
  expect(zoomIn(tree)).toBeDefined();
  const before = prefs.get().docFontScale;
  ReactTestRenderer.act(() => zoomIn(tree)!.props.onPress());
  expect(prefs.get().docFontScale).toBeGreaterThan(before);
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});

test('the plain-text body is drawn at the zoomed size and its line box follows', async () => {
  prefs.set('docFontScale', 2);
  const tree = await render('text');
  const style = proseStyle(tree);
  expect(style.fontSize).toBe(28);
  expect(style.lineHeight).toBe(44);
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});

test('the code reader is handed the zoomed font size', async () => {
  prefs.set('docFontScale', 1.5);
  const tree = await render('code');
  expect(editorFontSize(tree)).toBe(21);
  ReactTestRenderer.act(() => {
    tree.unmount();
  });
});
