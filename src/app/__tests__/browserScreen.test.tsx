/**
 * The Browser page.
 *
 * It exists so a paired device can take the browser over without asking the agent to read a file,
 * so the guards are about what it states: a password it does not have must never look like one it
 * is hiding, and a sidecar that is down must not read as an empty browser.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking, PixelRatio, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { browserLiveStore, closeShownWindow } from '../../core/browserLive';
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

// A tile's picture is asked for in device pixels, so what a tile asks for is the device's business:
// a phone at 3x and a desk at 1x draw the same wall, at different resolutions.
const pixelRatioIs = (ratio: number): void => {
  jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
};

/** The pane the wall lives in, and the fields above it: both are measured, never assumed. */
function measured(tree: ReactTestRenderer.ReactTestRenderer, pane: { width: number; height: number }, fields = 45): void {
  ReactTestRenderer.act(() => {
    tree.root.findByProps({ testID: 'browser-live-pane' }).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, ...pane } } });
    tree.root.findByProps({ testID: 'browser-live-fields' }).props.onLayout({ nativeEvent: { layout: { x: 0, y: 10, width: pane.width, height: fields } } });
  });
}

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

  beforeEach(() => {
    windowIs(412);
    pixelRatioIs(2);
  });

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
    expect(texts(tree).join(' ')).toContain('No password set');
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
    // In words, with the unit beside it for whoever reaches for systemctl.
    expect(shown).toEqual(expect.arrayContaining(['Chromium', 'my-claw-chromium', 'up', 'Web client (noVNC)', 'down', '1 down']));
    // The header says it too, from either pane: a service down is why the browser misbehaves.
    expect(shown).toContain('1 service down');
  });

  it('all running reads as such, and the header falls back to what is open', () => {
    const tree = renderVnc();
    ReactTestRenderer.act(() =>
      browserStore.replace(info({ services: [{ unit: 'my-claw-chromium', active: true }, { unit: 'my-claw-vnc', active: true }] })),
    );
    ReactTestRenderer.act(() =>
      browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1, { state: 'working' }), live(2, { state: 'waiting' }), live(3)] }),
    );
    const shown = texts(tree);
    expect(shown).toContain('all running');
    expect(shown).not.toContain('down');
    expect(shown).toContain('3 windows · 1 at work · 1 waiting for you');
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
    it('puts what needs the owner first: waiting, then at work, then the rest', () => {
      const tree = render();
      ReactTestRenderer.act(() =>
        browserLiveStore.receiveWindows({
          type: 'browser.windows.result',
          windows: [live(1), live(2, { state: 'working' }), live(3), live(4, { state: 'waiting' })],
        }),
      );
      const order = tree.root
        .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Open window ') && typeof n.props.onPress === 'function')
        .map(n => n.props.accessibilityLabel as string)
        .filter((label, i, all) => all.indexOf(label) === i);
      expect(order).toEqual(['Open window 4', 'Open window 2', 'Open window 1', 'Open window 3']);
    });

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

    it('draws a tile in the shape of the page, not 16/9', () => {
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1)] }));
      const box = (): Record<string, number> =>
        StyleSheet.flatten(tree.root.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.aspectRatio)[0]!.props.style) as Record<string, number>;
      // Before any picture, and for a pane whose browser is not a desktop: 16/9, roughly.
      expect(box().aspectRatio).toBeCloseTo(16 / 9);

      // The window is 1920x1080 and the page inside it is 1919x958 (the window's chrome takes the
      // rest): a 16/9 box draws every picture 13% taller than the page it shows.
      ReactTestRenderer.act(() =>
        browserLiveStore.receiveFrame({ type: 'browser.frame', pageId: 'p1', seq: 1, data: 'AA', width: 1919, height: 958 }),
      );
      expect(box().aspectRatio).toBeCloseTo(1919 / 958);
    });

    it('gives a window of another shape its own, so nothing is stretched', () => {
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2)] }));
      ReactTestRenderer.act(() => {
        browserLiveStore.receiveFrame({ type: 'browser.frame', pageId: 'p1', seq: 1, data: 'AA', width: 1919, height: 958 });
        // A popup a site opened for its own sign-in: its own window, its own shape.
        browserLiveStore.receiveFrame({ type: 'browser.frame', pageId: 'p2', seq: 1, data: 'AA', width: 500, height: 600 });
      });

      const boxes = tree.root
        .findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.aspectRatio)
        .map(n => StyleSheet.flatten(n.props.style).aspectRatio);
      expect(boxes).toEqual([expect.closeTo(1919 / 958), expect.closeTo(500 / 600)]);
    });

    it('asks for the picture size a tile is drawn at, and never past it', () => {
      pixelRatioIs(1);
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2)] }));
      // Before the pane is measured, the small preset: a tile that exists before its size is known.
      expect(sent().at(-1)).toMatchObject({ streams: [{ quality: 'tile' }, { quality: 'tile' }] });

      // A 2560x1440 window with the browser page to itself: two tiles of 1255pt, which the 640px
      // picture would be stretched to twice its size to fill.
      measured(tree, { width: 2521, height: 1285 });
      expect(sent().at(-1)).toEqual({
        type: 'browser.watch',
        windows: true,
        streams: [
          { pageId: 'p1', quality: 'tile-large' },
          { pageId: 'p2', quality: 'tile-large' },
        ],
      });
      const tiles = tree.root.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.overflow === 'hidden');
      expect(StyleSheet.flatten(tiles[0]!.props.style).width).toBe(Math.floor((2521 - 10) / 2));
    });

    // The rows are the layout's, drawn as they are: a wrap decided by the browser on rounded
    // pixels stacked two windows meant to sit side by side (2026-10-13, a 2507.7pt pane).
    it('draws the rows the layout chose, the last one centred', () => {
      pixelRatioIs(1);
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2), live(3)] }));
      measured(tree, { width: 2538, height: 1263 });

      const wall = tree.root.findByProps({ testID: 'browser-wall' });
      // A row is centred: a last one with fewer tiles sits in the middle, under the others.
      const rows = wall.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.justifyContent === 'center');
      const tilesIn = (row: ReactTestRenderer.ReactTestInstance) =>
        row.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.overflow === 'hidden').length;
      expect(rows.map(tilesIn).filter(n => n > 0)).toEqual([2, 1]);
      expect(StyleSheet.flatten(wall.props.style).flexWrap).toBeUndefined();
    });

    // A desk browser draws its scrollbar inside the pane: the rows get the fields' width, not the
    // pane's, or the last tile of a row is cut by the scrollbar.
    it('sizes the rows to the scroll view\'s content, not to the pane around it', () => {
      pixelRatioIs(1);
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2)] }));
      ReactTestRenderer.act(() => {
        tree.root.findByProps({ testID: 'browser-live-pane' }).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 2538, height: 1263 } } });
        tree.root.findByProps({ testID: 'browser-live-fields' }).props.onLayout({ nativeEvent: { layout: { x: 0, y: 10, width: 2528, height: 45 } } });
      });

      const tiles = tree.root.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.overflow === 'hidden');
      expect(StyleSheet.flatten(tiles[0]!.props.style).width).toBe((2528 - 10) / 2);
    });

    it('caps a tile at the picture it shows, and sits the grid in a screen-sized pane', () => {
      pixelRatioIs(2);
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1)] }));
      measured(tree, { width: 2521, height: 1285 });

      // A 2x desk: 1280 device pixels is 640pt, so the tile is that wide rather than 2521.
      const tiles = tree.root.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.overflow === 'hidden');
      expect(StyleSheet.flatten(tiles[0]!.props.style).width).toBe(640);
      expect(sent().at(-1)).toMatchObject({ streams: [{ quality: 'tile-large' }] });

      // A pane wider than it is tall is a screen for a wall: the grid sits in it, centred, rather
      // than hugging the fields with a hole under it.
      const wall = tree.root.findByProps({ testID: 'browser-wall' });
      expect(StyleSheet.flatten(wall.props.style).paddingTop).toBeGreaterThan(0);
      const row = wall.find(n => n.type === View && StyleSheet.flatten(n.props.style)?.flexDirection === 'row');
      expect(StyleSheet.flatten(row.props.style).justifyContent).toBe('center');
    });

    it('leaves a phone pane to its own height: one column, starting at the top', () => {
      pixelRatioIs(2.75);
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2)] }));
      measured(tree, { width: 393, height: 851 });

      const tiles = tree.root.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.overflow === 'hidden');
      expect(StyleSheet.flatten(tiles[0]!.props.style).width).toBe(393);
      const wall = tree.root.findByProps({ testID: 'browser-wall' });
      expect(StyleSheet.flatten(wall.props.style).paddingTop).toBe(0);
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

    it('a window shown large switches to another without going back, and Escape returns to the wall', () => {
      const tree = render();
      // Window 3 at work: first on the wall, still third in the switcher.
      ReactTestRenderer.act(() =>
        browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1), live(2), live(3, { state: 'working' })] }),
      );
      expect(closeShownWindow()).toBe(false);

      pressLabelled(tree, 'Show window 2 large');
      expect(sent().at(-1)).toMatchObject({ streams: [{ pageId: 'p2', quality: 'focus' }] });
      // The switcher reads in numbers, whatever order the wall put the windows in.
      const switcher = tree.root
        .findAll(n => typeof n.props.accessibilityLabel === 'string' && /^Show window \d large$/.test(n.props.accessibilityLabel) && typeof n.props.onPress === 'function')
        .map(n => n.props.accessibilityLabel);
      expect(switcher).toEqual(['Show window 1 large', 'Show window 2 large', 'Show window 3 large']);

      pressLabelled(tree, 'Show window 3 large');
      expect(sent().at(-1)).toMatchObject({ streams: [{ pageId: 'p3', quality: 'focus' }] });

      ReactTestRenderer.act(() => {
        expect(closeShownWindow()).toBe(true);
      });
      expect(sent().at(-1)).toMatchObject({ streams: [{ pageId: 'p1' }, { pageId: 'p2' }, { pageId: 'p3' }] });
      // Back on the wall, nothing is left to close: the next Escape is the page's.
      expect(closeShownWindow()).toBe(false);
    });

    it('a window shown large on a screen wider than the picture asks for the page at its own size', () => {
      pixelRatioIs(1);
      const tree = render();
      ReactTestRenderer.act(() => browserLiveStore.receiveWindows({ type: 'browser.windows.result', windows: [live(1)] }));
      measured(tree, { width: 2538, height: 1263 });
      pressLabelled(tree, 'Open window 1');
      expect(sent().at(-1)).toMatchObject({ streams: [{ pageId: 'p1', quality: 'focus-large' }] });

      // A phone is 1080 device pixels wide: the 1600 picture already covers it.
      ReactTestRenderer.act(() => tree.unmount());
      pixelRatioIs(2.75);
      const phone = render();
      measured(phone, { width: 393, height: 851 });
      pressLabelled(phone, 'Open window 1');
      expect(sent().at(-1)).toMatchObject({ streams: [{ pageId: 'p1', quality: 'focus' }] });
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
