/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, FlatList, PermissionsAndroid } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { commandStore } from '../src/core/commands';
import { sessionStore } from '../src/core/sessions';
import { darkPalette, lightPalette } from '../src/theme/palettes';
import type { HistoryEntry } from '../src/core/protocol';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

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

function pressText(tree: Tree, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const labels = tree.root.findAll(
      node => node.props.children === text && String(node.type) === 'Text',
      { deep: true },
    );
    const label = labels[0];
    if (!label) throw new Error(`no text node for ${text}`);
    let node = label.parent;
    while (node && typeof node.props.onPress !== 'function') {
      node = node.parent;
    }
    if (!node) throw new Error(`no pressable for ${text}`);
    node.props.onPress();
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

  // Tapping a command the app handles natively (the model picker) keeps its text out of the
  // field: it must open the menu, not get sent to the model as a question.
  const item = tree.root.find(node => node.props.accessibilityLabel?.startsWith('Command model'));
  await ReactTestRenderer.act(async () => {
    item.props.onPress();
  });
  expect(inputOf(tree).props.value).toBe('');
  expect(textsOf(tree)).not.toContain('Show or change current model');

  // A command without native handling still inserts its text for typed arguments.
  await typeInto(tree, '/he');
  await waitFor(() => textsOf(tree).includes('List available commands'));
  const helpItem = tree.root.find(node => node.props.accessibilityLabel?.startsWith('Command help'));
  await ReactTestRenderer.act(async () => {
    helpItem.props.onPress();
  });
  expect(inputOf(tree).props.value).toBe('/help ');

  // /status is handled natively too: the tap opens the fullscreen page instead of typing.
  await typeInto(tree, '/st');
  await waitFor(() => textsOf(tree).includes('Session diagnostics: context, tokens, cost'));
  const statusItem = tree.root.find(node => node.props.accessibilityLabel?.startsWith('Command status'));
  await ReactTestRenderer.act(async () => {
    statusItem.props.onPress();
  });
  expect(inputOf(tree).props.value).toBe('');
  await waitFor(() => labelsOf(tree).includes('Close status'));

  await unmount(tree);
});

test('a gallery photo (content:// uri) is copied to the cache before staging', async () => {
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();

  await pressLabel(tree, 'Add attachment');
  await pressText(tree, 'Photo from gallery');

  const callback = launchImageLibrary.mock.calls.at(-1)[1];
  await ReactTestRenderer.act(async () => {
    callback({
      didCancel: false,
      assets: [{ uri: 'content://media/external/images/42', fileName: 'photo.jpg', type: 'image/jpeg', fileSize: 1234 }],
    });
  });

  await waitFor(() => stringsOf(tree).includes('photo.jpg'));
  expect(deviceBridge.prepareFile).toHaveBeenCalledWith('content://media/external/images/42');

  // The upload must go through the native bridge: fetch() cannot read a local uri on Android.
  await typeInto(tree, 'look at this');
  await pressLabel(tree, 'Send message');
  await waitFor(() => bridge.uploadFile.mock.calls.length > 0);
  expect(bridge.uploadFile).toHaveBeenCalledWith(
    'file:///cache/prepared',
    'http://10.10.20.10:8080/media?device=dev-test&token=token-test',
    'photo.jpg',
    'image',
    THREAD,
    expect.any(String),
  );
  await waitFor(() =>
    bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('media-1')),
  );

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

test('the location action is hidden until the server enables it and sends a structured fix', async () => {
  const tree = await renderWithHistory();
  expect(textsOf(tree)).not.toContain('Share current location');

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'location.capabilities', enabled: true, address: true, provider: 'geoapify' }),
    });
  });
  await pressLabel(tree, 'Add attachment');
  expect(textsOf(tree)).toContain('Share current location');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  await pressText(tree, 'Share current location');
  await waitFor(() => textsOf(tree).includes('Current location'));
  expect(bridge.getCurrentLocation).toHaveBeenCalled();

  await pressLabel(tree, 'Send message');
  await waitFor(() => bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('"location"')));
  const sent = JSON.parse(String(bridge.sendMessage.mock.calls.at(-1)?.[0])) as { id?: string; location?: { latitude?: number; address?: unknown } };
  expect(sent.location?.latitude).toBe(48.8566);
  expect(sent.location?.address).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'chat.location',
        threadId: THREAD,
        replyToId: sent.id ?? '',
        location: {
          latitude: 48.8566,
          longitude: 2.3522,
          accuracyMeters: 24,
          capturedAt: '2026-01-01T10:00:00.000Z',
          address: { formatted: 'Rue de Rivoli, Paris', level: 'street', provider: 'geoapify' },
        },
      }),
    });
  });
  await waitFor(() => textsOf(tree).includes('Rue de Rivoli, Paris'));
  await unmount(tree);
});

