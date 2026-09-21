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
import { parseServerFrame, type BrowserInfoResultFrame, type BrowserUnblockResultFrame } from '../../core/protocol';

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
    return typeof children === 'string' ? [children] : [];
  });
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
  function render(unblock?: BrowserUnblockResultFrame | null): ReactTestRenderer.ReactTestRenderer {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<BrowserScreen error={null} unblock={unblock} onClose={() => {}} />);
    });
    mounted = tree;
    return tree;
  }

  beforeEach(() => windowIs(412));

  afterEach(() => {
    if (mounted) ReactTestRenderer.act(() => mounted?.unmount());
    mounted = null;
    browserStore.reset();
    jest.clearAllMocks();
  });

  it('hides the password until it is asked for', () => {
    const tree = render();
    ReactTestRenderer.act(() => browserStore.replace(info()));

    expect(texts(tree)).not.toContain('sekret12');
    pressLabelled(tree, 'Show password');
    expect(texts(tree)).toContain('sekret12');
  });

  it('says there is no password rather than showing an empty one', () => {
    const tree = render();
    ReactTestRenderer.act(() => browserStore.replace(info({ password: undefined })));

    // The dots are the mask of a password that exists; without one they would claim a lock that
    // is not there.
    expect(texts(tree)).not.toContain('········');
    expect(texts(tree).join(' ')).toContain('no password set');
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Show password' })).toHaveLength(0);
  });

  it('opens the web client and copies the link with two distinct buttons', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = render();
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

  it('reports a sidecar that could not be reached instead of an empty tab list', () => {
    const tree = render();
    ReactTestRenderer.act(() =>
      browserStore.replace(info({ tabs: [], tabsError: 'connect ECONNREFUSED 127.0.0.1:9223' })),
    );

    const shown = texts(tree).join(' ');
    expect(shown).toContain('ECONNREFUSED');
    expect(shown).not.toContain('no tab open');
  });

  it('shows which units are down, which is the reason to open the page at all', () => {
    const tree = render();
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
    const tree = render();
    ReactTestRenderer.act(() => browserStore.replace(info()));

    pressLabelled(tree, 'Unlock the browser');
    expect(connection.send).toHaveBeenCalledWith(JSON.stringify({ type: 'browser.unblock' }));
  });

  it('shows what the unlock did, and stays quiet when nothing was stuck', () => {
    const stuck = render({
      type: 'browser.unblock.result',
      ok: true,
      message: 'closed "Open File"',
      actions: [{ action: 'closed', window: 'Open File' }],
    });
    ReactTestRenderer.act(() => browserStore.replace(info()));
    expect(texts(stuck)).toContain('closed "Open File"');

    ReactTestRenderer.act(() => stuck.unmount());
    mounted = null;
    const idle = render({
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
});
