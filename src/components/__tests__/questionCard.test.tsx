/**
 * The question card: one question per page inside the conversation, a recap, then one send.
 *
 * What is guarded here is what the two earlier shapes each got wrong. From the modal sheet: a
 * pick must never jump ahead of the owner, and Send must never be locked out (an unanswered
 * question is an answer). From the flat form: nothing is sent that was not seen as a whole. And
 * the reason the card exists at all -- the draft lives in the store, so unmounting the card (a
 * scroll, another screen, another conversation) loses neither the answers nor the page.
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

const single: QuestionAskFrame = {
  ...ask,
  id: 'que_solo',
  questions: [{ header: 'Langue', question: 'FR ou EN ?', options: [{ label: 'fr' }, { label: 'en' }] }],
};

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

function render(request: QuestionAskFrame = ask) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  const onReply = jest.fn();
  const onRevealField = jest.fn();
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <QuestionCard request={request} onReply={onReply} onRevealField={onRevealField} />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return { tree, onReply, onRevealField };
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

/** Presses a control by its accessibility label, for the ones whose text is an icon or a word. */
function pressLabel(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  const target = tree.root.findAll(
    n => (n.props as { accessibilityLabel?: string }).accessibilityLabel === label && typeof (n.props as { onPress?: unknown }).onPress === 'function',
  )[0];
  if (!target) throw new Error(`no control labelled: ${label}`);
  ReactTestRenderer.act(() => {
    (target.props as { onPress: () => void }).onPress();
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
    questionStore.ask(single);
  });

  // A card left mounted is still subscribed to the store, so the next test's setup re-renders it
  // outside act() and React says so, loudly, on every line of output.
  afterEach(() => {
    ReactTestRenderer.act(() => {
      for (const tree of mounted.splice(0)) tree.unmount();
    });
  });

  it('a lone question is the page: it sends from where it is asked', () => {
    const { tree, onReply } = render(single);
    expect(hasText(tree, 'FR ou EN ?')).toBe(true);
    // No pager and no recap to walk to: reviewing one answer sitting above the button is
    // ceremony, so the page and the send are the same screen.
    expect(pressables(tree).some(p => p.text.includes('Next'))).toBe(false);
    press(tree, 'fr');
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_solo', [['fr']]);
  });

  it('several questions arrive one at a time', () => {
    const { tree } = render();
    expect(hasText(tree, 'Question 1 of 2')).toBe(true);
    expect(hasText(tree, 'FR ou EN ?')).toBe(true);
    expect(hasText(tree, 'Combien ?')).toBe(false);

    pressLabel(tree, 'Next question');
    expect(hasText(tree, 'Combien ?')).toBe(true);
    expect(hasText(tree, 'FR ou EN ?')).toBe(false);
  });

  it('Send is nowhere but the recap', () => {
    const { tree } = render();
    expect(pressables(tree).some(p => p.text.includes('Send'))).toBe(false);
    // The last question offers the review rather than another Next.
    pressLabel(tree, 'Next question');
    expect(hasText(tree, 'Review ›')).toBe(true);
    pressLabel(tree, 'Review the answers');
    expect(pressables(tree).some(p => p.text.includes('Send'))).toBe(true);
  });

  it('a single-choice pick carries the form forward on its own', () => {
    jest.useFakeTimers();
    try {
      const { tree } = render();
      press(tree, 'fr');
      // Still on the question: the pick is on screen long enough to be seen landing.
      expect(hasText(tree, 'FR ou EN ?')).toBe(true);
      ReactTestRenderer.act(() => {
        jest.advanceTimersByTime(250);
      });
      expect(hasText(tree, 'Combien ?')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a multiple-choice question never moves under the ticking', () => {
    jest.useFakeTimers();
    try {
      const { tree } = render();
      pressLabel(tree, 'Next question');
      press(tree, '1');
      ReactTestRenderer.act(() => {
        jest.advanceTimersByTime(1000);
      });
      // Still there, with the first tick kept: the answer is not finished being built.
      expect(hasText(tree, 'Combien ?')).toBe(true);
      press(tree, '2');
      pressLabel(tree, 'Review the answers');
      expect(hasText(tree, '1, 2')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the recap says what is going out, blanks included, and sends the batch', () => {
    const { tree, onReply } = render();
    press(tree, 'en');
    pressLabel(tree, 'Next question');
    pressLabel(tree, 'Review the answers');

    expect(hasText(tree, 'en')).toBe(true);
    expect(hasText(tree, 'unanswered')).toBe(true);
    expect(hasText(tree, '1/2 answered')).toBe(true);

    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [['en'], []]);
  });

  it('Send is never blocked: a form walked through blind goes out unanswered', () => {
    const { tree, onReply } = render();
    pressLabel(tree, 'Next question');
    pressLabel(tree, 'Review the answers');
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [[], []]);
  });

  // The card cannot scroll itself into view: it does not know it is in a list, and the app draws
  // edge to edge, so Android never resizes the window and never reveals the focused input either.
  it('asks to be revealed when the free-text field takes focus', () => {
    const { tree, onRevealField } = render();
    expect(onRevealField).not.toHaveBeenCalled();
    press(tree, 'Type your own answer');
    const input = tree.root.findAllByType(TextInput)[0]!;
    ReactTestRenderer.act(() => {
      input.props.onFocus?.();
    });
    expect(onRevealField).toHaveBeenCalled();
  });

  it('a long answer is cut in the recap and opens on tap', () => {
    const { tree } = render();
    press(tree, 'Type your own answer');
    const input = tree.root.findAllByType(TextInput)[0]!;
    ReactTestRenderer.act(() => {
      input.props.onChangeText('a very long answer\nover several lines\nand then some\nand more');
    });
    pressLabel(tree, 'Next question');
    pressLabel(tree, 'Review the answers');

    const line = (): ReactTestRenderer.ReactTestInstance =>
      tree.root.findAll(n => n.type === Text && normalized(n.props.children).startsWith('a very long answer'))[0]!;
    expect(line().props.numberOfLines).toBe(3);
    pressLabel(tree, 'The answer to Langue');
    expect(line().props.numberOfLines).toBeUndefined();
  });

  it('the pencil goes back to the question it belongs to', () => {
    const { tree, onReply } = render();
    pressLabel(tree, 'Next question');
    pressLabel(tree, 'Review the answers');
    pressLabel(tree, 'Edit the answer to Langue');

    expect(hasText(tree, 'FR ou EN ?')).toBe(true);
    press(tree, 'fr');
    pressLabel(tree, 'Next question');
    pressLabel(tree, 'Review the answers');
    press(tree, 'Send');
    expect(onReply).toHaveBeenCalledWith('que_1', [['fr'], []]);
  });

  it('Back walks the form the other way', () => {
    const { tree } = render();
    // Nothing to go back to on the first page.
    expect(pressables(tree).some(p => p.text.includes('Back'))).toBe(false);
    pressLabel(tree, 'Next question');
    pressLabel(tree, 'Previous question');
    expect(hasText(tree, 'FR ou EN ?')).toBe(true);
  });

  it('the answers and the page survive the card being unmounted and drawn again', () => {
    const first = render();
    press(first.tree, 'fr');
    pressLabel(first.tree, 'Next question');
    press(first.tree, '2');
    ReactTestRenderer.act(() => first.tree.unmount());

    // Same ask, brand new card: the list unmounts rows that scroll off, and walking to another
    // screen to look something up is the whole point of answering inside the conversation.
    const second = render();
    expect(hasText(second.tree, 'Question 2 of 2')).toBe(true);
    pressLabel(second.tree, 'Review the answers');
    press(second.tree, 'Send');
    expect(second.onReply).toHaveBeenCalledWith('que_1', [['fr'], ['2']]);
  });

  it('once sent the card says so and refuses a second send', () => {
    const { tree, onReply } = render(single);
    press(tree, 'Send');
    expect(hasText(tree, 'Sending…')).toBe(true);
    press(tree, 'Sending…');
    expect(onReply).toHaveBeenCalledTimes(1);
  });
});
