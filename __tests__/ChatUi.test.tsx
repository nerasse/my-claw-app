/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, FlatList, PermissionsAndroid, StyleSheet } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { commandStore } from '../src/core/commands';
import { sessionStore } from '../src/core/sessions';
import { darkPalette, lightPalette } from '../src/theme/palettes';
import type { HistoryEntry } from '../src/core/protocol';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';
import { clearAllDrafts } from '../src/core/drafts';

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
  // Staged attachments live in a module-level map, like the text: without this, a file one test
  // picked is still in the composer of the next one.
  clearAllDrafts();
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

  // /status is handled natively too: the tap opens the status page instead of typing. On a
  // phone the page takes the conversation's place, so the composer comes back empty on close.
  await typeInto(tree, '/st');
  await waitFor(() => textsOf(tree).includes('Session diagnostics: context, tokens, cost'));
  const statusItem = tree.root.find(node => node.props.accessibilityLabel?.startsWith('Command status'));
  await ReactTestRenderer.act(async () => {
    statusItem.props.onPress();
  });
  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(bridge.sendMessage).not.toHaveBeenCalledWith(expect.stringContaining('"/st'));
  await pressLabel(tree, 'Close status');
  await waitFor(() => !labelsOf(tree).includes('Close status'));
  expect(inputOf(tree).props.value).toBe('');

  await unmount(tree);
});

test('a gallery photo (content:// uri) is copied to the cache before staging', async () => {
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();

  await pressLabel(tree, 'Add attachment');
  await waitFor(
    () => tree.root.findAll(node => node.props.children === 'Photo from gallery', { deep: true }).length > 0,
  );
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
    // The native upload carries the device credential in its headers, never in the URL.
    'http://server:8080/media',
    'photo.jpg',
    'image/jpeg',
    THREAD,
    expect.any(String),
  );
  await waitFor(() =>
    bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('media-1')),
  );

  await unmount(tree);
});

test('a photo the web picker hands over untyped and unnamed is still sent as an image', async () => {
  // The web build's picker returns a bare data: URI: no fileName, no type. It used to go out as a
  // file named .jpg whatever it held, drawn as a chip instead of a picture.
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();

  await pressLabel(tree, 'Add attachment');
  await waitFor(
    () => tree.root.findAll(node => node.props.children === 'Photo from gallery', { deep: true }).length > 0,
  );
  await pressText(tree, 'Photo from gallery');
  const callback = launchImageLibrary.mock.calls.at(-1)[1];
  await ReactTestRenderer.act(async () => {
    callback({ didCancel: false, assets: [{ uri: 'data:image/png;base64,iVBORw0KGgo=', width: 1, height: 1 }] });
  });

  await waitFor(() => bridge.uploadFile.mock.calls.length > 0);
  const [, , filename, type] = bridge.uploadFile.mock.calls.at(-1)!;
  expect(type).toBe('image/png');
  expect(filename).toMatch(/^photo-\d+\.png$/);

  await unmount(tree);
});

test('an upload that fails gives the typed message back instead of eating it', async () => {
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();

  // Refused with a status, so it is not retried and the failure is final. Armed before the pick,
  // because the upload starts there now; the send is the retry.
  bridge.uploadFile.mockResolvedValue({ status: 507, body: 'Insufficient Storage' });

  await pressLabel(tree, 'Add attachment');
  await waitFor(
    () => tree.root.findAll(node => node.props.children === 'Photo from gallery', { deep: true }).length > 0,
  );
  await pressText(tree, 'Photo from gallery');
  const callback = launchImageLibrary.mock.calls.at(-1)[1];
  await ReactTestRenderer.act(async () => {
    callback({
      didCancel: false,
      assets: [{ uri: 'content://media/external/images/42', fileName: 'photo.jpg', type: 'image/jpeg', fileSize: 1234 }],
    });
  });
  await waitFor(() => stringsOf(tree).includes('photo.jpg'));
  await typeInto(tree, 'regarde ca');
  await pressLabel(tree, 'Send message');

  // The field is cleared the instant the send fires and the upload runs after it: without the
  // restore, the words were gone and the file was still staged, so there was nothing to send.
  await waitFor(() => textsOf(tree).includes('upload failed: Insufficient Storage'));
  expect(inputOf(tree).props.value).toBe('regarde ca');
  expect(stringsOf(tree)).toContain('photo.jpg');
  expect(bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('regarde ca'))).toBe(false);

  bridge.uploadFile.mockResolvedValue({ status: 200, body: JSON.stringify({ id: 'media-1' }) });
  await unmount(tree);
});

