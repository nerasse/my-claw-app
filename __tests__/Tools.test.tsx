/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { ToolsScreen } from '../src/app/ToolsScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import type { ToolEntry } from '../src/core/protocol';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const KEPT = 'thread-kept';

const TOOLS: ToolEntry[] = [
  { name: 'read', description: 'Read a file from the workspace', source: 'built-in', disabled: false },
  { name: 'bash', description: 'Run a command in the workspace', source: 'built-in', disabled: true },
  { name: 'my_weather', description: 'Forecast for a city', source: 'plugin', disabled: false },
  { name: 'mcp__mailcow__get_status', description: 'Mail server status', source: 'mcp', server: 'mailcow', disabled: false },
  { name: 'mcp__mailcow__send_mail', description: 'Send a mail', source: 'mcp', server: 'mailcow', disabled: false },
  { name: 'mcp__weather__get_forecast', description: 'Hourly forecast', source: 'mcp', server: 'weather', disabled: false },
];

/** Renders the page on its own: the catalog screen is pure props in, so a direct render is
 *  deterministic where the full-app one is at the mercy of the list's render window. */
async function renderScreen(tools: ToolEntry[], missing: string[] = []): Promise<Tree> {
  let tree!: Tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <ToolsScreen tools={tools} missing={missing} saving={false} onBack={() => {}} onToggle={() => {}} />
      </ThemeProvider>,
    );
  });
  return tree;
}

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function summary(threadId: string, title: string) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
  };
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

/** The chat screen's 40ms scroll timer must fire before unmount, or the next test crashes. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: KEPT });
});

test('the page groups tools by source', async () => {
  const tree = await renderScreen(TOOLS);

  expect(textsOf(tree)).toEqual(
    expect.arrayContaining(['Built-in', 'Custom', 'MCP', 'read', 'bash', 'my_weather']),
  );

  await unmount(tree);
});

test('a disabled tool is flagged instead of hidden', async () => {
  const tree = await renderScreen(TOOLS);

  expect(labelsOf(tree)).toContain('bash disabled');
  expect(textsOf(tree)).toContain('disabled');

  await unmount(tree);
});

test('MCP tools are grouped per server under their own headers', async () => {
  const tree = await renderScreen(TOOLS.filter(tool => tool.source === 'mcp' && tool.server === 'mailcow'));

  expect(textsOf(tree)).toEqual(
    expect.arrayContaining(['mailcow', 'mcp__mailcow__*', 'get_status', 'send_mail']),
  );
  // The namespace prefix is dropped: the server sub-group header already names it.
  expect(textsOf(tree)).not.toContain('mcp__mailcow__get_status');

  await unmount(tree);
});

test('an empty catalog says so instead of spinning', async () => {
  const tree = await renderScreen([]);

  expect(textsOf(tree)).toContain('no tools found');

  await unmount(tree);
});

test('the tools page asks for the catalog when it opens', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await waitFor(() => labelsOf(tree).includes('Open tools'));
  await pressLabel(tree, 'Open tools');

  const asked = bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as { type: string },
  );
  expect(asked.map(f => f.type)).toEqual(expect.arrayContaining(['tools.list']));

  await settleAndUnmount(tree);
});

test('an old server answers an error instead of a spinning page', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await waitFor(() => labelsOf(tree).includes('Open tools'));
  await pressLabel(tree, 'Open tools');

  await emit({ type: 'error', scope: 'tools', message: 'tool catalog unavailable' });
  await waitFor(() => textsOf(tree).some(text => text.includes('tool catalog unavailable')));

  await settleAndUnmount(tree);
});

test('the settings index asks for the catalogs so the counts are ready without a visit', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');

  const asked = bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as { type: string },
  );
  expect(asked.map(f => f.type)).toEqual(expect.arrayContaining(['skills.list', 'tools.list']));

  await settleAndUnmount(tree);
});

test('the settings index shows the tool count', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await emit({ type: 'tools.list.result', tools: TOOLS });

  await waitFor(() => textsOf(tree).some(text => text.includes('6 tools')));

  await settleAndUnmount(tree);
});

describe('asking before a tool runs', () => {
  // Tool approvals left the index for this page (owner, 2026-10-04): the switch lives on the tool.
  async function renderAsking(tools: ToolEntry[], onConfirm: (name: string, confirm: boolean) => void): Promise<Tree> {
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <ToolsScreen tools={tools} missing={[]} saving={false} onBack={() => {}} onToggle={() => {}} onConfirm={onConfirm} onOpenApprovals={() => {}} />
        </ThemeProvider>,
      );
    });
    return tree;
  }

  it('a tool turns asking on and off, and says it asks', async () => {
    const calls: Array<[string, boolean]> = [];
    const tools = TOOLS.map(tool => ({ ...tool, confirm: tool.name === 'my_weather' }));
    const tree = await renderAsking(tools, (name, confirm) => calls.push([name, confirm]));
    expect(labelsOf(tree)).toContain('my_weather asks first');
    await pressLabel(tree, 'Ask before running read');
    await pressLabel(tree, 'Ask before running my_weather');
    expect(calls).toEqual([['read', true], ['my_weather', false]]);
    // A tool that is off is never run: there is nothing to ask about.
    expect(labelsOf(tree)).not.toContain('Ask before running bash');
    expect(labelsOf(tree)).toContain('Open tool approvals');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('a server that cannot ask offers no switch that would do nothing', async () => {
    const tree = await renderAsking(TOOLS, () => {});
    expect(labelsOf(tree).some(label => label.startsWith('Ask before running'))).toBe(false);
    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
