/**
 * The text a quote hands to its copy bar.
 *
 * `quoteText` walks the rendered tree instead of the markdown source: what gets pasted is what
 * was read, so the `>` prefixes never travel. The cases that matter are the ones a quote really
 * carries -- several paragraphs, a list (whose markers the list library draws from its own props,
 * so they are restored here), and nothing at all (a quote over a table, where no bar is shown).
 */

import React from 'react';
import { Text } from 'react-native';
import { plainText, quoteText } from '../markdownText';

const text = (value: string): React.JSX.Element => <Text>{value}</Text>;

test('a single paragraph is itself, trimmed', () => {
  expect(quoteText([text('  une phrase  ')])).toBe('une phrase');
});

test('paragraphs keep their break, so the paste is not one run-on line', () => {
  expect(quoteText([text('premier'), text('second')])).toBe('premier\n\nsecond');
});

test('inline runs inside a paragraph join without adding anything', () => {
  const bold = (
    <Text>
      <Text>très </Text>
      <Text>important</Text>
    </Text>
  );
  expect(quoteText([bold])).toBe('très important');
});

test('a list keeps its items on their own lines, markers restored', () => {
  const list = React.createElement('Li', { li: [text('un'), text('deux')] });
  expect(quoteText([list])).toBe('- un\n- deux');
  const ordered = React.createElement('Li', { ordered: true, li: [text('un'), text('deux')] });
  expect(quoteText([ordered])).toBe('1. un\n2. deux');
});

test('a soft wrap in the source copies as a space; code keeps its lines', () => {
  // A `>`-quoted sentence carried over two source lines is one sentence when read.
  expect(quoteText([text('une phrase\ncoupée')])).toBe('une phrase coupée');
  // A fold (`ScrollableBlock`, marked by its title) wraps code and tool output: verbatim.
  const fold = React.createElement('Fold', { title: 'ts block' }, text('ligne1\nligne2'));
  expect(quoteText([fold])).toBe('ligne1\nligne2');
});

test('a block with no text yields nothing', () => {
  const nothing = React.createElement('View', { style: {} });
  expect(plainText(nothing)).toBe('');
  expect(quoteText([nothing])).toBe('');
});
