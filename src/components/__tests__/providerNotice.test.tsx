/**
 * A provider's note, drawn the way every other block of context is drawn.
 *
 * The owner, 2026-11-14: two red boxes above an answer, full ink, the provider's whole sentence
 * and its `HTTP 429 — {"error":…}` body inside them -- "horrible l'ui des erreurs ... fait un truc
 * clean et qui va avec le reste". A note is context about the run, so it takes the aside shape
 * (as `RunFailure` does), opens by default, and leads with the kind alone: the `[quota]` tag is
 * the server talking to the surface, not to the reader.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ProviderNotice } from '../ProviderNotice';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';
import { noticeOf } from '../../core/notice';
import type { TextItem } from '../../core/chat';

const at = (hour: number, minute: number): number => {
  const day = new Date();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
};

function notice(text: string): TextItem {
  return {
    kind: 'text',
    id: 'n1',
    role: 'agent',
    text,
    attachments: [],
    streaming: false,
    notice: true,
    ts: at(14, 6),
  };
}

function mount(text: string): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ProviderNotice item={notice(text)} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

/** Every string the tree draws, in render order. */
const drawn = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(2).join('')).filter(Boolean);

describe('noticeOf', () => {
  test('the tag becomes a word, and leaves the body alone', () => {
    expect(noticeOf('[quota] deepseek is out of its week allowance')).toEqual({
      kind: 'quota',
      label: 'Quota',
      body: 'deepseek is out of its week allowance',
    });
  });

  test('a note the server forgot to tag is still readable', () => {
    expect(noticeOf('something happened')).toEqual({ label: 'Note', body: 'something happened' });
  });

  test('a kind nobody taught it keeps its own name, capitalised', () => {
    expect(noticeOf('[throttled] later').label).toBe('Throttled');
  });
});

describe('the note in the thread', () => {
  const quota =
    '[quota] synthetic/hf.deepseek-ai/DeepSeek-V4.1-Flash-1017 is out of its week allowance (Week at 100%). Moving on now instead of waiting for a bar that does not move.';

  test('leads with the kind, and never prints the tag', () => {
    const texts = drawn(mount(quota));
    expect(texts).toContain('Quota');
    expect(texts.join(' ')).not.toContain('[quota]');
    expect(texts.join(' ')).toContain('is out of its week allowance');
  });

  test('is open on arrival, and folds away on a tap', () => {
    const tree = mount(quota);
    expect(drawn(tree).join(' ')).toContain('Moving on now');

    const toggle = tree.root.findAll(
      node => node.props?.accessibilityLabel === 'Quota' && node.props?.accessibilityRole === 'button',
    )[0]!;
    ReactTestRenderer.act(() => toggle.props.onPress());
    const folded = drawn(tree).join(' ');
    expect(folded).toContain('Quota');
    expect(folded).not.toContain('Moving on now');
  });

  test('carries its hour once open, and no hour while folded', () => {
    const tree = mount(quota);
    expect(drawn(tree).some(text => text === '14:06')).toBe(true);
    const toggle = tree.root.findAll(
      node => node.props?.accessibilityLabel === 'Quota' && node.props?.accessibilityRole === 'button',
    )[0]!;
    ReactTestRenderer.act(() => toggle.props.onPress());
    expect(drawn(tree).some(text => text === '14:06')).toBe(false);
  });

  test('a fallback note reads as one line of prose, not as a payload', () => {
    const tree = mount('[fallback] deepseek is unavailable (429 · rate limited). This run used gpt instead.');
    const body = drawn(tree).join(' ');
    expect(body).toContain('429 · rate limited');
    expect(body).not.toContain('{');
  });
});
