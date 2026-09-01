/**
 * The question card: every question of one ask on screen at once, answered in any order, sent as
 * one batch. Guards what the sheet it replaces got wrong -- a pick must not jump ahead, Send must
 * never be locked out -- and the reason the card exists at all: the draft lives in the store, so
 * unmounting the card (a scroll, another screen, another conversation) does not lose it.
 */

import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QuestionCard } from '../QuestionCard';
import { questionStore } from '../../core/questionStore';
import type { QuestionAskFrame } from '../../core/protocol';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const ask: QuestionAskFrame = {
  type: 'question.ask',
  id: 'que_1',
  threadId: 't1',
  questions: [
    { header: 'Langue', question: 'FR ou EN ?', options: [{ label: 'fr' }, { label: 'en' }] },
    { header: 'Fenetres', question: 'Combien ?', options: [{ label: '1' }, { label: '2' }], multiple: true },
  ],
  replyToId: 't-call-1',
  ts: 'iso',
};

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

function render(request: QuestionAskFrame = ask) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  const onReply = jest.fn();
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <QuestionCard request={request} onReply={onReply} />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return { tree, onReply };
}

/** Pressables are matched by the text they carry: `Pressable` itself is not findable by type. */
function pressables(tree: ReactTestRenderer.ReactTestRenderer): Array<{ text: string; onPress: () => void }> {
  const out: Array<{ text: string; onPress: () => void }> = [];
  for (const node of tree.root.findAll(n => typeof (n.props as { onPress?: unknown }).onPress === 'function')) {
    const texts: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && 'props' in (v as { props?: unknown })) walk((v as { props: { children?: unknown } }).props.children);
    };
    walk((node.props as { children?: unknown }).children);
    out.push({ text: texts.join(' ').trim(), onPress: (node.props as { onPress: () => void }).onPress });
  }
  return out;
}

function press(tree: ReactTestRenderer.ReactTestRenderer, text: string): void {
  const targets = pressables(tree).filter(p => p.text.includes(text));
  if (targets.length === 0) throw new Error(`no pressable containing: ${text}`);
  ReactTestRenderer.act(() => {
    targets[0]!.onPress();
  });
}

const normalized = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v)
    : Array.isArray(v)
      ? v.map(normalized).join('')
      : '';

function hasText(tree: ReactTestRenderer.ReactTestRenderer, text: string): boolean {
  return tree.root.findAll(n => n.type === Text && normalized(n.props.children).includes(text)).length > 0;
}

describe('QuestionCard', () => {
  beforeEach(() => {
    questionStore.clear();
    questionStore.ask(ask);
  });

  // A card left mounted is still subscribed to the store, so the next test's setup re-renders it
  // outside act() and React says so, loudly, on every line of output.
  afterEach(() => {
    ReactTestRenderer.act(() => {
      for (const tree of mounted.splice(0)) tree.unmount();
    });
  });

  it('shows every question of the ask at once', () => {
    const { tree } = render();
    expect(hasText(tree, 'FR ou EN ?')).toBe(true);
    expect(hasText(tree, 'Combien ?')).toBe(true);
    expect(hasText(tree, 'fr')).toBe(true);
    expect(hasText(tree, '2')).toBe(true);
    expect(hasText(tree, '0/2 answered')).toBe(true);
  });

  it('a pick records without sending, and Send sends the batch', () => {
    const { tree, onReply } = render();
    press(tree, 'fr');
    expect(onReply).not.toHaveBeenCalled();
    expect(hasText(tree, '1/2 answered')).toBe(true);
    press(tree, '2');
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [['fr'], ['2']]);
  });

  it('Send is never blocked: an untouched question is sent unanswered', () => {
    const { tree, onReply } = render();
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [[], []]);
  });

  it('a single-choice pick replaces, a multiple-choice pick accumulates', () => {
    const { tree, onReply } = render();
    press(tree, 'fr');
    press(tree, 'en');
    press(tree, '1');
    press(tree, '2');
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [['en'], ['1', '2']]);
  });

  it('typed text is sent without any confirmation step', () => {
    const { tree, onReply } = render();
    press(tree, 'Type your own answer');
    const input = tree.root.findAllByType(TextInput)[0]!;
    ReactTestRenderer.act(() => {
      input.props.onChangeText('occitan');
    });
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [['occitan'], []]);
  });

  it('what was picked survives the card being unmounted and drawn again', () => {
    const first = render();
    press(first.tree, 'fr');
    ReactTestRenderer.act(() => first.tree.unmount());

    // Same ask, brand new card: the list unmounts rows that scroll off, and walking to another
    // screen to look something up is the whole point of answering inside the conversation.
    const second = render();
    expect(hasText(second.tree, '1/2 answered')).toBe(true);
    press(second.tree, 'Send');
    expect(second.onReply).toHaveBeenCalledWith('que_1', [['fr'], []]);
  });

  it('once sent the card says so and refuses a second send', () => {
    const { tree, onReply } = render();
    press(tree, 'Send');
    expect(hasText(tree, 'Sending…')).toBe(true);
    press(tree, 'Sending…');
    expect(onReply).toHaveBeenCalledTimes(1);
  });
});
