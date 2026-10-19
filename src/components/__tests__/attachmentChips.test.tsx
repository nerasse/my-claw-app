/**
 * The chips a staged file becomes in the composer.
 *
 * A name and a size said nothing about what was about to be sent: with a row of pictures the owner
 * could not tell them apart, and the file was only uploaded when the message went out (2026-09-15).
 * The chip draws the file itself when it is a picture or a video, its kind otherwise, says when its
 * bytes never arrived, and a tap opens it in the very viewer the conversation's files open in.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Composer } from '../Composer';
import type { PendingAttachment } from '../../core/upload';

const photo: PendingAttachment = {
  id: 'a-1',
  uri: 'file:///cache/photo.jpg',
  filename: 'photo.jpg',
  type: 'image',
  mimeType: 'image/jpeg',
  sizeBytes: 2048,
  mediaId: 'media-9',
};

const notes: PendingAttachment = {
  id: 'a-2',
  uri: 'file:///cache/notes.md',
  filename: 'notes.md',
  type: 'file',
  mimeType: 'text/markdown',
  sizeBytes: 64,
};

function render(
  attachments: PendingAttachment[],
  props: {
    attachmentThumb?: (attachment: PendingAttachment) => string | undefined;
    onOpenAttachment?: (attachment: PendingAttachment) => void;
    onRemoveAttachment?: (id: string) => void;
    uploadFailed?: Record<string, true>;
    onRetryAttachment?: (attachment: PendingAttachment) => void;
  } = {},
): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        attachments={attachments}
        {...props}
      />,
    );
  });
  return tree;
}

function pressableWith(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  );
}

/** Every string drawn anywhere in the tree, joined, so a chip's one line can be read whole. */
function drawn(tree: ReactTestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    const collect = (value: unknown): void => {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'number') out.push(String(value));
      else if (Array.isArray(value)) value.forEach(collect);
    };
    collect(node.props?.children);
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'props' in child) walk(child as ReactTestRenderer.ReactTestInstance);
    }
  };
  walk(tree.root);
  return out.join(' | ');
}

test('a staged picture draws itself and a document draws its kind', () => {
  // The caller only offers a square for a file that has one: a picture or a video.
  const thumb = (att: PendingAttachment): string | undefined =>
    att.type === 'image' || att.type === 'video' ? att.uri : undefined;
  const tree = render([photo, notes], { attachmentThumb: thumb });

  const squares = tree.root.findAll(
    node => node.props.source?.uri === 'file:///cache/photo.jpg',
    { deep: true },
  );
  expect(squares.length).toBeGreaterThan(0);
  // The document has no picture to show: its kind stands in for one, and never the bytes.
  expect(drawn(tree)).toContain('FILE');
  expect(tree.root.findAll(node => node.props.source?.uri === 'file:///cache/notes.md', { deep: true })).toHaveLength(0);
});

test('a tap on a staged chip opens the viewer the files page opens', () => {
  const opened: string[] = [];
  const tree = render([photo], { onOpenAttachment: att => opened.push(att.id) });

  const chip = pressableWith(tree, 'Preview attachment photo.jpg');
  expect(chip.length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => chip[0].props.onPress());
  expect(opened).toEqual(['a-1']);
});

test('the cross removes the chip, and its file with it', () => {
  const removed: string[] = [];
  const tree = render([photo, notes], { onRemoveAttachment: id => removed.push(id) });

  const cross = pressableWith(tree, 'Remove attachment notes.md');
  expect(cross.length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => cross[0].props.onPress());

  // The screen is what deletes the server's copy; the chip only says which one goes.
  expect(removed).toEqual(['a-2']);
});

test('a chip whose bytes never arrived says so, and offers its own retry', () => {
  const retried: string[] = [];
  const tree = render([photo], {
    uploadFailed: { 'a-1': true },
    onRetryAttachment: att => retried.push(att.id),
    attachmentThumb: att => att.uri,
  });

  // The failure is on the chip, not in a banner: it is one file out of many. And the chip is not
  // thrown away for it -- the retry sends the same take again.
  expect(drawn(tree)).toContain('failed');
  const retry = pressableWith(tree, 'Retry upload of photo.jpg');
  expect(retry.length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => retry[0]!.props.onPress());
  expect(retried).toEqual(['a-1']);
});

test('a voice take that never arrived keeps its row and offers a retry', () => {
  const voice: PendingAttachment = {
    id: 'v-1',
    uri: 'file:///cache/take.m4a',
    filename: 'voice-note.m4a',
    type: 'audio',
    mimeType: 'audio/mp4',
    sizeBytes: 900,
    audioAsVoice: true,
    durationMs: 4200,
  };
  const retried: string[] = [];
  // The player's waveform is a gesture: the tree needs the root the app provides for real.
  const { GestureHandlerRootView } = require('react-native-gesture-handler');
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Composer
          value=""
          onChange={() => {}}
          onSend={() => {}}
          attachments={[voice]}
          uploadFailed={{ 'v-1': true }}
          onRetryAttachment={att => retried.push(att.id)}
        />
      </GestureHandlerRootView>,
    );
  });

  expect(drawn(tree)).toContain('upload failed');
  const retry = pressableWith(tree, 'Retry voice upload');
  expect(retry.length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => retry[0]!.props.onPress());
  expect(retried).toEqual(['v-1']);
});
