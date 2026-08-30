/**
 * The one layout rule the bubble must not drift from: the answer reads before the file it
 * produced. A regression here is exactly what a screenshot of an agent reply with an attached
 * image caught: the file sat above the words.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Bubble } from '../Bubble';
import type { TextItem } from '../../core/chat';

/** Flatten children into the strings they render, whichever nesting shape ReactMemo gave them. */
function flattenTexts(node: ReactTestRenderer.ReactTestInstance, out: string[]): void {
  const push = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(push);
  };
  push(node.props.children);
  for (const child of node.children) {
    if (child && typeof child === 'object' && 'props' in (child as object)) {
      flattenTexts(child as ReactTestRenderer.ReactTestInstance, out);
    }
  }
}

function render(item: TextItem) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Bubble
        item={item}
        mediaBase="http://host:8080"
        deviceInfo={null}
        grouped={false}
        showTime={false}
        onMenu={() => {}}
      />,
    );
  });
  return tree;
}

describe('Bubble layout', () => {
  it('renders the text before the agent attachments', () => {
    const tree = render({
      kind: 'text',
      id: 'a1',
      role: 'agent',
      text: 'voici le fichier',
      attachments: [{ id: 'f1', type: 'file', filename: 'out.zip' }],
      streaming: false,
      ts: 1,
    });
    const texts: string[] = [];
    flattenTexts(tree.root, texts);
    const at = texts.indexOf('voici le fichier');
    const file = texts.indexOf('out.zip');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(file).toBeGreaterThan(-1);
    expect(at).toBeLessThan(file);
  });

  it('keeps the owner caption under its own capture', () => {
    const tree = render({
      kind: 'text',
      id: 'u1',
      role: 'user',
      text: 'regarde cette capture',
      attachments: [{ id: 'i1', type: 'image', filename: 'shot.png' }],
      streaming: false,
      ts: 1,
    });
    const texts: string[] = [];
    flattenTexts(tree.root, texts);
    const at = texts.indexOf('regarde cette capture');
    const file = texts.indexOf('shot.png');
    // The capture sits above its caption: the photo is the message, the words append to it.
    expect(file).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(file);
  });
});
