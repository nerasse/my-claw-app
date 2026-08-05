/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { commandStore } from '../src/core/commands';
import { darkPalette, lightPalette } from '../src/theme/palettes';
import type { HistoryEntry } from '../src/core/protocol';
import { renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-ui';

const history: HistoryEntry[] = [
  { id: 'h-0', role: 'user', text: 'check the site', ts: '2026-01-01T10:00:00.000Z' },
  {
    role: 'tool',
    ts: '2026-01-01T10:00:01.000Z',
    id: 'h-1',
    name: 'bash',
    args: { command: 'echo hello' },
    durationMs: 4,
    ok: true,
    output: 'hello',
    truncated: false,
  },
  { id: 'h-2', role: 'assistant', text: 'the command replied', ts: '2026-01-01T10:00:02.000Z' },
];

async function renderWithHistory(): Promise<Tree> {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  await waitFor(() => textsOf(tree).includes('bash'));
  return tree;
}

/** Collects every string inside props.children, including array children. */
function stringsOf(tree: Tree): string[] {
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

beforeEach(() => {
  chatStore.clearAll();
  commandStore.replace([
    { name: 'status', description: 'Session diagnostics: context, tokens, cost' },
    { name: 'model', description: 'Show or change current model' },
    { name: 'help', description: 'List available commands' },
  ]);
  // The stored thread is what the shell reopens, so the seeded history is the one on screen.
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

function inputOf(tree: Tree): ReactTestRenderer.ReactTestInstance {
  return tree.root.find(node => String(node.type) === 'TextInput' && node.props.placeholder === 'message');
}

function typeInto(tree: Tree, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    inputOf(tree).props.onChangeText(text);
  });
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    // Composite and host instances duplicate the props; press the one that can react.
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

test('typing "/" opens the slash-menu, filters live, and inserts on tap', async () => {
  const tree = await renderWithHistory();

  // Entering command mode refetches the catalog from the server.
  await typeInto(tree, '/');
  expect(bridge.sendMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'commands.list' }));

  await waitFor(() => textsOf(tree).includes('Session diagnostics: context, tokens, cost'));
  expect(textsOf(tree)).toContain('Show or change current model');
  expect(textsOf(tree)).toContain('List available commands');

  // Live filtering: "mo" keeps only model.
  await typeInto(tree, '/mo');
  await waitFor(() => !textsOf(tree).includes('Session diagnostics: context, tokens, cost'));
  expect(textsOf(tree)).toContain('Show or change current model');
  expect(textsOf(tree)).not.toContain('List available commands');

  // Tapping a command inserts it with a trailing space, closing the menu.
  const item = tree.root.find(node => node.props.accessibilityLabel?.startsWith('Command model'));
  await ReactTestRenderer.act(async () => {
    item.props.onPress();
  });
  expect(inputOf(tree).props.value).toBe('/model ');
  expect(textsOf(tree)).not.toContain('Show or change current model');

  await unmount(tree);
});

test('the attach button opens the picker sheet and the sheet closes on cancel', async () => {
  const tree = await renderWithHistory();

  await pressLabel(tree, 'Add attachment');
  expect(textsOf(tree)).toContain('Photo from gallery');
  expect(textsOf(tree)).toContain('Take a photo');
  expect(textsOf(tree)).toContain('File');

  await pressLabel(tree, 'Close menu');
  expect(textsOf(tree)).not.toContain('Photo from gallery');
  await unmount(tree);
});

test('the session file explorer lists files with sizes and deletes them', async () => {
  const tree = await renderWithHistory();

  await pressLabel(tree, 'Session files');
  await waitFor(() => textsOf(tree).includes('Session files'));

  // The server answers with the file list.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'files.list.result',
        threadId: THREAD,
        files: [{ id: 'f1', filename: 'note.pdf', type: 'file', mimeType: 'application/pdf', sizeBytes: 5120, ts: '2026-01-01T10:00:00.000Z' }],
        totalBytes: 5120,
      }),
    });
  });
  await waitFor(() => textsOf(tree).includes('note.pdf'));
  expect(stringsOf(tree)).toContain('5.0 KB');

  await pressLabel(tree, 'Delete file note.pdf');
  expect(bridge.sendMessage).toHaveBeenCalledWith(
    JSON.stringify({ type: 'files.delete', threadId: THREAD, id: 'f1' }),
  );

  await unmount(tree);
});

