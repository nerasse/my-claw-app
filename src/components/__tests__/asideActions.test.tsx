/**
 * What an aside offers once it is open, and where.
 *
 * A reasoning line folded is one muted line, and the owner wanted the bubble's own marks on it
 * (`bubbleThoughtOnly`). Open, it is a block of text: the copy and the reader belong to *that*, at
 * its bottom, and the head row goes back to being a label -- a head that grows a button is a head
 * that stops sitting on the dot the spine puts beside it. The same rule puts the hour at the bottom
 * right of everything that unfolds (owner, 2026-11-08).
 */

import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CollapsibleAside } from '../CollapsibleAside';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

jest.mock('../../core/textSelection', () => ({ useOpenSelection: () => jest.fn() }));

function render(node: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        {node}
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

/** Every string the tree draws, in reading order. */
function drawn(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

/** The controls a tree draws, by their accessibility label. */
function labels(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string')
    .map(node => node.props.accessibilityLabel as string);
}

const at = new Date(2026, 10, 8, 14, 6).getTime();

describe('a folded aside', () => {
  it('offers nothing to read, copy or stamp while it is folded', () => {
    const tree = render(
      <CollapsibleAside
        label="Reasoning"
        body="ce que le modele a pense"
        showHint="show"
        hideHint="hide"
        clockAt={at}
      />,
    );
    // Nothing is offered to copy yet: there is no text on screen.
    expect(labels(tree)).not.toContain('Copy reasoning');
    // The hour is the unfolded block's, never the folded line's (owner, 2026-11-08: "quand un
    // reasoning est fermé, il ne faut pas afficher le wait, le copier et l'heure").
    expect(drawn(tree)).not.toContain('14:06');
  });
});

/** The wait a call paid before its first word: the folded line does not say it, the open one does. */
describe('the wait figure', () => {
  it('is drawn once the block is open, and not before', () => {
    const tree = render(
      <CollapsibleAside
        label="Reasoning"
        body="ce que le modele a pense"
        showHint="show"
        hideHint="hide"
        right={<Text>wait 3.7 s</Text>}
      />,
    );
    expect(drawn(tree)).not.toContain('wait 3.7 s');
    ReactTestRenderer.act(() => {
      tree.root.findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(drawn(tree)).toContain('wait 3.7 s');
  });
});

describe('an open aside', () => {
  const open = (): ReactTestRenderer.ReactTestRenderer =>
    render(
      <CollapsibleAside
        label="Reasoning"
        body="ce que le modele a pense"
        showHint="show"
        hideHint="hide"
        clockAt={at}
      />,
    );

  it('puts the copy and the reader under the text it just revealed', () => {
    const tree = open();
    ReactTestRenderer.act(() => {
      const toggle = tree.root.findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0];
      toggle!.props.onPress();
    });
    const order = drawn(tree);
    expect(order).toContain('ce que le modele a pense');
    expect(labels(tree)).toContain('Copy reasoning');
    // The block's controls belong to the block, not to the row that opened it.
    expect(order).not.toContain('menu');
  });

  it('closes the unfolded block on its hour, at the bottom right', () => {
    const tree = open();
    ReactTestRenderer.act(() => {
      const toggle = tree.root.findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0];
      toggle!.props.onPress();
    });
    const order = drawn(tree);
    expect(order[order.length - 1]).toBe('14:06');
  });
});

describe('the head row of a spine line', () => {
  it('takes the exact height it is given, folded or open', () => {
    const tree = render(
      <CollapsibleAside label="Reasoning" body="tout" showHint="show" hideHint="hide" headHeight={27} />,
    );
    const box = (): Record<string, unknown> | undefined =>
      tree.root
        .findAllByType(View)
        .map(node => {
          const raw = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
          const flat = raw.flat(Infinity).filter((style: unknown): style is Record<string, unknown> => style !== null && typeof style === 'object');
          return Object.assign({}, ...flat) as Record<string, unknown>;
        })
        .find(style => typeof style.height === 'number');
    expect(box()!.height).toBe(27);
    ReactTestRenderer.act(() => {
      const toggle = tree.root.findAll(node => node.props.accessibilityLabel === 'Reasoning' && typeof node.props.onPress === 'function')[0];
      toggle!.props.onPress();
    });
    // The same row, one state later: the body grew under a head that did not move.
    expect(box()!.height).toBe(27);
  });
});