/** How many times this test's photo reached the bridge, whatever another test left in flight. */
function photoUploads(): number {
  return bridge.uploadFile.mock.calls.filter(call => call[2] === 'photo.jpg').length;
}

test('a picked file is on the server before the send, which does not push it again', async () => {
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();

  const uploads = photoUploads();
  // An id of its own: the bridge mock's call history is shared with every test before this one.
  const framesBefore = bridge.sendMessage.mock.calls.length;
  const sentSince = (): string[] =>
    bridge.sendMessage.mock.calls.slice(framesBefore).map(([frame]) => String(frame));
  bridge.uploadFile.mockResolvedValue({ status: 200, body: JSON.stringify({ id: 'media-staged' }) });
  await pressLabel(tree, 'Add attachment');
  await waitFor(
    () => tree.root.findAll(node => node.props.children === 'Photo from gallery', { deep: true }).length > 0,
  );
  await pressText(tree, 'Photo from gallery');
  const callback = launchImageLibrary.mock.calls.at(-1)[1];
  await ReactTestRenderer.act(async () => {
    callback({
      didCancel: false,
      assets: [{ uri: 'content://media/external/images/42', fileName: 'photo.jpg', type: 'image/jpeg', fileSize: 1234 }],
    });
  });

  // Nothing has been sent, and the bytes are already on the machine: that is what puts the file
  // in the conversation's files and lets another device open it before anything is written.
  await waitFor(() => photoUploads() === uploads + 1);
  expect(sentSince().some(frame => frame.includes('"chat.send"'))).toBe(false);
  // The id does cross the wire, as a staged file: that is what makes the chip follow the owner to
  // another device. What must not happen is a message carrying it before the send.
  expect(sentSince().some(frame => frame.includes('"draft.file.add"') && frame.includes('media-staged'))).toBe(true);

  await typeInto(tree, 'look at this');
  await pressLabel(tree, 'Send message');
  await waitFor(
    () => sentSince().some(frame => frame.includes('"chat.send"') && frame.includes('media-staged')),
  );

  // One upload, not two: the message carries the id the staging already paid for.
  expect(photoUploads()).toBe(uploads + 1);

  bridge.uploadFile.mockResolvedValue({ status: 200, body: JSON.stringify({ id: 'media-1' }) });
  await unmount(tree);
});

