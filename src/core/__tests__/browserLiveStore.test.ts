import { browserLiveStore, shownTab, windowFromLocation } from '../browserLive';
import type { BrowserLiveWindow, ServerFrame } from '../protocol';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { parseServerFrame } from '../protocol';

const frame = (pageId: string, seq: number, data = 'AA') => ({ type: 'browser.frame' as const, pageId, seq, data, width: 1600, height: 900 });

describe('browserLiveStore', () => {
  afterEach(() => browserLiveStore.reset());

  it('keeps a tab\'s newest picture: one that crossed on the wire late never replaces it', () => {
    browserLiveStore.receiveFrame(frame('p1', 5, 'NEW'));
    browserLiveStore.receiveFrame(frame('p1', 4, 'OLD'));
    expect(browserLiveStore.getFrame('p1')).toEqual({ uri: 'data:image/jpeg;base64,NEW', seq: 5, width: 1600, height: 900 });
  });

  it('tells only the listeners of the tab whose picture changed', () => {
    const one = jest.fn();
    const two = jest.fn();
    const off = browserLiveStore.subscribeFrame('p1', one);
    browserLiveStore.subscribeFrame('p2', two);
    browserLiveStore.receiveFrame(frame('p1', 1));
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).not.toHaveBeenCalled();
    off();
    browserLiveStore.receiveFrame(frame('p1', 2));
    expect(one).toHaveBeenCalledTimes(1);
  });

  it('a closed tab is gone, and the pictures of tabs no longer shown are dropped', () => {
    browserLiveStore.receiveFrame(frame('p1', 1));
    browserLiveStore.receiveFrame(frame('p2', 2));
    browserLiveStore.receiveGone('p1');
    expect(browserLiveStore.getFrame('p1')).toBe('gone');
    browserLiveStore.keepFrames(['p1']);
    expect(browserLiveStore.getFrame('p2')).toBeUndefined();
  });

  it('a refused action is the notice, an accepted one clears it', () => {
    browserLiveStore.receiveControl({ type: 'browser.control.result', ok: false, error: 'no such window' });
    expect(browserLiveStore.getNotice()).toBe('no such window');
    browserLiveStore.receiveControl({ type: 'browser.control.result', ok: true });
    expect(browserLiveStore.getNotice()).toBeNull();
  });
});

describe('shownTab', () => {
  const w = (tabs: BrowserLiveWindow['tabs']): BrowserLiveWindow => ({ alias: 1, windowId: 1, onStage: false, state: 'free', tabs });
  it('is the tab its window shows, or its newest one when none was seen to come forward', () => {
    const a = { pageId: 'a', title: '', url: '', active: false };
    const b = { pageId: 'b', title: '', url: '', active: false };
    expect(shownTab(w([a, { ...b, active: true }]))?.pageId).toBe('b');
    expect(shownTab(w([{ ...a, active: true }, b]))?.pageId).toBe('a');
    expect(shownTab(w([a, b]))?.pageId).toBe('b');
    expect(shownTab(w([]))).toBeUndefined();
  });
});

describe('windowFromLocation', () => {
  const g = globalThis as { location?: { hash?: string } };
  const saved = g.location;
  afterEach(() => {
    g.location = saved;
  });
  it('reads the window a popped-out tab was opened on, and nothing else', () => {
    g.location = { hash: '#browser-window=1962074506' };
    expect(windowFromLocation()).toBe(1962074506);
    g.location = { hash: '#other' };
    expect(windowFromLocation()).toBeNull();
    g.location = undefined;
    expect(windowFromLocation()).toBeNull();
  });
});

// What arrives on the socket goes through the parser and the router: a test that fed the store
// directly would not see a frame dropped on the way.
describe('the live frames, off the wire', () => {
  const handlers = { activeThreadId: () => null, subagentParent: () => null } as unknown as ServerFrameHandlers;
  const wire = (sent: object) => routeServerFrame(parseServerFrame(JSON.stringify(sent)) as ServerFrame, handlers);
  afterEach(() => browserLiveStore.reset());

  it('reach the store: the listing, a picture, a closed tab, a refusal', () => {
    wire({ type: 'browser.windows.result', windows: [{ alias: 1, windowId: 7, onStage: true, state: 'free', tabs: [] }] });
    expect(browserLiveStore.getWindows().windows?.[0]?.windowId).toBe(7);
    wire({ type: 'browser.frame', pageId: 'p1', seq: 1, data: 'QQ', width: 1600, height: 900 });
    expect(browserLiveStore.getFrame('p1')).toMatchObject({ uri: 'data:image/jpeg;base64,QQ' });
    wire({ type: 'browser.frame.gone', pageId: 'p1' });
    expect(browserLiveStore.getFrame('p1')).toBe('gone');
    wire({ type: 'browser.control.result', id: 'c1', ok: false, error: 'There is no window 9' });
    expect(browserLiveStore.getNotice()).toBe('There is no window 9');
  });
});