test('the staged location shows the preview address and sends the owner edit', async () => {
  const tree = await renderWithHistory();

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'location.capabilities', enabled: true, address: true, provider: 'geoapify' }),
    });
  });
  bridge.sendMessage.mockClear();
  await pressLabel(tree, 'Add attachment');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  await pressText(tree, 'Share current location');
  await waitFor(() => textsOf(tree).includes('Current location'));
  expect(textsOf(tree)).toContain('Resolving address…');

  // The server answers the preview request with the geocoded value.
  const previewRequest = bridge.sendMessage.mock.calls
    .map(([frame]) => JSON.parse(String(frame)) as { type?: string; id?: string })
    .find(frame => frame.type === 'location.preview');
  expect(previewRequest?.id).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'location.preview.result',
        id: previewRequest?.id,
        location: {
          latitude: 48.8566,
          longitude: 2.3522,
          accuracyMeters: 24,
          capturedAt: '2026-01-01T10:00:00.000Z',
          address: { formatted: 'Rue de Rivoli, Paris', level: 'building', provider: 'geoapify' },
        },
      }),
    });
  });
  await waitFor(() => textsOf(tree).includes('Rue de Rivoli, Paris'));
  expect(textsOf(tree)).not.toContain('Resolving address…');

  // Tapping the chip opens the editor; the edit rides the send as an addressOverride.
  await pressLabel(tree, 'Edit current location');
  await waitFor(() => labelsOf(tree).includes('Location address'));
  const field = tree.root.find(node => node.props.accessibilityLabel === 'Location address' && typeof node.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => {
    field.props.onChangeText('Chez moi, 3eme etage');
  });
  await pressLabel(tree, 'Close menu');
  expect(textsOf(tree)).toContain('Chez moi, 3eme etage');

  await pressLabel(tree, 'Send message');
  await waitFor(() => bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('addressOverride')));
  const sent = JSON.parse(String(bridge.sendMessage.mock.calls.at(-1)?.[0])) as {
    location?: { latitude?: number; addressOverride?: { formatted?: string } };
  };
  expect(sent.location?.latitude).toBe(48.8566);
  expect(sent.location?.addressOverride?.formatted).toBe('Chez moi, 3eme etage');

  await unmount(tree);
});