test('an upload that fails keeps its chip, and the retry sends it again', async () => {
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();
  const uploads = photoUploads();

  // A refusal, not a transport fault: the latter is retried once by `uploadMedia` itself.
  bridge.uploadFile.mockResolvedValueOnce({ status: 500, body: 'storage full' });
  await pressLabel(tree, 'Add attachment');
  await waitFor(() => textsOf(tree).includes('Photo from gallery'));
  await pressText(tree, 'Photo from gallery');
  const callback = launchImageLibrary.mock.calls.at(-1)[1];
  await ReactTestRenderer.act(async () => {
    callback({
      didCancel: false,
      assets: [{ uri: 'content://media/external/images/42', fileName: 'photo.jpg', type: 'image/jpeg', fileSize: 1234 }],
    });
  });

  // The take is not thrown away because one request failed: the chip stays, says so, and the
  // retry is on the chip itself -- re-recording a voice note would be the wrong price.
  // The chip says so on itself -- the retry control only exists on a failed chip -- and it
  // stays there: one refused request is not a reason to lose the take.
  await waitFor(() => labelsOf(tree).includes('Retry upload of photo.jpg'));
  expect(photoUploads()).toBe(uploads + 1);

  await pressLabel(tree, 'Retry upload of photo.jpg');
  await waitFor(() => photoUploads() === uploads + 2);
  await waitFor(() => !labelsOf(tree).includes('Retry upload of photo.jpg'));

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

test('the paste action appears only when the clipboard holds an image, and stages it', async () => {
  const tree = await renderWithHistory();

  // Nothing to paste: the entry stays out of the sheet rather than failing once tapped.
  await pressLabel(tree, 'Add attachment');
  expect(textsOf(tree)).not.toContain('Paste image');
  await pressLabel(tree, 'Close menu');

  bridge.clipboardHasImage.mockResolvedValueOnce(true);
  bridge.clipboardImage.mockResolvedValueOnce({
    uri: 'file:///cache/clip_1',
    name: 'pasted-1.png',
    type: 'image/png',
    size: 4096,
  });
  await pressLabel(tree, 'Add attachment');
  await waitFor(() => textsOf(tree).includes('Paste image'));
  await pressText(tree, 'Paste image');

  await waitFor(() => stringsOf(tree).includes('pasted-1.png'));
  expect(bridge.clipboardImage).toHaveBeenCalled();
  // Already a file:// uri: the native side copied it while it still held the clipboard grant.
  expect(bridge.prepareFile).not.toHaveBeenCalledWith('file:///cache/clip_1');

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

test('a tool card starts collapsed and reveals the command it ran on tap', async () => {
  const tree = await renderWithHistory();

  // Collapsed: name plus a one-line argument preview, no body.
  expect(textsOf(tree)).toContain('echo hello');
  expect(textsOf(tree)).not.toContain('command');

  const card = tree.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Tool bash'),
  );
  expect(card.props.accessibilityLabel).toContain('4 ms');

  await ReactTestRenderer.act(async () => {
    card.props.onPress();
  });
  await waitFor(() => textsOf(tree).includes('command'));

  // The command IS the call: it gets a block of its own, unfolded, and there is no ARGUMENTS fold
  // left to open -- it would hold `{}`. The output is there straight away too.
  expect(textsOf(tree).join('|')).toContain('hello');
  expect(textsOf(tree).join('|')).not.toContain('"command"');
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Arguments of bash')).toHaveLength(0);
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

test('the frame around the composer belongs to the wrapper, never to the field', async () => {
  const tree = await renderWithHistory();

  const input = tree.root.find(
    node => String(node.type) === 'TextInput' && node.props.placeholder === 'message',
  );
  const inputStyle = StyleSheet.flatten(input.props.style) as Record<string, number>;
  // Border, background and padding on the field itself scroll away with the text on Android, so
  // a long message ends up written across the rounded edge and cut mid-line.
  expect(inputStyle.borderWidth).toBeUndefined();
  expect(inputStyle.backgroundColor).toBeUndefined();
  expect(inputStyle.padding).toBe(0);
  expect(inputStyle.maxHeight).toBeGreaterThan(0);

  // Up through the composite TextInput to the View that draws the frame.
  let ancestor = input.parent;
  while (ancestor && String(ancestor.type) !== 'View') ancestor = ancestor.parent;
  const frame = StyleSheet.flatten(ancestor!.props.style) as Record<string, number>;
  expect(frame.borderWidth).toBe(1);
  expect(frame.paddingVertical).toBeGreaterThan(0);
  // The text ceiling and the frame's padding are what add up to the height a thumb sees; the
  // frame is never allowed to be shorter than the send button beside it.
  expect(frame.minHeight).toBe(44);
  // Half the collapsed height, never a pill radius: 999 turns a grown field into a stadium whose
  // ends are half-circles as tall as the field, and the first line of text lands outside them.
  expect(frame.borderRadius).toBe(frame.minHeight / 2);
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
  // A bubble fills its column now (like a tool card), so the width constraint that used to mark
  // one is gone; the compactness contract is still the vertical padding of the bubble plate.
  // The bubble is the node whose style carries a width of 100% inside the thread plus the
  // surfaceAlt (agent) plate; match on the agent bubble colour to stay out of the drawer.
  const bubbles = tree.root.findAll(
    node =>
      Array.isArray(node.props.style) &&
      node.props.style.some(
        (entry: unknown) => entry && typeof entry === 'object' && 'width' in (entry as object) && (entry as { width?: unknown }).width === '100%',
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

describe('reading a conversation from its newest message', () => {
  /** The message list of the chat screen, identified by the seeded history it renders. */
  function chatList(tree: Tree): ReactTestRenderer.ReactTestInstance {
    return tree.root.find(
      node =>
        node.props.data &&
        Array.isArray(node.props.data) &&
        node.props.data.some((row: { kind: string; item?: { id: string }; run?: { id: string } }) =>
          row.kind === 'item' ? row.item?.id === 'h-0' : row.run?.id === 'h-0',
      ),
    );
  }

  test('the newest message is the first row, so opening lands on it without scrolling', async () => {
    const toEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
    const toOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const tree = await renderWithHistory();

    const list = chatList(tree);
    // Inverted: row 0 is the newest and sits at offset 0. scrollToEnd on rows of unknown height
    // aims at an estimated content height and stops short of the last message, so the fix is to
    // not need it at all rather than to time it better.
    expect(list.props.inverted).toBe(true);
    const rowId = (row: { kind: string; item?: { id: string }; run?: { id: string } }): string | undefined =>
      row.kind === 'item' ? row.item?.id : row.run?.id;
    expect(list.props.data.map(rowId)).toEqual(['h-2', 'h-1', 'h-0']);
    expect(toEnd).not.toHaveBeenCalled();
    expect(toOffset).not.toHaveBeenCalled();

    // The scrollbar is a sibling of the list, so it does not inherit the flip: sitting on the
    // newest message must put the thumb at the bottom of its track, not the top.
    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      list.props.onContentSizeChange(100, 2000);
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    const thumb = tree.root.find(node => node.props.testID === 'scroll-indicator-thumb');
    const translateY = (thumb.props.style as unknown[]).reduce((acc: number, entry: unknown) => {
      const transform = (entry as { transform?: unknown[] } | null)?.transform;
      for (const op of transform ?? []) {
        const translation = (op as { translateY?: { __getValue: () => number } }).translateY;
        if (translation) return translation.__getValue();
      }
      return acc;
    }, 0);
    expect(translateY).toBeCloseTo(320, 0);

    toEnd.mockRestore();
    toOffset.mockRestore();
    await unmount(tree);
  });

  test('the keyboard opening moves nothing: the content is anchored to the bottom edge', async () => {
    const tree = await renderWithHistory();
    const spy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const list = chatList(tree);
    ReactTestRenderer.act(() => {
      list.props.onLayout({ nativeEvent: { layout: { height: 700 } } });
      // Reading somewhere above the newest message.
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 600 } } });
    });
    spy.mockClear();

    ReactTestRenderer.act(() => {
      // The keyboard opens: the viewport is cut down to 500.
      list.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    });

    // An inverted list measures from the bottom, so the message above the keyboard stays put on
    // its own. The compensation pass this replaces had to compute the cut and scroll by it.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    await unmount(tree);
  });
});

describe('paging back through a long conversation', () => {
  // The list now carries rows, not raw bubbles: a row is either a bubble or a run group holding
  // several. Matching on the FlatList itself, whatever the shape of its data is.
  function chatList(tree: Tree): ReactTestRenderer.ReactTestInstance {
    return tree.root.find(
      node =>
        node.props.data &&
        Array.isArray(node.props.data) &&
        node.props.data.some((row: { kind: string; item?: { id: string }; run?: { id: string } }) =>
          row.kind === 'item' ? row.item?.id === 'h-0' : row.run?.id === 'h-0',
      ),
    );
  }

  function sentHistoryRequests(): Array<{ before?: number; limit?: number }> {
    return bridge.sendMessage.mock.calls
      .map(([raw]) => JSON.parse(raw as string))
      .filter((frame: { type: string }) => frame.type === 'session.sync' || frame.type === 'session.history' || frame.type === 'session.history');
  }

  test('reaching the far end asks for the page before it, once, and prepends it', async () => {
    const tree = await renderWithHistory();
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('claw:ws:message', {
        text: JSON.stringify({ type: 'chat.history', threadId: THREAD, messages: history, hasMore: true, nextBefore: 3 }),
      });
    });
    bridge.sendMessage.mockClear();

    const list = chatList(tree);
    // The list fires this repeatedly while a request is still out; only one may leave.
    await ReactTestRenderer.act(async () => {
      list.props.onEndReached({ distanceFromEnd: 0 });
      list.props.onEndReached({ distanceFromEnd: 0 });
    });
    expect(sentHistoryRequests()).toEqual([{ type: 'session.history', threadId: THREAD, limit: 50, before: 3, beforeId: 'h-0', fold: true, lazyReasoning: true }]);

    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('claw:ws:message', {
        text: JSON.stringify({
          type: 'chat.history',
          threadId: THREAD,
          before: 3,
          hasMore: false,
          nextBefore: 4,
          messages: [{ id: 'older-1', role: 'user', text: 'la toute premiere question', ts: '2025-12-31T23:00:00.000Z' }],
        }),
      });
    });

    // Older messages go in front, and the inverted list therefore appends them at its own end:
    // nothing the reader was looking at moves.
    const rowId = (row: { kind: string; item?: { id: string }; run?: { id: string } }): string =>
      row.kind === 'item' ? row.item!.id : row.run!.id;
    await waitFor(() => chatList(tree).props.data.some((row: { kind: string; item?: { id: string }; run?: { id: string } }) => rowId(row) === 'older-1'));
    expect(chatList(tree).props.data.map(rowId)).toEqual([
      'h-2',
      'h-1',
      'h-0',
      'older-1',
    ]);

    // hasMore is now false: the end of the list must stop asking.
    bridge.sendMessage.mockClear();
    await ReactTestRenderer.act(async () => {
      chatList(tree).props.onEndReached({ distanceFromEnd: 0 });
    });
    expect(sentHistoryRequests()).toEqual([]);

    await unmount(tree);
  });

  test('a server that reports no cursor is never asked for an older page', async () => {
    const tree = await renderWithHistory();
    await ReactTestRenderer.act(async () => {
      // An older build answers session.history without hasMore or nextBefore.
      DeviceEventEmitter.emit('claw:ws:message', {
        text: JSON.stringify({ type: 'chat.history', threadId: THREAD, messages: history }),
      });
    });
    bridge.sendMessage.mockClear();

    await ReactTestRenderer.act(async () => {
      chatList(tree).props.onEndReached({ distanceFromEnd: 0 });
    });
    expect(sentHistoryRequests()).toEqual([]);

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


test('the Commands menu reads the instructions before the files they produced', async () => {
  const tree = await renderWithHistory();
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Session files'));

  // A row is both a composite and a host node with the same label: keep one of each pair.
  const rows = labelsOf(tree)
    .filter(label =>
      ['Refresh', 'Model…', 'Instructions', 'Session files', 'Status'].includes(label),
    )
    .filter((label, index, all) => label !== all[index - 1]);
  // Refresh leads: same first row as the drawer's own sheet, whichever menu was opened. Model
  // follows because only the conversation on screen can answer for it.
  expect(rows[0]).toBe('Refresh');
  expect(rows[1]).toBe('Model…');
  expect(rows.indexOf('Instructions')).toBeLessThan(rows.indexOf('Session files'));

  await pressLabel(tree, 'Session files');
  await waitFor(() => labelsOf(tree).includes('Back to chat'));
  await unmount(tree);
});

test('a conversation picked in the drawer opens the same list', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId: 'other-thread', title: 'the other one', messageCount: 1, createdAt: '2026-01-02T00:00:00.000Z', lastActiveAt: '2026-01-02T10:00:00.000Z' },
    ]);
  });

  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation the other one');
  await waitFor(() => labelsOf(tree).includes('Session files'));

  const rows = labelsOf(tree)
    .filter(label => ['Instructions', 'Session files', 'Status'].includes(label))
    .filter((label, index, all) => label !== all[index - 1]);
  expect(rows.indexOf('Instructions')).toBeLessThan(rows.indexOf('Session files'));
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
  expect(sent).toContain(JSON.stringify({ type: 'session.sync', threadId: 'other-thread', since: null, fold: true, lazyReasoning: true }));
  expect(sent).toContain(JSON.stringify({ type: 'files.list', threadId: 'other-thread' }));
  await unmount(tree);
});

