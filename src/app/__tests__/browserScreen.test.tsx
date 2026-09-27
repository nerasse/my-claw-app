/**
 * The Browser page.
 *
 * It exists so a paired device can take the browser over without asking the agent to read a file,
 * so the guards are about what it states: a password it does not have must never look like one it
 * is hiding, and a sidecar that is down must not read as an empty browser.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { BrowserScreen } from '../BrowserScreen';
import { browserStore } from '../../core/browser';
import { connection } from '../../core/connection';
import {
  parseServerFrame,
  type BrowserInfoResultFrame,
  type BrowserLiveWindow,
  type BrowserUnblockResultFrame,
} from '../../core/protocol';
import { browserLiveStore } from '../../core/browserLive';
import { TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// The real singleton owns a socket and its reconnect timers; reaching it from a screen test
// leaks them past the run.
jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn(() => Promise.resolve()) },
}));

// Auto-mocked, so every test states the window it is talking about: left to itself the hook
// returns undefined and any consumer of the layout crashes on a size it never asked for.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');
const windowIs = (width: number): void => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
};

function info(over: Partial<BrowserInfoResultFrame> = {}): BrowserInfoResultFrame {
  return {
    type: 'browser.info.result',
    enabled: true,
    webUrl: 'http://10.10.20.10:6080/vnc.html?autoconnect=1',
    vncHost: '10.10.20.10',
    vncPort: 5900,
    password: 'sekret12',
    services: [
      { unit: 'my-claw-chromium', active: true },
      { unit: 'my-claw-novnc', active: false },
    ],
    tabs: [{ id: 'p1', title: 'LinkedIn', url: 'https://www.linkedin.com/feed/' }],
    ...over,
  };
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap(node => {
    const children = node.props.children;
    if (typeof children === 'string') return [children];
    // "Window {alias}" renders as an array of parts.
    if (Array.isArray(children) && children.every(c => typeof c === 'string' || typeof c === 'number')) {
      return [children.join('')];
    }
    return [];
  });
}

function sent(): Array<Record<string, unknown>> {
  return (connection.send as jest.Mock).mock.calls.map(([text]) => JSON.parse(text as string) as Record<string, unknown>);
}

function live(alias: number, over: Partial<BrowserLiveWindow> = {}): BrowserLiveWindow {
  return {
    alias,
    windowId: 100 + alias,
    onStage: false,
    state: 'free',
    tabs: [{ pageId: `p${alias}`, title: `Page ${alias}`, url: `https://site-${alias}.test/`, active: true }],
    ...over,
  };
}

function pressLabelled(tree: ReactTestRenderer.ReactTestRenderer, label: string): void {
  ReactTestRenderer.act(() => {
    tree.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}

describe('BrowserScreen', () => {
  let mounted: ReactTestRenderer.ReactTestRenderer | null = null;

  /** The store is module-level and its listeners outlive a test: a tree left mounted is still
   *  subscribed, so the next reset() re-renders it outside any act() and prints as an error. */
  function render(
    unblock?: BrowserUnblockResultFrame | null,
    over: { connected?: boolean; initialWindow?: number | null } = {},
  ): ReactTestRenderer.ReactTestRenderer {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      // The app renders every page under its GestureHandlerRootView (App.tsx); the live surface's
      // gestures refuse to mount without one.
      tree = ReactTestRenderer.create(
        <GestureHandlerRootView>
          <BrowserScreen error={null} unblock={unblock} onClose={() => {}} {...over} />
        </GestureHandlerRootView>,
      );
    });
    mounted = tree;
    return tree;
  }

  /** The VNC pane: where to connect, the password, the unlock, the units. */
  function renderVnc(unblock?: BrowserUnblockResultFrame | null): ReactTestRenderer.ReactTestRenderer {
    const tree = render(unblock);
    pressLabelled(tree, 'Connect with VNC');
    return tree;
  }

  beforeEach(() => windowIs(412));

  afterEach(() => {
    if (mounted) ReactTestRenderer.act(() => mounted?.unmount());
    mounted = null;
    browserStore.reset();
    browserLiveStore.reset();
    jest.clearAllMocks();
  });

  it('hides the password until it is asked for', () => {
    const tree = renderVnc();
    ReactTestRenderer.act(() => browserStore.replace(info()));

    expect(texts(tree)).not.toContain('sekret12');
    pressLabelled(tree, 'Show password');
    expect(texts(tree)).toContain('sekret12');
  });

  it('says there is no password rather than showing an empty one', () => {
    const tree = renderVnc();
    ReactTestRenderer.act(() => browserStore.replace(info({ password: undefined })));

    // The dots are the mask of a password that exists; without one they would claim a lock that
    // is not there.
    expect(texts(tree)).not.toContain('········');
    expect(texts(tree).join(' ')).toContain('no password set');
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Show password' })).toHaveLength(0);
  });

  it('opens the web client and copies the link with two distinct buttons', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = renderVnc();
    ReactTestRenderer.act(() => browserStore.replace(info()));

    pressLabelled(tree, 'Open noVNC');
    expect(openURL).toHaveBeenCalledWith('http://10.10.20.10:6080/vnc.html?autoconnect=1');

    pressLabelled(tree, 'Copy noVNC link');
    expect(Clipboard.setString).toHaveBeenCalledWith('http://10.10.20.10:6080/vnc.html?autoconnect=1');

    // The native client needs the bare host and port, not the web URL.
    pressLabelled(tree, 'Copy VNC address');
    expect(Clipboard.setString).toHaveBeenLastCalledWith('10.10.20.10:5900');
    openURL.mockRestore();
  });

  it('shows which units are down, which is the reason to open the page at all', () => {
    const tree = renderVnc();
    ReactTestRenderer.act(() => browserStore.replace(info()));

    const shown = texts(tree);
    expect(shown).toContain('my-claw-chromium');
    expect(shown).toContain('up');
    expect(shown).toContain('down');
  });

  // The shell opens this page inside its own column, which on a wide window is a 460pt pane beside
  // the conversation. The page used to place itself like a layer over the whole window as well,
  // offset past the pinned list: 288 of that pane went to an empty margin and the cards drew in
  // what was left, title wrapping one letter per line.
  it('flows inside the pane it was given, whatever the window is doing', () => {
    windowIs(1600);
    const tree = render();
    const root = StyleSheet.flatten(tree.root.findAllByType(View)[0]!.props.style) as Record<string, unknown>;

    expect(root.position).toBeUndefined();
    expect(root.left).toBeUndefined();
    expect(root.flex).toBe(1);
  });

  it('asks the server on open, because units start and stop between two visits', () => {
    render();
    expect(connection.send).toHaveBeenCalledWith(JSON.stringify({ type: 'browser.info' }));
  });

  it('is a frame the parser lets through', () => {
    // parseServerFrame is a whitelist: a type missing from it is dropped before any router runs,
    // which is invisible to a test that hands routeFrame an already-typed object.
    expect(parseServerFrame(JSON.stringify(info()))).not.toBeNull();
  });

  it('asks the server to unlock, from the page that says nothing is clickable', () => {
    const tree = renderVnc();
    ReactTestRenderer.act(() => browserStore.replace(info()));

    pressLabelled(tree, 'Unlock the browser');
    expect(connection.send).toHaveBeenCalledWith(JSON.stringify({ type: 'browser.unblock' }));
  });

  it('shows what the unlock did, and stays quiet when nothing was stuck', () => {
    const stuck = renderVnc({
      type: 'browser.unblock.result',
      ok: true,
      message: 'closed "Open File"',
      actions: [{ action: 'closed', window: 'Open File' }],
    });
    ReactTestRenderer.act(() => browserStore.replace(info()));
    expect(texts(stuck)).toContain('closed "Open File"');

    ReactTestRenderer.act(() => stuck.unmount());
    mounted = null;
    const idle = renderVnc({
      type: 'browser.unblock.result',
      ok: true,
      message: 'nothing was stuck behind the browser',
      actions: [],
    });
    ReactTestRenderer.act(() => browserStore.replace(info()));
    expect(texts(idle)).toContain('nothing was stuck behind the browser');
  });

  it('lets the unlock result through the parser too', () => {
    const frame = { type: 'browser.unblock.result', ok: true, message: 'closed "Open File"', actions: [] };
    expect(parseServerFrame(JSON.stringify(frame))).not.toBeNull();
  });

  describe('the live view', () => {
    it('opens on it, watches the listing and a tile of every window', () => {
      const tree = render();
      expect(sent()).toContainEqual({ type: 'browser.watch', windows: true, streams: [] });
      ReactTestRenderer.act(() =>
        browserLiveStore.receiveWindows({
          type: 'browser.windows.result',
          windows: [live(1, { state: 'working', task: 'apply to the Nabla job', onStage: true }), live(2, { state: 'waiting' })],
        }),
      );
      expect(sent().at(-1)).toEqual({
        type: 'browser.watch',
        windows: true,
        streams: [
          { pageId: 'p1', quality: 'tile' },
          { pageId: 'p2', quality: 'tile' },
        ],
      });
      const shown = texts(tree);
      expect(shown).toEqual(expect.arrayContaining(['Window 1', 'agent at work', 'apply to the Nabla job', 'on VNC', 'Window 2', 'waiting for you']));
      // The window already on the VNC screen offers no button to put it there.
      expect(tree.root.findAllByProps({ accessibilityLabel: 'Show window 1 in VNC' })).toHaveLength(0);
      pressLabelled(tree, 'Show window 2 in VNC');
      expect(sent().at(-1)).toMatchObject({ type: 'browser.control', action: 'stage', windowId: 102 });
    });

    it('a window opened at full size is watched alone, at full quality, and the page says what it can do', () => {
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2)] }));
      pressLabelled(tree, 'Open window 2');
      expect(sent().at(-1)).toEqual({ type: 'browser.watch', windows: true, streams: [{ pageId: 'p2', quality: 'focus' }] });

      pressLabelled(tree, 'Show in VNC');
      expect(sent().at(-1)).toMatchObject({ type: 'browser.control', action: 'stage', windowId: 102 });
      pressLabelled(tree, 'Reload');
      expect(sent().at(-1)).toMatchObject({ type: 'browser.control', action: 'reload', pageId: 'p2' });
      pressLabelled(tree, 'Key Enter');
      expect(sent().at(-1)).toMatchObject({ type: 'browser.input', pageId: 'p2', input: { kind: 'key', key: 'Enter' } });

      const address = tree.root.findByProps({ accessibilityLabel: 'Address' });
      ReactTestRenderer.act(() => address.props.onChangeText('news.test'));
      ReactTestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'Address' }).props.onSubmitEditing());
      expect(sent().at(-1)).toMatchObject({ type: 'browser.control', action: 'goto', pageId: 'p2', url: 'news.test' });

      pressLabelled(tree, 'Back to all windows');
      expect(sent().at(-1)).toMatchObject({ type: 'browser.watch', streams: [{ quality: 'tile' }, { quality: 'tile' }] });
    });

    it('what is typed in the field reaches the page as text, and a correction as the keys that make it', () => {
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1)] }));
      pressLabelled(tree, 'Open window 1');
      const field = () => tree.root.findByProps({ accessibilityLabel: 'Type into the page' });
      ReactTestRenderer.act(() => field().props.onChangeText('helo'));
      ReactTestRenderer.act(() => field().props.onChangeText('hello'));
      ReactTestRenderer.act(() => field().props.onChangeText('help'));
      const inputs = sent().filter(f => f.type === 'browser.input').map(f => f.input);
      expect(inputs).toEqual([
        { kind: 'text', text: 'helo' },
        { kind: 'key', key: 'Backspace' },
        { kind: 'text', text: 'lo' },
        { kind: 'key', key: 'Backspace' },
        { kind: 'key', key: 'Backspace' },
        { kind: 'text', text: 'p' },
      ]);
      ReactTestRenderer.act(() => field().props.onSubmitEditing());
      expect(sent().at(-1)).toMatchObject({ type: 'browser.input', input: { kind: 'key', key: 'Enter' } });
      expect(field().props.value).toBe('');
      expect(tree.root.findAllByType(TextInput).length).toBeGreaterThan(0);
    });

    // The outbox replays what it held after a reconnect: a tap made offline would land on a page
    // that has moved since.
    it('offline, nothing is sent to the page', () => {
      const tree = render(null, { connected: false });
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1)] }));
      pressLabelled(tree, 'Open window 1');
      pressLabelled(tree, 'Key Enter');
      expect(sent().filter(f => f.type === 'browser.input')).toHaveLength(0);
      expect(texts(tree).join(' ')).toContain('offline');
    });

    it('a web tab popped out for one window opens on it', () => {
      render(null, { initialWindow: 102 });
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2)] }));
      expect(sent().at(-1)).toEqual({ type: 'browser.watch', windows: true, streams: [{ pageId: 'p2', quality: 'focus' }] });
    });

    it('closing a window an agent works in takes a second press', () => {
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1, { state: 'working' })] }));
      pressLabelled(tree, 'Open window 1');
      pressLabelled(tree, 'Close window');
      expect(sent().some(f => f.action === 'close_window')).toBe(false);
      pressLabelled(tree, 'Close window');
      expect(sent()).toContainEqual(expect.objectContaining({ type: 'browser.control', action: 'close_window', windowId: 101 }));
    });

    it('a refused action is shown, and a new window is asked with its address', () => {
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [] }));
      ReactTestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'New window address' }).props.onChangeText('example.com'));
      pressLabelled(tree, 'Open a new window');
      expect(sent().at(-1)).toMatchObject({ type: 'browser.control', action: 'new_window', url: 'example.com' });
      ReactTestRenderer.act(() => browserLiveStore.receiveControl({ type: 'browser.control.result', id: 'c1', ok: false, error: 'There is no window 9' }));
      expect(texts(tree)).toContain('There is no window 9');
    });

    it('leaving the page stops watching', () => {
      const tree = render();
      ReactTestRenderer.act(() => tree.unmount());
      mounted = null;
      expect(sent().at(-1)).toEqual({ type: 'browser.watch', windows: false, streams: [] });
    });

    it('lets the live frames through the parser', () => {
      for (const frame of [
        { type: 'browser.windows.result', windows: [] },
        { type: 'browser.frame', pageId: 'p', seq: 1, data: 'AA', width: 10, height: 5 },
        { type: 'browser.frame.gone', pageId: 'p' },
        { type: 'browser.control.result', ok: true },
      ]) {
        expect(parseServerFrame(JSON.stringify(frame))).not.toBeNull();
      }
    });
  });
});