test('a server-published command appears on the next input without a release', async () => {
  const tree = await renderWithHistory();

  await typeInto(tree, '/');
  await waitFor(() => textsOf(tree).includes('Session diagnostics: context, tokens, cost'));

  // The server ships a new catalog while the menu is open; the next input shows it.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'commands.list.result',
        commands: [
          { name: 'status', description: 'Session diagnostics: context, tokens, cost' },
          { name: 'brandnew', description: 'Shipped by the server just now' },
        ],
      }),
    });
  });
  await typeInto(tree, '/b');
  await waitFor(() => textsOf(tree).includes('Shipped by the server just now'));
  expect(textsOf(tree)).not.toContain('Show or change current model');

  await unmount(tree);
});

test('a tool card starts collapsed and reveals arguments and output on tap', async () => {
  const tree = await renderWithHistory();

  // Collapsed: name plus a one-line argument preview, no output block.
  expect(textsOf(tree)).toContain('echo hello');
  expect(textsOf(tree)).not.toContain('arguments');

  const card = tree.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Tool bash'),
  );
  expect(card.props.accessibilityLabel).toContain('4ms');

  await ReactTestRenderer.act(async () => {
    card.props.onPress();
  });
  await waitFor(() => textsOf(tree).includes('arguments'));

  const shown = textsOf(tree).join('|');
  expect(shown).toContain('hello');
  expect(shown).toContain('"command"');
  expect(textsOf(tree)).toContain('copy');

  await unmount(tree);
});

test('an empty thread shows the hero composer, which leaves once history arrives', async () => {
  const tree = await renderApp();

  // Composite and host instances both carry the props; count the host nodes only.
  const heroInputs = tree.root.findAll(
    node => String(node.type) === 'TextInput' && node.props.placeholder === 'Ask anything',
    { deep: true },
  );
  const compactInputs = tree.root.findAll(
    node => String(node.type) === 'TextInput' && node.props.placeholder === 'message',
    { deep: true },
  );
  expect(heroInputs).toHaveLength(1);
  expect(compactInputs).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  await waitFor(() => textsOf(tree).includes('bash'));

  expect(
    tree.root.findAll(node => String(node.type) === 'TextInput' && node.props.placeholder === 'Ask anything', { deep: true }),
  ).toHaveLength(0);
  expect(
    tree.root.findAll(node => String(node.type) === 'TextInput' && node.props.placeholder === 'message', { deep: true }),
  ).toHaveLength(1);
  await unmount(tree);
});

test('the stored dark mode paints the shell dark', async () => {
  const tree = await renderWithHistory();
  const backgrounds = new Set<string>();
  for (const node of tree.root.findAll(() => true, { deep: true })) {
    for (const entry of [node.props.style].flat(3)) {
      const color = entry && typeof entry === 'object' ? (entry as { backgroundColor?: unknown }).backgroundColor : null;
      if (typeof color === 'string') backgrounds.add(color);
    }
  }
  expect(backgrounds).toContain(darkPalette.bg);
  expect(backgrounds).not.toContain(lightPalette.bg);
  await unmount(tree);
});

test('bubbles stay compact: agent text sits in a tight bubble', async () => {
  const tree = await renderWithHistory();
  // Bubbles are the nodes carrying a maxWidth constraint; the composer field is not a bubble.
  const bubbles = tree.root.findAll(
    node =>
      Array.isArray(node.props.style) &&
      node.props.style.some(
        (entry: unknown) => entry && typeof entry === 'object' && 'maxWidth' in (entry as object),
      ),
    { deep: true },
  );
  const paddings = bubbles.flatMap(node =>
    (node.props.style as Array<Record<string, unknown> | null>)
      .filter(Boolean)
      .map(entry => entry!.paddingVertical)
      .filter((value): value is number => typeof value === 'number'),
  );
  expect(paddings.length).toBeGreaterThan(0);
  expect(Math.max(...paddings)).toBeLessThanOrEqual(8);
  await unmount(tree);
});