test('the header reads the share of the context window instead of announcing a healthy link', async () => {
  const tree = await renderWithHistory();
  // No model state yet: the line carries what it knows and claims nothing about the context.
  // The drawer keeps its own connection dot; the header line does not repeat it.
  expect(stringsOf(tree).some(text => text.includes('ctx '))).toBe(false);
  expect(stringsOf(tree).some(text => text.startsWith('connected · '))).toBe(false);

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'model.result',
        threadId: THREAD,
        model: 'fast-1',
        defaultModel: 'fast-1',
        effort: { level: '', levels: [], supported: false },
        context: { raw: 400000, effective: 200000, used: 50000 },
      }),
    });
  });

  await waitFor(() => stringsOf(tree).some(text => text.includes('ctx 25.0%')));

  // The next turn's reading moves the line, even by a fraction of a percent: on a wide window a
  // whole percent sat still for dozens of turns and the gauge read as stuck.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'model.result',
        threadId: THREAD,
        model: 'fast-1',
        defaultModel: 'fast-1',
        effort: { level: '', levels: [], supported: false },
        context: { raw: 400000, effective: 200000, used: 50800 },
      }),
    });
  });
  await waitFor(() => stringsOf(tree).some(text => text.includes('ctx 25.4%')));
  await unmount(tree);
});

