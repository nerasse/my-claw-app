/**
 * The question sheet: one ask, N questions, tap through to the recap, single batch reply.
 * Guards the flow end to end: options advance, multiple toggles, custom input saves, and the
 * recap sends one `question.reply` payload with every answer.
 */

import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QuestionSheet } from '../QuestionSheet';
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
  ts: 'iso',
};

function render(props: Partial<React.ComponentProps<typeof QuestionSheet>> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  const onReply = jest.fn();
  const onDismiss = jest.fn();
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <QuestionSheet request={ask} pending={0} onReply={onReply} onDismiss={onDismiss} {...props} />
      </ThemeContext.Provider>,
    );
  });
  return { tree, onReply, onDismiss };
}

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

function hasText(tree: ReactTestRenderer.ReactTestRenderer, text: string): boolean {
  const normalized = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(normalized).join('') : '');
  return tree.root.findAll(n => n.type === Text && normalized(n.props.children).includes(text)).length > 0;
}

describe('QuestionSheet', () => {
  it('shows the first question and its options', () => {
    const { tree } = render();
    expect(hasText(tree, 'FR ou EN ?')).toBe(true);
    expect(hasText(tree, 'fr')).toBe(true);
    expect(hasText(tree, 'en')).toBe(true);
  });

  it('a single-question ask submits immediately', () => {
    const single: QuestionAskFrame = {
      type: 'question.ask',
      id: 'que_s',
      threadId: 't1',
      questions: [{ header: 'h', question: 'q', options: [{ label: 'only' }] }],
      ts: 'iso',
    };
    const { tree, onReply } = render({ request: single });
    press(tree, 'only');
    expect(onReply).toHaveBeenCalledWith([['only']]);
  });

  it('multi-question: picking advances and the recap sends everything', () => {
    const { tree, onReply } = render();
    press(tree, 'fr');
    expect(hasText(tree, 'Combien ?')).toBe(true);
    press(tree, '1');
    press(tree, '2');
    press(tree, 'Next');
    expect(hasText(tree, 'Review')).toBe(true);
    press(tree, 'Send answers');
    expect(onReply).toHaveBeenCalledWith([['fr'], ['1', '2']]);
  });

  it('custom answer is stored and submitted', () => {
    const single: QuestionAskFrame = {
      type: 'question.ask',
      id: 'que_c',
      threadId: 't1',
      questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }],
      ts: 'iso',
    };
    const { tree, onReply } = render({ request: single });
    press(tree, 'Type your own answer');
    const input = tree.root.findAllByType(TextInput)[0]!;
    ReactTestRenderer.act(() => {
      input.props.onChangeText('ma reponse');
    });
    ReactTestRenderer.act(() => {
      tree.root.findAllByType(TextInput)[0]!.props.onSubmitEditing();
    });
    expect(onReply).toHaveBeenCalledWith([['ma reponse']]);
  });
});
