/**
 * What a press on a download control does, phone and browser -- `core/downloadFlow.ts`. The menus
 * go to the overlay store, which is what keeps them out of the element holding the arrow.
 */
import { Platform } from 'react-native';
import { requestDownload, type DownloadState } from '../downloadFlow';
import { overlayStore, type OverlayMenu } from '../overlay';
import { deviceBridge } from '../nativeBridge';
import type { SheetEntry, SheetOption } from '../../components/ActionSheet';

jest.mock('../nativeBridge', () => ({
  deviceBridge: { downloadFile: jest.fn(), saveFile: jest.fn() },
}));

const bridge = deviceBridge as unknown as { downloadFile: jest.Mock; saveFile: jest.Mock };
const platform = Platform as { OS: string };
const os = platform.OS;

const one = { url: 'http://host/media/a?device=d&token=t', filename: 'a.png' };
const series = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `http://host/media/${i}`, filename: `${i}.png` }));

const menu = (): OverlayMenu | null => overlayStore.getState().menu;
const labels = (): string[] =>
  (menu()?.options ?? []).filter((o): o is SheetOption & { type?: undefined } => o.type === undefined).map(o => o.label);
/** Presses a row as the host does: the menu closes first, then the row runs. */
const choose = (label: string): void => {
  const option = (menu()?.options ?? []).find((o: SheetEntry) => o.type === undefined && o.label === label) as
    | SheetOption
    | undefined;
  if (!option) throw new Error(`no row "${label}" in ${JSON.stringify(labels())}`);
  overlayStore.close();
  option.onPress();
};
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  overlayStore.reset();
  bridge.downloadFile.mockReset().mockResolvedValue({ path: '/Downloads/a.png' });
  bridge.saveFile.mockReset().mockResolvedValue({ path: '/x' });
});
afterEach(() => {
  platform.OS = os;
  overlayStore.reset();
});

describe('on a phone', () => {
  beforeEach(() => {
    platform.OS = 'android';
  });

  it('opens the destinations as a sheet over the screen, the gallery only for pictures and films', () => {
    requestDownload({ targets: [one] });
    expect(menu()).toMatchObject({ kind: 'sheet', preview: 'a.png' });
    expect(labels()).toEqual(['Save to Downloads', 'Save as…']);
    requestDownload({ targets: [one], gallery: true });
    expect(labels()).toEqual(['Save to Downloads', 'Save to the gallery', 'Save as…']);
  });

  it('saves where it was told, follows it on the control, and says so in the notice', async () => {
    const states: DownloadState[] = [];
    requestDownload({ targets: [one], gallery: true, transferId: 't1', onState: s => states.push(s) });
    choose('Save to the gallery');
    await settle();
    expect(bridge.downloadFile).toHaveBeenCalledWith(one.url, 'a.png', true, 't1');
    expect(states).toEqual([{ phase: 'busy', series: null }, { phase: 'done', ok: true }]);
    expect(overlayStore.getState().notice).toMatchObject({ text: 'Saved to the gallery', failed: false });
    expect(menu()).toBeNull();
  });

  it('says a failure as one, and a dismissed "Save as" not at all', async () => {
    bridge.downloadFile.mockRejectedValue(new Error('offline'));
    requestDownload({ targets: [one] });
    choose('Save to Downloads');
    await settle();
    expect(overlayStore.getState().notice).toMatchObject({ text: 'Save failed', failed: true });

    overlayStore.reset();
    bridge.saveFile.mockResolvedValue(null);
    const states: DownloadState[] = [];
    requestDownload({ targets: [one], onState: s => states.push(s) });
    choose('Save as…');
    await settle();
    expect(overlayStore.getState().notice).toBeNull();
    expect(states.at(-1)).toEqual({ phase: 'idle' });
  });

  it('offers the whole series in the same sheet, and back', () => {
    requestDownload({ targets: [one], all: series(3), gallery: true });
    expect(labels()).toContain('Save all 3…');
    choose('Save all 3…');
    expect(menu()).toMatchObject({ kind: 'sheet', preview: '3 files' });
    expect(labels()).toContain('Just this one');
    choose('Just this one');
    expect(menu()).toMatchObject({ preview: 'a.png' });
  });

  it('asks once before saving more than ten, and saves them one at a time', async () => {
    requestDownload({ targets: [one], all: series(12), gallery: true });
    choose('Save all 12…');
    choose('Save to Downloads');
    expect(menu()).toMatchObject({ kind: 'sheet', preview: '12 files' });
    expect(bridge.downloadFile).not.toHaveBeenCalled();
    choose('Save 12 files');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(bridge.downloadFile).toHaveBeenCalledTimes(12);
    expect(overlayStore.getState().notice?.text).toBe('12 files saved');
  });
});

describe('in a browser', () => {
  let clicked: string[];
  const realDocument = (globalThis as { document?: unknown }).document;
  beforeEach(() => {
    platform.OS = 'web';
    clicked = [];
    (globalThis as { document?: unknown }).document = {
      createElement: () => {
        const a = { href: '', download: '', rel: '', click: () => clicked.push(a.download), remove: () => {} };
        return a;
      },
      body: { appendChild: () => {} },
    };
  });
  afterEach(() => {
    (globalThis as { document?: unknown }).document = realDocument;
  });

  it('downloads at once: no menu, no destination, and the browser bar is the feedback', async () => {
    requestDownload({ targets: [one], gallery: true, anchor: { x: 0, y: 0, width: 32, height: 32 } });
    await settle();
    expect(menu()).toBeNull();
    expect(clicked).toEqual(['a.png']);
    expect(overlayStore.getState().notice).toBeNull();
  });

  it('hangs "this file / all N" under the arrow for a series', async () => {
    const anchor = { x: 900, y: 40, width: 36, height: 36 };
    requestDownload({ targets: [one], all: series(2), anchor });
    expect(menu()).toEqual(expect.objectContaining({ kind: 'menu', anchor }));
    expect(labels()).toEqual(['This file', 'All 2 files']);
    choose('This file');
    await settle();
    expect(clicked).toEqual(['a.png']);
  });
});
