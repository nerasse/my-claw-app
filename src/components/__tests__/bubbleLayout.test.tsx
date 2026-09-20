/**
 * The one layout rule the bubble must not drift from: the answer reads before the file it
 * produced. A regression here is exactly what a screenshot of an agent reply with an attached
 * image caught: the file sat above the words.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Bubble } from '../Bubble';
import { ChatFontScaleContext } from '../../theme';
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

function render(item: TextItem, scale = 1) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ChatFontScaleContext.Provider value={scale}>
        <Bubble
          item={item}
          mediaBase="http://host:8080"
          deviceInfo={null}
          grouped={false}
          showTime={false}
          onMenu={() => {}}
        />
      </ChatFontScaleContext.Provider>,
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

  it('fills the row: a bubble takes the whole column, like a tool card', () => {
    const tree = render({
      kind: 'text',
      attachments: [],
      id: 'a1',
      role: 'agent',
      text: 'coucou',
      streaming: false,
      ts: 1,
    });
    const widths = tree.root
      .findAll(
        node =>
          node.props.style &&
          (Array.isArray(node.props.style) ? node.props.style : [node.props.style]).some(
            (entry: unknown) => entry && typeof entry === 'object' && 'width' in (entry as object) && (entry as { width?: unknown }).width === '100%',
          ),
        { deep: true },
      )
      .map(node => node.props.style);
    expect(widths.length).toBeGreaterThan(0);
  });

  it('lets the words heard in a voice note take the bubble, like any other text', () => {
    const heard = 'Le texte entendu, assez long pour se replier sur plusieurs lignes dans la bulle.';
    const tree = render({
      kind: 'text',
      id: 'u2',
      role: 'user',
      text: '',
      attachments: [
        { id: 'a1', type: 'audio', filename: 'voice.m4a', uri: 'file:///voice.m4a', durationMs: 22_960 },
      ],
      transcripts: { a1: heard },
      streaming: false,
      ts: 1,
    });
    const transcript = tree.root.findAll(
      node => node.props.children === heard && node.props.style !== undefined,
    );
    expect(transcript.length).toBeGreaterThan(0);
    // A `maxWidth: 260` here dated from when a bubble was sized by its content, so 260 *was* the
    // width of a voice bubble; bubbles have been full width since, and the words sat in 30% of a
    // desktop bubble and stopped 110pt short of the edge on a phone (owner, 2026-09-20).
    const flat = transcript.flatMap(node =>
      Array.isArray(node.props.style) ? node.props.style : [node.props.style],
    );
    const capped = flat.filter(
      entry => entry && typeof entry === 'object' && 'maxWidth' in (entry as object),
    );
    expect(capped).toEqual([]);
  });

  it('lays the message menu under the bubble, on the author side', () => {
    // Agent (system): the ⋯ row is right-aligned.
    const agentTree = render({
      kind: 'text',
      attachments: [],
      id: 'a1',
      role: 'agent',
      text: 'coucou',
      streaming: false,
      ts: 1,
    });
    const agentMenuRow = agentTree.root.findAll(
      node =>
        node.props.style &&
        (Array.isArray(node.props.style) ? node.props.style : [node.props.style]).some(
          (entry: unknown) => entry && typeof entry === 'object' && 'justifyContent' in (entry as object) && (entry as { justifyContent?: unknown }).justifyContent === 'flex-end',
        ),
      { deep: true },
    );
    expect(agentMenuRow.length).toBeGreaterThan(0);

    // User: left-aligned.
    const userTree = render({
      kind: 'text',
      attachments: [],
      id: 'u1',
      role: 'user',
      text: 'coucou',
      streaming: false,
      ts: 1,
    });
    const userMenuRow = userTree.root.findAll(
      node =>
        node.props.style &&
        (Array.isArray(node.props.style) ? node.props.style : [node.props.style]).some(
          (entry: unknown) => entry && typeof entry === 'object' && 'justifyContent' in (entry as object) && (entry as { justifyContent?: unknown }).justifyContent === 'flex-start',
        ),
      { deep: true },
    );
    expect(userMenuRow.length).toBeGreaterThan(0);
  });

  it('a larger scale raises the message body size', () => {
    // A user message renders through the plain Text path (markdown is the agent's), so the
    // body size is directly inspectable there.
    const userItem = (id: string): TextItem => ({
      kind: 'text',
      attachments: [],
      id,
      role: 'user',
      text: 'coucou',
      streaming: false,
      ts: 1,
    });
    const atDefault = render(userItem('a1'));
    const atLarge = render(userItem('a2'), 1.15);
    const fontSizeOf = (tree: ReactTestRenderer.ReactTestRenderer) => {
      const text = tree.root.findAll(
        node =>
          String(node.props.children).includes('coucou') &&
          node.props.style &&
          (Array.isArray(node.props.style) ? node.props.style : [node.props.style]).some(
            (entry: unknown) => entry && typeof entry === 'object' && 'fontSize' in (entry as object),
          ),
        { deep: true },
      )[0];
      if (!text) return null;
      const flat = (Array.isArray(text.props.style) ? text.props.style : [text.props.style]).filter(Boolean);
      const sizes = flat.map((entry: unknown) => entry as { fontSize?: unknown }).map(e => e.fontSize).filter((v): v is number => typeof v === 'number');
      return Math.max(...sizes);
    };
    const base = fontSizeOf(atDefault);
    const scaled = fontSizeOf(atLarge);
    expect(base).toBe(14); // font.body at scale 1
    expect(scaled).toBe(16); // Math.round(14 * 1.15)
  });
});
