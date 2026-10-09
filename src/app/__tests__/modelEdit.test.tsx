/**
 * The model edit form.
 *
 * Two things it must not do: hide a setting that is in force (a blank field the next save would
 * clear, since a declaration replaces the whole entry), and let a switch look like it works when
 * the provider's transport never reads it.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ScrollView, Text, TextInput } from 'react-native';
import { ModelEditScreen } from '../ModelEditScreen';
import type { ModelDeclaration, ModelOption } from '../../core/protocol';

function option(over: Partial<ModelOption> = {}): ModelOption {
  return { id: 'litellm/mimo-v2.6-pro', label: 'mimo-v2.6-pro', provider: 'litellm', ...over };
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap(node => {
    const children = node.props.children;
    return typeof children === 'string' ? [children] : [];
  });
}

function press(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  ReactTestRenderer.act(() => {
    tree.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}

function render(over: { model?: ModelOption | null; providerType?: string } = {}): {
  tree: ReactTestRenderer.ReactTestRenderer;
  saved: ModelDeclaration[];
} {
  const saved: ModelDeclaration[] = [];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ModelEditScreen
        mode="edit"
        model={over.model ?? option()}
        provider="litellm"
        providerType={over.providerType ?? 'openai'}
        declared
        discovered
        error={null}
        busy={false}
        onSave={entry => saved.push(entry)}
        onDelete={() => {}}
        onBack={() => {}}
      />,
    );
  });
  return { tree, saved };
}

test('the form opens on the budget and the reasoning field that are in force', () => {
  const { tree } = render({ model: option({ output: 131072, reasoningField: 'reasoning_content' }) });
  // A blank output field over a real 131072 is what the next save would silently clear.
  const values = tree.root.findAllByType(TextInput).map(node => node.props.value);
  expect(values).toContain('131072');
  expect(tree.root.findByProps({ accessibilityLabel: 'Reasoning field content, selected' })).toBeTruthy();
});

test('saving keeps the reasoning field, and tapping it again clears it', () => {
  const { tree, saved } = render({ model: option({ reasoningField: 'reasoning_content' }) });
  press(tree, 'Save model');
  expect(saved[0]?.reasoningField).toBe('reasoning_content');

  const second = render({ model: option({ reasoningField: 'reasoning_content' }) });
  press(second.tree, 'Reasoning field content, selected');
  press(second.tree, 'Save model');
  expect(second.saved[0]?.reasoningField).toBeUndefined();
});

test('a provider whose transport reads no thinking type is told so', () => {
  const { tree } = render({ providerType: 'openai' });
  expect(texts(tree).some(line => line.includes('only the Anthropic transport sends a thinking type'))).toBe(true);
  expect(texts(tree).some(line => line.includes('not read by openai'))).toBe(true);
});

test('an Anthropic provider keeps the refusal warning instead', () => {
  const { tree } = render({ providerType: 'anthropic' });
  expect(texts(tree).some(line => line.includes('leave both off unless /v1/models said so'))).toBe(true);
  expect(texts(tree).some(line => line.includes('only the Anthropic transport'))).toBe(false);
});

test('save sits in the header, out of the scroll: the keyboard cannot take it off screen', () => {
  const { tree } = render();
  const save = tree.root.findByProps({ accessibilityLabel: 'Save model' });
  let node = save.parent;
  while (node) {
    expect(node.type).not.toBe(ScrollView);
    node = node.parent;
  }
});
