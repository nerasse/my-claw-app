/**
 * Tables that fit, code blocks and quotes you can take with you.
 *
 * react-native-marked gives every column a hard `windowWidth * 1.3 / 3` and wraps the table in a
 * horizontal ScrollView (`utils/table.ts`): a two-column table was 86% of the screen of mostly
 * whitespace, and a four-column one had to be dragged sideways inside the inverted chat list.
 * Both renderers override that table, the copy strip and the quote bar, and all three are
 * guarded here.
 *
 * The library is mocked for the whole suite (jest.setup.js), so none of it reaches a renderer
 * through `useMarkdown`. The overrides are therefore called directly, which is also the only
 * thing worth asserting about them: what they hand the strip, the bar and the table.
 */

import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Clipboard from '@react-native-clipboard/clipboard';
import { WrappingRenderer } from '../AgentMarkdown';
import { DocumentRenderer } from '../DocumentMarkdown';
import { CodeBlockBar } from '../CodeBlockBar';
import { columnWeights, MarkdownTable } from '../MarkdownTable';

const cell = (text: string): React.ReactNode[] => [<Text key={text}>{text}</Text>];

function render(node: React.ReactNode): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<>{node}</>);
  });
  return tree;
}

function press(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll(n => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
  if (!node) throw new Error(`no pressable labelled ${label}`);
  ReactTestRenderer.act(() => {
    node.props.onPress();
  });
}

beforeEach(() => {
  // Every copy arms the "copied" timer; on real timers it fires after the suite is torn down.
  jest.useFakeTimers();
  (Clipboard.setString as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

test('a column is as wide as what it holds, within bounds', () => {
  const header = [cell('#'), cell('Reference'), cell('Answers')];
  const rows = [
    [cell('1'), cell('matches an id verbatim'), cell('that entry, config-declared or discovered')],
    [cell('2'), cell('names a provider'), cell("only that provider's copy of the id")],
  ];
  const weights = columnWeights(header, rows);

  // The counter column asked for one character and is floored, not handed a third of the screen.
  expect(weights[0]).toBe(4);
  expect(weights[1]).toBeGreaterThan(weights[0]!);
  // Clamped at the top: one long cell must not starve its neighbours.
  expect(weights[2]).toBe(24);
});

test('a ragged row keeps its column, and an empty table is not a crash', () => {
  expect(columnWeights([cell('a')], [[cell('a'), cell('bb')]])).toHaveLength(2);
  expect(columnWeights([], [])).toEqual([]);
});

test('the table lays itself out in flex, never in fixed pixels', () => {
  const tree = render(<MarkdownTable header={[cell('a'), cell('b')]} rows={[[cell('c'), cell('d')]]} />);
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('"flex"');
  // A width here is the library's windowWidth * 1.3 / 3 coming back.
  expect(json).not.toContain('"width"');
  ReactTestRenderer.act(() => tree.unmount());
});

test.each([
  ['the bubble', () => new WrappingRenderer({}, {})],
  ['the document', () => new DocumentRenderer('#ffffff', {})],
])('%s renders a table of its own, not the scrollable one', (_name, make) => {
  const node = make().table([cell('a'), cell('b')], [[cell('c'), cell('d')]], {}, {}, {});
  const tree = render(node);
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('"flex"');
  expect(json).not.toContain('"width"');
  ReactTestRenderer.act(() => tree.unmount());
});

test.each([
  ['the bubble', () => new WrappingRenderer({}, {})],
  ['the document', () => new DocumentRenderer('#ffffff', {})],
])('%s puts a copy strip over a fenced block, carrying the source', (_name, make) => {
  const source = 'const x = 1;\nconst y = 2;';
  const tree = render(make().code(source, 'ts'));

  press(tree, 'Copy ts block');
  // The markdown source, not what the renderer made of it.
  expect(Clipboard.setString).toHaveBeenCalledWith(source);
  ReactTestRenderer.act(() => tree.unmount());
});

test('a fence with no language still offers the button', () => {
  const tree = render(<CodeBlockBar value="plain" />);
  press(tree, 'Copy code block');
  expect(Clipboard.setString).toHaveBeenCalledWith('plain');
  ReactTestRenderer.act(() => tree.unmount());
});

test.each([
  ['the bubble', () => new WrappingRenderer({}, {})],
  ['the document', () => new DocumentRenderer('#ffffff', {})],
])('%s puts a copy on a quote, carrying its text', (_name, make) => {
  const tree = render(
    make().blockquote([<Text key="a">Une pièce jointe ne couvre plus le chat</Text>], {}),
  );
  press(tree, 'Copy quote');
  // The words as read, not the markdown: no `>` prefix in what lands on the clipboard.
  expect(Clipboard.setString).toHaveBeenCalledWith('Une pièce jointe ne couvre plus le chat');
  ReactTestRenderer.act(() => tree.unmount());
});

test('a quote that yields no text offers nothing to copy', () => {
  const empty = <View key="empty" />;
  const tree = render(new WrappingRenderer({}, {}).blockquote([empty], {}));
  expect(tree.root.findAll(n => n.props?.accessibilityLabel === 'Copy quote')).toHaveLength(0);
  ReactTestRenderer.act(() => tree.unmount());
});
