/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { AgentMarkdown } from '../src/components/AgentMarkdown';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import type { HistoryEntry } from '../src/core/protocol';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-reasoning';

const THOUGHT = 'comparing the decimal parts of both numbers';

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

async function renderWith(entries: HistoryEntry[]): Promise<Tree> {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, entries);
  });
  return tree;
}

function replyWithReasoning(): HistoryEntry[] {
  return [
    { id: 'h-0', role: 'user', text: '9.11 ou 9.8 ?', ts: '2026-01-01T10:00:00.000Z' },
    { id: 'h-1', role: 'assistant', text: '9.11', ts: '2026-01-01T10:00:01.000Z', reasoning: THOUGHT },
  ];
}

/** Presses the node that owns the handler for an accessibility label. */
function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0];
    if (!target) throw new Error(`no pressable labelled ${label}`);
    target.props.onPress();
  });
}

test('the reasoning is collapsed by default: the line shows, the thinking does not', async () => {
  const tree = await renderWith(replyWithReasoning());
  await waitFor(() => textsOf(tree).includes('9.11'));

  expect(textsOf(tree)).toContain('Reasoning');
  // The body must not be in the tree at all, not merely hidden.
  expect(textsOf(tree)).not.toContain(THOUGHT);
  await unmount(tree);
});

test('tapping the line reveals the thinking, tapping again hides it', async () => {
  const tree = await renderWith(replyWithReasoning());
  await waitFor(() => textsOf(tree).includes('Reasoning'));

  await pressLabel(tree, 'Reasoning');
  expect(textsOf(tree)).toContain(THOUGHT);

  await pressLabel(tree, 'Reasoning');
  expect(textsOf(tree)).not.toContain(THOUGHT);
  await unmount(tree);
});

/**
 * The model writes its thinking in markdown -- lists, paths, code spans -- and it used to be
 * dumped as one raw blob. It renders like the answer does, one tone down (see MarkdownTone),
 * and only once opened: the body grows with every streamed delta, and parsing a folded block
 * on each one would be work nobody can see.
 */
test('the thinking renders as markdown, at aside tone, and only once opened', async () => {
  const tree = await renderWith(replyWithReasoning());
  await waitFor(() => textsOf(tree).includes('Reasoning'));

  expect(tree.root.findAllByType(AgentMarkdown).some(node => node.props.tone === 'aside')).toBe(false);

  await pressLabel(tree, 'Reasoning');
  const aside = tree.root.findAllByType(AgentMarkdown).filter(node => node.props.tone === 'aside');
  expect(aside).toHaveLength(1);
  expect(aside[0]?.props.text).toBe(THOUGHT);
  await unmount(tree);
});

test('a reply that produced no reasoning shows no line at all', async () => {
  const tree = await renderWith([
    { id: 'h-0', role: 'assistant', text: 'plain answer', ts: '2026-01-01T10:00:00.000Z' },
  ]);
  await waitFor(() => textsOf(tree).includes('plain answer'));

  expect(textsOf(tree)).not.toContain('Reasoning');
  expect(labelsOf(tree)).not.toContain('Reasoning');
  await unmount(tree);
});

test('a live run shows Thinking… before any text arrives', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', THOUGHT);
  });
  await waitFor(() => textsOf(tree).includes('Thinking…'));

  expect(textsOf(tree)).toContain('Thinking…');
  expect(textsOf(tree)).not.toContain(THOUGHT);
  await unmount(tree);
});

test('the line becomes Reasoning once the run is over', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', THOUGHT);
    chatStore.appendDelta(THREAD, 's1', 'the answer');
  });
  await waitFor(() => textsOf(tree).includes('Thinking…'));

  await ReactTestRenderer.act(async () => {
    chatStore.endStream(THREAD, 's1');
  });
  await waitFor(() => textsOf(tree).includes('Reasoning'));
  expect(textsOf(tree)).not.toContain('Thinking…');
  await unmount(tree);
});

describe('a redacted engine', () => {
  // The Claude bridge sends a count and no text, so there is nothing to expand: a control that
  // opens nothing is worse than no control.
  test('shows a count and exposes no button', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => {
      chatStore.startStream(THREAD, 's1');
      chatStore.setReasoningTokens(THREAD, 's1', 1240);
    });
    await waitFor(() => textsOf(tree).some(text => text.includes('Thinking…')));

    expect(textsOf(tree)).toContain('Thinking… 1.2k tokens');
    expect(labelsOf(tree)).not.toContain('Thinking…');
    await unmount(tree);
  });

  test('reads in the past tense once the run ended', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => {
      chatStore.startStream(THREAD, 's1');
      chatStore.setReasoningTokens(THREAD, 's1', 800);
      chatStore.appendDelta(THREAD, 's1', 'done');
      chatStore.endStream(THREAD, 's1');
    });
    await waitFor(() => textsOf(tree).some(text => text.includes('Thought')));

    expect(textsOf(tree)).toContain('Thought · 800 tokens');
    await unmount(tree);
  });
});