test('the session file explorer lists files with sizes and deletes them', async () => {
  const tree = await renderWithHistory();

  await pressLabel(tree, 'Commands');
  await pressLabel(tree, 'Session files');
  await waitFor(() => labelsOf(tree).includes('Back to chat'));

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
  await pressText(tree, 'Delete');
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

describe('attachments in a replayed turn', () => {
  const withFiles: HistoryEntry[] = [
    {
      id: 'h-a',
      role: 'user',
      text: 'regarde ca',
      ts: '2026-01-01T10:00:00.000Z',
      attachments: [
        { id: 'img1', type: 'image', filename: 'photo de vacances.png', sizeBytes: 3 },
        { id: 'doc1', type: 'file', filename: 'notes.md', mimeType: 'text/markdown' },
        { id: 'gone', type: 'file', filename: 'ancien.txt', deleted: true },
      ],
    },
  ];

  async function renderWithAttachments(): Promise<Tree> {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => {
      chatStore.seedHistory(THREAD, withFiles);
    });
    // The bubble text is an array child (text + caret), so stringsOf, not textsOf.
    await waitFor(() => stringsOf(tree).includes('regarde ca'));
    return tree;
  }

  test('names each file instead of its type, and flags the deleted one', async () => {
    const tree = await renderWithAttachments();
    const texts = stringsOf(tree);

    expect(texts).toContain('photo de vacances.png');
    expect(texts).toContain('notes.md');
    expect(texts).toContain('ancien.txt (deleted)');
    // The server path used to leak into the bubble; the turn is now clean text.
    expect(texts.join(' ')).not.toContain('files/my-claw-app');

    await unmount(tree);
  });

  test('tapping an attached image opens the same viewer as the explorer', async () => {
    const tree = await renderWithAttachments();

    await waitFor(() =>
      labelsOf(tree).includes('Open attachment photo de vacances.png'),
    );
    await pressLabel(tree, 'Open attachment photo de vacances.png');
    await waitFor(() => labelsOf(tree).includes('Close image'));

    await unmount(tree);
  });

  test('tapping an attached markdown file opens it full screen', async () => {
    const tree = await renderWithAttachments();

    await waitFor(() => labelsOf(tree).includes('Open attachment notes.md'));
    await pressLabel(tree, 'Open attachment notes.md');
    await waitFor(() => labelsOf(tree).includes('Close file view'));
    expect(stringsOf(tree)).toContain('notes.md');

    await unmount(tree);
  });

  test('a deleted attachment is inert', async () => {
    const tree = await renderWithAttachments();

    const openable = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Open attachment ancien.txt',
      { deep: true },
    );
    expect(openable).toHaveLength(0);

    await unmount(tree);
  });
});

describe('landing at the bottom of a conversation', () => {
  test('opening jumps to the latest, what arrives afterwards glides', async () => {
    const spy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
    const tree = await renderWithHistory();

    // The history arrives in one frame. Animating through it would scroll past every message the
    // user did not ask to re-read, and on a long thread that animation is the jank people report.
    // The autoscroll is debounced by 40ms, which is more than the default drain affords.
    await waitFor(() => spy.mock.calls.length > 0, 200);
    expect(spy.mock.calls.map(([options]) => options?.animated)).not.toContain(true);
    spy.mockClear();

    await ReactTestRenderer.act(async () => {
      chatStore.addAgentMessage(THREAD, 'h-3', 'and one more thing', []);
    });

    // Once the thread is settled, following the answer as it grows is a scroll, not a jump.
    await waitFor(() => spy.mock.calls.length > 0, 200);
    expect(spy).toHaveBeenCalledWith({ animated: true });
    spy.mockRestore();
    await unmount(tree);
  });
});

describe('keeping the same place when the keyboard opens', () => {
  /** The message list of the chat screen, identified by the seeded history it renders. */
  function chatList(tree: Tree): ReactTestRenderer.ReactTestInstance {
    return tree.root.find(
      node =>
        node.props.data &&
        Array.isArray(node.props.data) &&
        node.props.data.some((item: { id: string }) => item.id === 'h-0'),
    );
  }

  function scrollEvent(y: number, height: number) {
    return {
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 2000 },
        layoutMeasurement: { height },
      },
    };
  }

  test('the list scrolls down by exactly what the keyboard cut off', async () => {
    const tree = await renderWithHistory();
    const spy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const list = chatList(tree);
    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 700 } } });
      list.props.onContentSizeChange(100, 2000);
      // Reading a message halfway down the conversation.
      list.props.onScroll(scrollEvent(600, 700));
    });
    spy.mockClear();

    ReactTestRenderer.act(() => {
      // The keyboard opens: the viewport is cut down to 500.
      list.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    });

    // 600 + 200 cut off: the message that was just above the keyboard is still there.
    expect(spy).toHaveBeenCalledWith({ offset: 800, animated: false });
    spy.mockRestore();
    await unmount(tree);
  });

  test('the bottom stays the bottom when the keyboard opens', async () => {
    const tree = await renderWithHistory();
    const spy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const list = chatList(tree);
    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 700 } } });
      list.props.onContentSizeChange(100, 2000);
      // At the very bottom of a 700-high viewport: offset 1300.
      list.props.onScroll(scrollEvent(1300, 700));
    });
    spy.mockClear();

    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    });

    // 1300 + 200 = 1500, which is the new maximum (2000 - 500): still at the bottom.
    expect(spy).toHaveBeenCalledWith({ offset: 1500, animated: false });
    spy.mockRestore();
    await unmount(tree);
  });

  test('closing the keyboard leaves the offset alone', async () => {
    const tree = await renderWithHistory();
    const spy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const list = chatList(tree);
    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
      list.props.onContentSizeChange(100, 2000);
      list.props.onScroll(scrollEvent(800, 500));
    });
    spy.mockClear();

    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 700 } } });
    });

    // The viewport grows: nothing needs to move to keep the same place.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    await unmount(tree);
  });
});

