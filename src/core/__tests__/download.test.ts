/**
 * The three destinations, and the one place that offers them -- docs mention the owner's ask of
 * 2026-09-26: every kind of file, everywhere, with a download that is not an enormous button.
 */
import { downloadHint, downloadLabel, newTransferId, saveMany, saveOne, SERIES_CONFIRM_ABOVE } from '../download';
import { deviceBridge } from '../nativeBridge';

jest.mock('../nativeBridge', () => ({
  deviceBridge: { downloadFile: jest.fn(), saveFile: jest.fn() },
}));

const bridge = deviceBridge as unknown as {
  downloadFile: jest.Mock;
  saveFile: jest.Mock;
};

const target = { url: 'http://host:8080/media/abc?device=d&token=t', filename: 'photo.png' };

beforeEach(() => {
  bridge.downloadFile.mockReset();
  bridge.saveFile.mockReset();
  bridge.downloadFile.mockResolvedValue({ path: '/Downloads/photo.png' });
  bridge.saveFile.mockResolvedValue({ path: '/Downloads/photo.png' });
});

describe('the three destinations say what they mean', () => {
  it('has its own label and hint each', () => {
    const labels = [downloadLabel('downloads'), downloadLabel('gallery'), downloadLabel('saveAs')];
    expect(new Set(labels).size).toBe(3);
    expect(downloadLabel('downloads')).toBe('Save to Downloads');
    expect(downloadLabel('gallery')).toMatch(/gallery/i);
    expect(downloadLabel('saveAs')).toMatch(/save as/i);
    // The hints are what tells Downloads from Pictures: the labels alone do not.
    expect(downloadHint('downloads')).not.toBe(downloadHint('gallery'));
  });

  it('makes a fresh transfer id every time, so a series does not overwrite its own progress', () => {
    const ids = new Set([newTransferId(), newTransferId(), newTransferId()]);
    expect(ids.size).toBe(3);
  });
});

describe('one file', () => {
  it('goes quietly to Downloads', async () => {
    expect(await saveOne(target, 'downloads', 'x')).toBe('Saved to Downloads');
    expect(bridge.downloadFile).toHaveBeenCalledWith(target.url, 'photo.png', false, 'x');
    expect(bridge.saveFile).not.toHaveBeenCalled();
  });

  it('goes to the gallery when that is the answer', async () => {
    expect(await saveOne(target, 'gallery', 'x')).toBe('Saved to the gallery');
    expect(bridge.downloadFile).toHaveBeenCalledWith(target.url, 'photo.png', true, 'x');
  });

  it('asks the system where to put it, and takes a dismissal as nothing at all', async () => {
    expect(await saveOne(target, 'saveAs', 'x')).toBe('Saved');
    expect(bridge.saveFile).toHaveBeenCalledWith(target.url, 'photo.png', 'x');
    // Dismissing the picker is not a failure, and must not be reported as one.
    bridge.saveFile.mockResolvedValue(null);
    expect(await saveOne(target, 'saveAs', 'x')).toBe('');
  });

  it('reports a failure as one', async () => {
    bridge.downloadFile.mockRejectedValue(new Error('offline'));
    expect(await saveOne(target, 'downloads', 'x')).toBe('Save failed');
  });
});

describe('a whole gallery', () => {
  const series = [
    { url: 'http://host:8080/media/a', filename: 'a.png' },
    { url: 'http://host:8080/media/b', filename: 'b.png' },
    { url: 'http://host:8080/media/c', filename: 'c.png' },
  ];

  it('sends them one at a time and says how far it got', async () => {
    const steps: string[] = [];
    const message = await saveMany(series, 'gallery', (done, total) => steps.push(`${done}/${total}`));
    expect(bridge.downloadFile).toHaveBeenCalledTimes(3);
    expect(steps).toEqual(['1/3', '2/3', '3/3']);
    expect(message).toBe('3 files saved');
  });

  it('stops at the first failure and admits how many made it', async () => {
    bridge.downloadFile.mockResolvedValueOnce({ path: 'a' }).mockRejectedValueOnce(new Error('offline'));
    const message = await saveMany(series, 'downloads', () => {});
    expect(bridge.downloadFile).toHaveBeenCalledTimes(2);
    expect(message).toBe('Saved 1 of 3, then it failed');
  });

  it('asks first only past a threshold nobody wants to tap through', () => {
    expect(SERIES_CONFIRM_ABOVE).toBeGreaterThanOrEqual(8);
    expect(SERIES_CONFIRM_ABOVE).toBeLessThanOrEqual(20);
  });
});
