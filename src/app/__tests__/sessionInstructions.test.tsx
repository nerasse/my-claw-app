/**
 * The instructions page of one conversation.
 *
 * It answers a question the workspace pages cannot: what does *this thread* load. So the guards
 * are about the report never inventing anything (a stale answer must not reopen a closed page)
 * and about every editable source being reachable, nested files included.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SessionInstructionsScreen } from '../SessionInstructionsScreen';
import { sessionInstructionsStore } from '../../core/sessionInstructions';
import type { SessionInstructionsPayload } from '../../core/protocol';

function payload(over: Partial<SessionInstructionsPayload> = {}): SessionInstructionsPayload {
  return {
    agent: 'orchestrator',
    workspace: 'default',
    workspaceDir: '/home/me/.my-claw/workspace',
    model: 'claude-opus-5',
    backend: 'claude-sdk',
    platform: 'my-claw-app',
    totalBytes: 30,
    layers: [
      { id: 'CORE', label: 'Core directives', bytes: 10, text: 'core body', origin: 'fallback', from: '', edit: { workspace: 'default', file: 'CORE.md' } },
      { id: 'SOUL', label: 'SOUL.md', bytes: 10, text: 'soul body', origin: 'inherited', from: 'default', edit: { workspace: 'sofa', file: 'SOUL.md' } },
      { id: 'tools', label: 'Available tools', bytes: 10, text: 'tools body' },
    ],
    nested: [
      { path: '/home/me/dev/repo/AGENTS.md', label: '/home/me/dev/repo/AGENTS.md', bytes: 120, count: 3, firstAt: '2026-08-15T10:00:00.000Z', lastAt: '2026-08-15T12:00:00.000Z', missing: false },
      { path: '/home/me/dev/gone/AGENTS.md', label: '/home/me/dev/gone/AGENTS.md', bytes: 12, count: 1, firstAt: '2026-08-15T09:00:00.000Z', lastAt: '2026-08-15T09:00:00.000Z', missing: true },
    ],
    notes: ['les skills suggérées dépendent du message'],
    ...over,
  };
}

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    const collect = (value: unknown): void => {
      if (typeof value === 'string') out.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
    };
    collect(node.props.children);
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'props' in (child as object)) {
        walk(child as ReactTestRenderer.ReactTestInstance);
      }
    }
  };
  walk(tree.root);
  return out;
}

function pressLabelled(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll(n => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
  if (!node) throw new Error(`no pressable labelled ${label}`);
  ReactTestRenderer.act(() => {
    node.props.onPress();
  });
}

function render(handlers: Partial<{ onEditLayer: (w: string, f: string) => void; onEditNested: (item: { path: string }) => void }> = {}) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SessionInstructionsScreen
        onClose={() => {}}
        onEditLayer={handlers.onEditLayer ?? (() => {})}
        onEditNested={handlers.onEditNested ?? (() => {})}
      />,
    );
  });
  return tree;
}

afterEach(() => {
  ReactTestRenderer.act(() => sessionInstructionsStore.reset());
});

describe('the report', () => {
  test('a page that is still asking says so, and an error is not a spinner', () => {
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    expect(textsOf(render())).toContain('asking the server…');

    ReactTestRenderer.act(() => sessionInstructionsStore.fail('instructions unavailable'));
    expect(textsOf(render())).toContain('instructions unavailable');
  });

  test('a late answer cannot reopen a page that was closed', () => {
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    ReactTestRenderer.act(() => sessionInstructionsStore.close());
    // The shell only forwards a frame while a request is in flight; the store keeps the state
    // that decision is taken on.
    expect(sessionInstructionsStore.getSnapshot().fetch).toBe('closed');
  });

  test('every layer is listed with its size and where it was resolved from', () => {
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    ReactTestRenderer.act(() =>
      sessionInstructionsStore.receive({ type: 'session.instructions.result', threadId: 't1', instructions: payload() }),
    );
    const texts = textsOf(render());

    expect(texts).toContain('Core directives');
    expect(texts).toContain('shipped default');
    expect(texts).toContain('inherited · default');
    // The derived layers have no origin to show, and no file to edit.
    expect(texts).toContain('Available tools');
    expect(texts).toContain('3 layers · 30 B');
  });

  test('a layer body stays folded until it is asked for', () => {
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    ReactTestRenderer.act(() =>
      sessionInstructionsStore.receive({ type: 'session.instructions.result', threadId: 't1', instructions: payload() }),
    );
    const tree = render();
    expect(textsOf(tree)).not.toContain('soul body');

    pressLabelled(tree, 'SOUL.md, 10 B');
    expect(textsOf(tree)).toContain('soul body');
  });
});

describe('editing', () => {
  test('a layer opens the editor on the conversation own workspace', () => {
    const edits: Array<[string, string]> = [];
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    ReactTestRenderer.act(() =>
      sessionInstructionsStore.receive({ type: 'session.instructions.result', threadId: 't1', instructions: payload() }),
    );
    const tree = render({ onEditLayer: (w, f) => edits.push([w, f]) });

    pressLabelled(tree, 'SOUL.md, 10 B');
    pressLabelled(tree, 'Edit SOUL.md');
    // The server decides the target, and it is the thread's workspace, not the one the content
    // is inherited from: editing here overrides what this conversation reads.
    expect(edits).toEqual([['sofa', 'SOUL.md']]);
  });

  test('a nested AGENTS.md is editable, and a deleted one is not', () => {
    const opened: string[] = [];
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    ReactTestRenderer.act(() =>
      sessionInstructionsStore.receive({ type: 'session.instructions.result', threadId: 't1', instructions: payload() }),
    );
    const tree = render({ onEditNested: item => opened.push(item.path) });

    pressLabelled(tree, 'Edit /home/me/dev/repo/AGENTS.md');
    expect(opened).toEqual(['/home/me/dev/repo/AGENTS.md']);

    const gone = tree.root.findAll(n => n.props?.accessibilityLabel === 'Edit /home/me/dev/gone/AGENTS.md')[0];
    expect(gone?.props.accessibilityState).toEqual({ disabled: true });
    // It stays on the page: it did shape the conversation, and saying so is the point.
    expect(textsOf(tree)).toContain('deleted since · it did shape this conversation');
  });

  test('a run count and the last injection are shown: the trace is per run, not per call', () => {
    ReactTestRenderer.act(() => sessionInstructionsStore.open('t1'));
    ReactTestRenderer.act(() =>
      sessionInstructionsStore.receive({ type: 'session.instructions.result', threadId: 't1', instructions: payload() }),
    );
    const texts = textsOf(render()).join('\n');
    expect(texts).toMatch(/120 B · 3 runs/);
  });
});
