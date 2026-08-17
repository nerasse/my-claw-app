/**
 * Attachments on a cookie-authenticated client.
 *
 * The web build has no deviceId and no token: the session cookie is the credential. Every media
 * URL is therefore built without a credential query, and an identity that never resolves is what
 * turned every image in the browser into a bare filename.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image } from 'react-native';
import { AttachmentView } from '../AttachmentView';
import type { AttachmentMeta } from '../../core/protocol';

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