test('the end of a run reads the context back from the server: the turn that landed is what filled it', async () => {
  const tree = await renderWithHistory();
  bridge.sendMessage.mockClear();

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'chat.run.end', threadId: THREAD, reason: 'done' }),
    });
  });

  const sent = bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
  expect(sent).toContain(JSON.stringify({ type: 'model.get', threadId: THREAD }));

  // A run that ended on another conversation refreshes nothing: the header shows this one.
  bridge.sendMessage.mockClear();
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'chat.run.end', threadId: 'other-thread', reason: 'done' }),
    });
  });
  expect(bridge.sendMessage.mock.calls.map(([frame]) => String(frame))).not.toContain(
    JSON.stringify({ type: 'model.get', threadId: 'other-thread' }),
  );
  await unmount(tree);
});

test('a draft belongs to its conversation, not to the screen that shows it', async () => {
  const tree = await renderWithHistory();
  await typeInto(tree, 'half a thought');
  expect(inputOf(tree).props.value).toBe('half a thought');

  // On a phone the chat screen is unmounted whenever a page covers it, and the draft went with
  // it: opening Files to check one thing emptied the field.
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await waitFor(() => labelsOf(tree).includes('Open appearance'));
  await pressLabel(tree, 'Back to chat');
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  expect(inputOf(tree).props.value).toBe('half a thought');

  await unmount(tree);
});