test('a notice is drawn apart from the agent replies it arrives between', async () => {
  const tree = await renderWithHistory();
  // The server states a model fallback out of band: it is not an answer, and a bubble that looked
  // like one would be read as the agent's own words.
  await ReactTestRenderer.act(async () => {
    chatStore.addAgentMessage(
      THREAD,
      'n1',
      '`mimo-v2.5-pro` is not available (litellm no longer lists it) · running `claude-sonnet-5` instead',
      [],
      undefined,
      true,
    );
  });
  await waitFor(() => stringsOf(tree).some(t => t.includes('is not available')));

  // Rendered as plain text, never through the markdown renderer the agent's answers use: the
  // backticks are the server's wording, not a formatting instruction to obey.
  const notice = tree.root
    .findAll(node => {
      const children = node.props.children;
      const list = Array.isArray(children) ? children : [children];
      return list.some(c => typeof c === 'string' && c.includes('is not available'));
    })
    .at(-1)!;
  // The bubble around it is outlined, which an agent bubble never is: that outline is the whole
  // "drawn apart". Climbing to it also proves the text is not inside an agent bubble.
  const flatten = (style: unknown): { borderWidth?: number; fontFamily?: string } =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as {
      borderWidth?: number;
      fontFamily?: string;
    };
  let node: ReactTestRenderer.ReactTestInstance | null = notice;
  let outlined = false;
  while (node) {
    if (flatten(node.props.style).borderWidth === 1) {
      outlined = true;
      break;
    }
    node = node.parent;
  }
  expect(outlined).toBe(true);
  // Not the command style either: /status is a table and wears monospace, a notice is a sentence.
  expect(flatten(notice.props.style).fontFamily).toBeUndefined();
  await unmount(tree);
});


test('the Commands menu leads with Session files, and it is the only row before the separator', async () => {
  const tree = await renderWithHistory();
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Session files'));

  // First in the menu, and its position is marked: the separator follows it and is not a row.
  const commands = tree.root.findAll(node => node.props.accessibilityLabel === 'Commands' && typeof node.props.onPress === 'function', { deep: true });
  expect(commands.length).toBeGreaterThan(0);

  await pressLabel(tree, 'Session files');
  await waitFor(() => labelsOf(tree).includes('Back to chat'));
  await unmount(tree);
});

test('Session files from a drawer conversation opens that conversation and its files', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId: THREAD, title: 'the active one', messageCount: 4, createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T10:00:00.000Z' },
      { threadId: 'other-thread', title: 'the other one', messageCount: 1, createdAt: '2026-01-02T00:00:00.000Z', lastActiveAt: '2026-01-02T10:00:00.000Z' },
    ]);
  });
  bridge.sendMessage.mockClear();

  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation the other one');
  await pressLabel(tree, 'Session files');

  await waitFor(() => labelsOf(tree).includes('Back to chat'));
  // The files screen opened over the conversation it belongs to: history and files were asked
  // for the drawer's thread, not for the one that happened to be on screen.
  const sent = bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
  expect(sent).toContain(JSON.stringify({ type: 'session.history', threadId: 'other-thread', limit: 50 }));
  expect(sent).toContain(JSON.stringify({ type: 'files.list', threadId: 'other-thread' }));
  await unmount(tree);
});
