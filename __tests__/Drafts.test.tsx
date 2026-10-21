/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { connection } from '../src/core/connection';
import { applyRemoteDraft, clearAllDrafts } from '../src/core/drafts';
import { deviceBridge } from '../src/core/nativeBridge';
import { renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-drafts';

beforeEach(() => {
  chatStore.clearAll();
  clearAllDrafts();
  jest.spyOn(connection, 'send').mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function inputOf(tree: Tree): ReactTestRenderer.ReactTestInstance {
  const fields = tree.root.findAll(node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'Message to send');
  const field = fields[0];
  if (!field) throw new Error('no composer field');
  return field;
}

function typeInto(tree: Tree, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    inputOf(tree).props.onChangeText(text);
  });
}

function focus(tree: Tree, focused: boolean): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const field = inputOf(tree);
    if (focused) field.props.onFocus();
    else field.props.onBlur();
  });
}

function arrive(text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    applyRemoteDraft(THREAD, text);
  });
}

describe('a draft written on another device', () => {
  test('lands in an empty composer', async () => {
    const tree = await renderApp();
    try {
      await arrive('commence sur le telephone');
      expect(inputOf(tree).props.value).toBe('commence sur le telephone');
    } finally {
      await unmount(tree);
    }
  });

  test('never overwrites what is being typed here', async () => {
    const tree = await renderApp();
    try {
      await focus(tree, true);
      await typeInto(tree, 'ce que je suis en train');

      await arrive('autre chose, ailleurs');

      // Replacing it would eat characters and throw the caret to the end, mid-word.
      expect(inputOf(tree).props.value).toBe('ce que je suis en train');
    } finally {
      await unmount(tree);
    }
  });

  test('catches up on a device left alone, even with old text in the field', async () => {
    const tree = await renderApp();
    try {
      await focus(tree, true);
      await typeInto(tree, 'texte de hier');
      await focus(tree, false);

      // Left alone means the debounce flushed: the server knows this text, so the device is not
      // ahead of it and the other window's newer draft wins. Text typed and not yet acknowledged
      // is a different case -- that one is never overwritten (the test above).
      await waitFor(() =>
        (connection.send as jest.Mock).mock.calls.some(([frame]) => String(frame).includes('"draft.set"')),
      );

      await arrive('la suite, ecrite au bureau');

      expect(inputOf(tree).props.value).toBe('la suite, ecrite au bureau');
    } finally {
      await unmount(tree);
    }
  });

  test('clears the composer when the message was sent from elsewhere', async () => {
    const tree = await renderApp();
    try {
      await arrive('en cours');
      expect(inputOf(tree).props.value).toBe('en cours');

      await arrive('');

      expect(inputOf(tree).props.value).toBe('');
    } finally {
      await unmount(tree);
    }
  });
});