test('a draft does not follow the reader into another conversation', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId: THREAD, title: 'here', messageCount: 3, createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T10:00:00.000Z' },
      { threadId: 'other', title: 'elsewhere', messageCount: 1, createdAt: '2026-01-02T00:00:00.000Z', lastActiveAt: '2026-01-02T10:00:00.000Z' },
    ]);
  });
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory('other', [
      { id: 'o-0', role: 'user', text: 'another conversation', ts: '2026-01-01T09:00:00.000Z' },
    ]);
  });
  await typeInto(tree, 'meant for this one');

  await pressLabel(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).includes('Conversation elsewhere'));
  await pressLabel(tree, 'Conversation elsewhere');

  // Sending it here would have put a private message in the wrong conversation.
  await waitFor(() => inputOf(tree).props.value === '');

  // And it is not lost either: the drawer points at the conversation holding it, so the reader
  // can find it again, and opening that one gives the text back.
  await waitFor(() => labelsOf(tree).includes('Conversation here, unsent draft'));
  await pressLabel(tree, 'Conversation here, unsent draft');
  await waitFor(() => inputOf(tree).props.value === 'meant for this one');

  await unmount(tree);
});

test('a draft sent on another window empties this composer, focused or not', async () => {
  const tree = await renderWithHistory();
  const framesBefore = bridge.sendMessage.mock.calls.length;
  await typeInto(tree, 'Re: la question');
  // The debounce flushed: this device is not ahead of the server, so the clear is news.
  await waitFor(() =>
    bridge.sendMessage.mock.calls
      .slice(framesBefore)
      .some(([frame]) => String(frame).includes('"draft.set"')),
  );

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'draft.changed', threadId: THREAD, text: '', ts: 1 }),
    });
  });

  await waitFor(() => inputOf(tree).props.value === '');
  await unmount(tree);
});

test('a clear from another window does not take newer typing here', async () => {
  const tree = await renderWithHistory();
  const framesBefore = bridge.sendMessage.mock.calls.length;
  await typeInto(tree, 'la question');
  await waitFor(() =>
    bridge.sendMessage.mock.calls
      .slice(framesBefore)
      .some(([frame]) => String(frame).includes('"draft.set"')),
  );

  // Typed just now, not acknowledged: the clear was decided before it and must lose.
  await typeInto(tree, 'la question, encore');
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'draft.changed', threadId: THREAD, text: '', ts: 2 }),
    });
  });

  expect(inputOf(tree).props.value).toBe('la question, encore');
  await unmount(tree);
});

