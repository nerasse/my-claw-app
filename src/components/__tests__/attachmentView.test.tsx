/**
 * Attachments on a cookie-authenticated client.
 *
 * The web build has no deviceId and no token: the session cookie is the credential. Every media
 * URL is therefore built without a credential query, and an identity that never resolves is what
 * turned every image in the browser into a bare filename.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image, StyleSheet } from 'react-native';
import { AttachmentView } from '../AttachmentView';
import { recordDiag } from '../../core/diagnostics';
import type { AttachmentMeta } from '../../core/protocol';

jest.mock('../../core/diagnostics', () => ({ recordDiag: jest.fn() }));

const BASE = 'http://host:8080';

function render(att: AttachmentMeta, deviceInfo: { deviceId: string; token: string } | null) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <AttachmentView att={att} mediaBase={BASE} deviceInfo={deviceInfo} onOpen={() => {}} />,
    );
  });
  return tree;
}

function imageUris(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Image)
    .map(node => (node.props.source as { uri?: string } | undefined)?.uri ?? '');
}

describe('AttachmentView with a cookie session', () => {
  it('renders an image from the plain media url', () => {
    const tree = render({ id: 'abc', type: 'image', filename: 'shot.png' }, { deviceId: '', token: '' });
    expect(imageUris(tree)).toEqual([`${BASE}/media/abc`]);
  });

  it('keeps the credential query for a native client', () => {
    const tree = render({ id: 'abc', type: 'image' }, { deviceId: 'phone', token: 'sec ret' });
    expect(imageUris(tree)).toEqual([`${BASE}/media/abc?device=phone&token=sec%20ret`]);
  });

  it('gives a video its server thumbnail', () => {
    const tree = render({ id: 'vid', type: 'video' }, { deviceId: '', token: '' });
    expect(imageUris(tree)).toEqual([`${BASE}/media/vid?thumb=1`]);
  });

  it('opens a file with the same url the viewer will fetch', () => {
    const opened: Array<{ kind: string; url: string }> = [];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AttachmentView
          att={{ id: 'doc', type: 'file', filename: 'notes.pdf' }}
          mediaBase={BASE}
          deviceInfo={{ deviceId: '', token: '' }}
          onOpen={(kind, target) => opened.push({ kind, url: target.url })}
        />,
      );
    });
    const pressable = tree.root.findAll(node => typeof node.props?.onPress === 'function')[0];
    if (!pressable) throw new Error('the file chip is not pressable');
    ReactTestRenderer.act(() => {
      pressable.props.onPress();
    });
    expect(opened).toEqual([{ kind: 'file', url: `${BASE}/media/doc` }]);
  });

  it('has nothing to show before the identity resolves', () => {
    const tree = render({ id: 'abc', type: 'image', filename: 'shot.png' }, null);
    expect(imageUris(tree)).toEqual([]);
  });
});

/**
 * What a picture that never arrives looks like.
 *
 * The image branch ignored `deleted`, so an attachment the server could not resolve drew a full
 * stage and fetched an id that cannot exist (`media-0`): an empty box under a bare filename, which
 * reads as a picture still loading. Measured on the owner's phone (2026-09-15), that shape hid a
 * server-side resolution miss for a day -- the same bare filename the web had shown once before.
 */
describe('AttachmentView: an attachment with nothing to draw', () => {
  const failed = recordDiag as jest.Mock;

  beforeEach(() => {
    failed.mockClear();
  });

  it('draws a deleted image as a chip, never as a stage', () => {
    const tree = render({ id: 'gone', type: 'image', filename: 'shot.png', deleted: true }, { deviceId: '', token: '' });
    expect(imageUris(tree)).toEqual([]);
    const labels = tree.root.findAll(node => typeof node.children?.join === 'function');
    expect(JSON.stringify(labels.map(node => node.children.join('')))).toContain('shot.png (deleted)');
  });

  it('falls back to the chip when the bytes never come, and names it in the diagnostics', () => {
    const tree = render({ id: 'abc', type: 'image', filename: 'shot.png' }, { deviceId: '', token: '' });
    expect(imageUris(tree)).toEqual([`${BASE}/media/abc`]);

    const image = tree.root.findAllByType(Image)[0]!;
    ReactTestRenderer.act(() => {
      (image.props as { onError: () => void }).onError();
    });

    // The stage is gone: no id left to fetch, so no second request and no empty box.
    expect(imageUris(tree)).toEqual([]);
    expect(failed).toHaveBeenCalledTimes(1);
    const report = failed.mock.calls[0]![0] as { message: string; stack: string };
    expect(report.message).toContain('failed to load');
    expect(report.stack).toContain('id=abc');
    // The token rides the query, and the query never reaches a log.
    expect(report.stack).not.toContain('token');
  });
});

describe("a picture takes its own shape", () => {
  const original = (Image as unknown as { getSize?: unknown }).getSize;

  it('sizes a wide capture by its ratio instead of the old 190 square', () => {
    // The browser capture of a report is 1280x520. In a 350pt bubble that is a 142pt picture;
    // the square it replaces drew it 190x77 inside a 190 box, and the empty band under it is
    // what the owner kept scrolling past (2026-09-17).
    (Image as unknown as { getSize: unknown }).getSize = (_uri: string, ok?: (w: number, h: number) => void) =>
      ok?.(1280, 520);
    try {
      const tree = render({ id: 'wide', type: 'image', filename: 'shot.png' }, { deviceId: 'd', token: 't' });
      const stage = tree.root.findAll(node => typeof node.props.onLayout === 'function')[0]!;
      ReactTestRenderer.act(() => {
        stage.props.onLayout({ nativeEvent: { layout: { width: 350 } } });
      });
      const box = StyleSheet.flatten(stage.props.style) as { height?: number };
      expect(box.height).toBe(142);
      expect(box.height).toBeLessThan(190);
    } finally {
      (Image as unknown as { getSize: unknown }).getSize = original;
    }
  });
});
