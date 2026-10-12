/**
 * A run of pictures is one carousel, at the pictures' own shape.
 *
 * The stage used to be a fixed 190x190 square with `contain`, so a wide browser capture was drawn
 * 190x77 inside its own box and two thirds of the height was the empty band the owner kept
 * scrolling past; five captures of one run cost five of those boxes. The grouping rule and the
 * geometry are the two promises here: consecutive pictures travel together, and a box is the
 * picture's shape, clamped so neither a 3:1 capture nor a tall page can own the screen.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Bubble } from '../Bubble';
import {
  CAROUSEL_MAX_HEIGHT,
  MediaCarousel,
  MEDIA_MIN_HEIGHT,
  isCarouselMedia,
  mediaHeight,
  mediaItemsOf,
  type MediaItem,
} from '../MediaCarousel';
import { ChatFontScaleContext } from '../../theme';
import type { AttachmentMeta } from '../../core/protocol';
import type { TextItem } from '../../core/chat';

const shot = (n: number): AttachmentMeta => ({ id: `m${n}`, type: 'image', filename: `shot-${n}.png` });

const items = (n: number): MediaItem[] =>
  Array.from({ length: n }, (_, i) => ({ url: `http://h/media/${i}`, filename: `shot-${i}.png` }));

function render(element: React.JSX.Element): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ChatFontScaleContext.Provider value={1}>{element}</ChatFontScaleContext.Provider>,
    );
  });
  return tree;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap(node =>
    React.Children.toArray(node.props.children).filter((child): child is string => typeof child === 'string'),
  );
}

function byLabel(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(node => node.props.accessibilityLabel === label);
}

describe('the carousel', () => {
  it('steps through the run with the arrows, caption and counter following', () => {
    const tree = render(<MediaCarousel items={items(5)} onOpen={() => {}} />);
    expect(texts(tree)).toContain('shot-0.png');
    expect(texts(tree)).toContain('1/5');

    ReactTestRenderer.act(() => {
      byLabel(tree, 'Next image')[0]!.props.onPress();
    });
    expect(texts(tree)).toContain('shot-1.png');
    expect(texts(tree)).toContain('2/5');

    ReactTestRenderer.act(() => {
      byLabel(tree, 'Previous image')[0]!.props.onPress();
    });
    expect(texts(tree)).toContain('shot-0.png');

    // The first arrow is inert at the start, the last at the end: nothing wraps around.
    expect(byLabel(tree, 'Previous image')[0]!.props.disabled).toBe(true);
  });

  it('opens the gallery on the picture that was on screen, not the first', () => {
    const opened: number[] = [];
    const tree = render(<MediaCarousel items={items(3)} onOpen={index => opened.push(index)} />);
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Next image')[0]!.props.onPress();
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Open attachment shot-1.png')[0]!.props.onPress();
    });
    expect(opened).toEqual([1]);
  });

  it('is not a carousel when there is only one picture', () => {
    const tree = render(<MediaCarousel items={items(1)} onOpen={() => {}} />);
    expect(byLabel(tree, 'Next image')).toHaveLength(0);
    expect(texts(tree)).toContain('shot-0.png');
  });
});

describe('the geometry', () => {
  it('gives a wide capture the whole width and its own height, never a square', () => {
    // 1280x520 is the browser capture of the report; in a 350pt column that is 142pt tall, where
    // the square it replaced always reserved a flat 190 of empty space around it.
    expect(mediaHeight(350, 1280 / 520)).toBe(142);
    expect(mediaHeight(350, 1280 / 520)).toBeLessThan(190);
  });

  it('clamps a very wide capture at the floor and a tall page at the ceiling', () => {
    expect(mediaHeight(350, 10)).toBe(MEDIA_MIN_HEIGHT);
    expect(mediaHeight(350, 0.4, CAROUSEL_MAX_HEIGHT)).toBe(CAROUSEL_MAX_HEIGHT);
  });

  it('falls back to 16:9 while the header has not been read', () => {
    expect(mediaHeight(320, null)).toBe(180);
  });
});

describe('the grouping rule', () => {
  it('collects pictures and videos, and leaves everything else alone', () => {
    expect(isCarouselMedia({ id: 'a', type: 'image', filename: 'a.png' })).toBe(true);
    expect(isCarouselMedia({ id: 'b', type: 'video', filename: 'b.mp4' })).toBe(true);
    expect(isCarouselMedia({ id: 'c', type: 'file', filename: 'c.pdf' })).toBe(false);
    expect(isCarouselMedia({ id: 'd', type: 'image', filename: 'd.png', deleted: true })).toBe(false);
  });

  it('skips a picture with no bytes left, so a run is only grouped when it is whole', () => {
    const run: AttachmentMeta[] = [
      { id: 'm1', type: 'image', filename: 'a.png' },
      { id: 'm2', type: 'image', filename: 'b.png', deleted: true },
    ];
    expect(mediaItemsOf(run, 'http://h', { deviceId: 'd', token: 't', ticket: 'k' })).toHaveLength(1);
  });

  it('draws consecutive pictures as one carousel and the rest as their own rows', () => {
    const item: TextItem = {
      id: 'turn-1',
      kind: 'text',
      role: 'agent',
      text: 'here are the captures',
      ts: Date.now(),
      streaming: false,
      attachments: [shot(1), shot(2), shot(3), { id: 'doc', type: 'file', filename: 'notes.pdf' }],
    };
    const tree = render(
      <Bubble
        item={item}
        mediaBase="http://h"
        deviceInfo={{ deviceId: 'd', token: 't', ticket: 'k' }}
        grouped={false}
        showTime={false}
        onMenu={() => {}}
      />,
    );
    // One carousel with three slides -- not three stacks of one picture -- and the counter names
    // the run. `findAll` would count the arrow's Pressable and the view it renders as two, so the
    // component itself is what gets counted.
    expect(tree.root.findAllByType(MediaCarousel)).toHaveLength(1);
    expect(byLabel(tree, 'Next image').length).toBeGreaterThan(0);
    expect(texts(tree)).toContain('1/3');
    // The document is not part of it.
    expect(texts(tree)).toContain('notes.pdf');
  });
});