test('a file whose upload lands during the send never comes back as a chip', async () => {
  const { launchImageLibrary } = require('react-native-image-picker');
  const tree = await renderWithHistory();
  const framesBefore = bridge.sendMessage.mock.calls.length;
  const sent = (): string[] =>
    bridge.sendMessage.mock.calls.slice(framesBefore).map(([frame]) => String(frame));

  // The bytes land after Send was pressed: the send waits for this promise.
  let release!: () => void;
  bridge.uploadFile.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        release = () => resolve({ status: 200, body: JSON.stringify({ id: 'media-late' }) });
      }),
  );
  await pressLabel(tree, 'Add attachment');
  await waitFor(() => textsOf(tree).includes('Photo from gallery'));
  await pressText(tree, 'Photo from gallery');
  const callback = launchImageLibrary.mock.calls.at(-1)[1];
  await ReactTestRenderer.act(async () => {
    callback({
      didCancel: false,
      assets: [{ uri: 'content://media/external/images/42', fileName: 'photo.jpg', type: 'image/jpeg', fileSize: 1234 }],
    });
  });

  await typeInto(tree, 'regarde');
  await pressLabel(tree, 'Send message');
  await ReactTestRenderer.act(async () => release());

  await waitFor(() => sent().some(frame => frame.includes('"chat.send"') && frame.includes('media-late')));
  // The message carries the id; staging it again after the send put the chip back on every
  // device, which is the bug this pins.
  expect(sent().some(frame => frame.includes('"draft.file.add"') && frame.includes('media-late'))).toBe(false);
  await waitFor(() => !labelsOf(tree).some(label => label.startsWith('Preview attachment')));
  await unmount(tree);
});

test('a send waits for the server receipt, and one that never got it can be sent again under the same id', async () => {
  const tree = await renderWithHistory();
  // The server says it receipts sends: from here every send is waited for.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify({ type: 'hello', version: '0.6.3', receipts: true }) });
  });
  bridge.sendMessage.mockClear();
  await typeInto(tree, 'es-tu la ?');
  await pressLabel(tree, 'Send message');
  await waitFor(() => bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('"chat.send"')));
  const sent = JSON.parse(String(bridge.sendMessage.mock.calls.find(([frame]) => String(frame).includes('"chat.send"'))?.[0])) as { id: string };
  await waitFor(() => textsOf(tree).includes('sending…'));

  // The receipt: the wait is over, the bubble reads as any other.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify({ type: 'chat.send.received', threadId: THREAD, id: sent.id }) });
  });
  await waitFor(() => !textsOf(tree).includes('sending…'));

  // It never got out (the outbox refused, or the wait ran out). The bubble waits and says the app
  // is trying, and the press is a way to go now rather than the only way out: same id either way,
  // so the server takes a message that did arrive once and a lost one for the first time.
  await ReactTestRenderer.act(async () => {
    chatStore.markUndelivered(THREAD, sent.id);
  });
  // The wording is composed with the elapsed time, so it is found in the tree rather than among
  // the plain text nodes.
  const waitingWords = () => JSON.stringify(tree.toJSON());
  await waitFor(() => waitingWords().includes('not sent, trying again'));
  await waitFor(() => waitingWords().includes('tap to send'));
  bridge.sendMessage.mockClear();
  await pressLabel(tree, `Send ${sent.id} now`);
  await waitFor(() => bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('"chat.send"')));
  const again = JSON.parse(String(bridge.sendMessage.mock.calls.find(([frame]) => String(frame).includes('"chat.send"'))?.[0])) as { id: string; text: string };
  expect(again.id).toBe(sent.id);
  expect(again.text).toBe('es-tu la ?');
  await waitFor(() => textsOf(tree).includes('sending…'));
  expect(waitingWords()).not.toContain('not sent, trying again');
  // Exactly one bubble for the message, whatever the number of tries.
  expect(chatStore.getItems(THREAD).filter(item => item.id === sent.id)).toHaveLength(1);

  await unmount(tree);
});

test('a server without receipts is not waited for: no send ever reads as undelivered on its account', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify({ type: 'hello', version: '0.6.2' }) });
  });
  await typeInto(tree, 'coucou');
  await pressLabel(tree, 'Send message');
  await waitFor(() => bridge.sendMessage.mock.calls.some(([frame]) => String(frame).includes('"chat.send"')));
  expect(textsOf(tree)).not.toContain('sending…');
  expect(chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.pending)).toBe(false);
  await unmount(tree);
});
