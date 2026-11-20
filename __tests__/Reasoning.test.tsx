/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { AgentMarkdown } from '../src/components/AgentMarkdown';
import { chatStore } from '../src/core/chat';
import { resetAsideExpansion } from '../src/core/asideExpansion';
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

test('a live run shows Reasoning before any text arrives', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', THOUGHT);
  });
  await waitFor(() => textsOf(tree).includes('Reasoning'));

  expect(textsOf(tree)).toContain('Reasoning');
  expect(textsOf(tree)).not.toContain(THOUGHT);
  await unmount(tree);
});

test('the label holds still when the run ends', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', THOUGHT);
    chatStore.appendDelta(THREAD, 's1', 'the answer');
  });
  await waitFor(() => textsOf(tree).includes('Reasoning'));

  await ReactTestRenderer.act(async () => {
    chatStore.endStream(THREAD, 's1');
  });
  // One name for the whole life of the section: nothing renames itself under the reader when the
  // stream seals, which is half of what made an expanded section read as a different, closed one.
  await waitFor(() => textsOf(tree).includes('the answer'));
  expect(textsOf(tree)).toContain('Reasoning');
  expect(textsOf(tree)).not.toContain('Thinking…');
  await unmount(tree);
});

describe('a thought the endpoint kept to itself', () => {
  // The Responses API reports a count for every call and words for only part of them, so there is
  // nothing to expand: a control that opens nothing is worse than no control.
  test('shows a count and exposes no button', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => {
      chatStore.startStream(THREAD, 's1');
      chatStore.setReasoningTokens(THREAD, 's1', 1240);
    });
    await waitFor(() => textsOf(tree).some(text => text.includes('Reasoning')));

    expect(textsOf(tree)).toContain('Reasoning');
    expect(textsOf(tree)).toContain('1.2k tokens');
    expect(labelsOf(tree)).not.toContain('Reasoning');
    await unmount(tree);
  });

  test('does not rename itself once the run ended', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => {
      chatStore.startStream(THREAD, 's1');
      chatStore.setReasoningTokens(THREAD, 's1', 800);
      chatStore.appendDelta(THREAD, 's1', 'done');
      chatStore.endStream(THREAD, 's1');
    });
    await waitFor(() => textsOf(tree).some(text => text.includes('800 tokens')));

    expect(textsOf(tree)).toContain('Reasoning');
    expect(textsOf(tree)).toContain('800 tokens');
    await unmount(tree);
  });
});

test('a replayed turn whose thought had no words still says it thought, and for how long', async () => {
  const tree = await renderWith([
    { id: 'h-0', role: 'user', text: '9.11 ou 9.8 ?', ts: '2026-01-01T10:00:00.000Z' },
    { id: 'h-1', role: 'assistant', text: '9.11', ts: '2026-01-01T10:00:01.000Z', reasoningTokens: 12300, reasoningMs: 9_300 },
  ]);
  await waitFor(() => textsOf(tree).some(text => text.includes('12.3k tokens')), 60);
  expect(textsOf(tree)).toContain('9.3 s');
  await unmount(tree);
});

test('once the run ends, the answer does not draw the thought its fold already holds', async () => {
  // The owner's live screenshot, 2026-11-20: a closed `3 steps` fold, then a bare `Reasoning` above
  // the answer. The stream caches its thought under the bubble id when it seals, and the answer's
  // own line read that cache back after the thought had moved into the fold.
  resetAsideExpansion();
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD, 'r-live');
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', THOUGHT);
    chatStore.appendDelta(THREAD, 's1', 'the answer');
    chatStore.endStream(THREAD, 's1');
    chatStore.endRun(THREAD, 'done');
  });
  await waitFor(() => textsOf(tree).includes('the answer'));
  expect(textsOf(tree)).not.toContain('Reasoning');
  await unmount(tree);
});

test('a reasoning the page left on the server still draws its line, even on a bubble with no text', async () => {
  // `reasoningChars` instead of the text: the server's REASONING_INLINE_LIMIT (docs/run-hydration.md).
  // The earlier cases opened `h-1` and the fold is held per bubble id, outside the tree.
  resetAsideExpansion();
  bridge.sendMessage.mockClear();
  const tree = await renderWith([
    { id: 'h-0', role: 'user', text: '9.11 ou 9.8 ?', ts: '2026-01-01T10:00:00.000Z' },
    { id: 'h-1', role: 'assistant', text: '', ts: '2026-01-01T10:00:01.000Z', reasoningChars: 4800 },
    { id: 'h-2', role: 'assistant', text: '9.11', ts: '2026-01-01T10:00:02.000Z', reasoningChars: 900 },
  ]);
  await waitFor(() => labelsOf(tree).includes('Reasoning'));
  // Both lines drawn, the one with no answer under it included; neither asked before it opens.
  const lineOf = (id: string) => tree.root.findAll(node => node.props.id === id && node.props.reasoningChars !== undefined);
  expect(lineOf('h-1').length).toBeGreaterThan(0);
  expect(lineOf('h-2').length).toBeGreaterThan(0);
  const asks = () => bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as { type: string; id?: string }).filter(frame => frame.type === 'chat.reasoning');
  expect(asks()).toEqual([]);
  // The newest line is the first one in the inverted list.
  await pressLabel(tree, 'Reasoning');
  expect(asks()).toEqual([{ type: 'chat.reasoning', threadId: THREAD, id: 'h-2' }]);
  await unmount(tree);
});
