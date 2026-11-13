import React from 'react';
import { AttachmentView } from './AttachmentView';
import { MediaCarousel, isCarouselMedia, mediaItemsOf, type MediaItem } from './MediaCarousel';
import type { AttachmentMeta } from '../core/protocol';
import type { DeviceInfo } from '../core/device';
import type { FileKind } from '../core/fileKind';
import type { ViewerKind } from '../core/utils';

/**
 * Everything one item carries as files, in the order it carried them.
 *
 * Extracted from Bubble because a background sub-agent's return carries files too -- a browser
 * task brings its screenshots back -- and the rule for drawing them (consecutive pictures become
 * one carousel, everything else keeps its own row, a run is only grouped when every attachment of
 * it can actually be drawn) has to be the same in both places. A second copy of it in a second
 * component is how the two would drift.
 */
export function AttachmentList({
  attachments,
  transcripts,
  mediaBase,
  deviceInfo,
  onOpen,
  onOpenMedia,
  onAccent,
}: {
  attachments: readonly AttachmentMeta[];
  /** What the server heard, per recording id: a voice note's words live beside its file. */
  transcripts?: Record<string, string>;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  onOpen?: (
    kind: ViewerKind,
    target: { url: string; filename: string; sizeBytes?: number; kind?: FileKind },
  ) => void;
  /** A run of pictures opens as one gallery, at the index that was tapped. */
  onOpenMedia?: (items: MediaItem[], index: number) => void;
  /** Drawn on the owner's own bubble: the fill is theirs, so the chips have to read on it. */
  onAccent?: boolean;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  const rows: React.JSX.Element[] = [];
  let run: AttachmentMeta[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const items = mediaItemsOf(run, mediaBase, deviceInfo);
    if (items.length > 1 && items.length === run.length) {
      rows.push(<MediaCarousel key={`carousel-${run[0]!.id}`} items={items} onOpen={index => onOpenMedia?.(items, index)} />);
    } else {
      for (const att of run) rows.push(single(att, rows.length));
    }
    run = [];
  };
  const single = (att: AttachmentMeta, key: number): React.JSX.Element => (
    <AttachmentView
      key={`${att.id}-${key}`}
      att={att}
      mediaBase={mediaBase}
      deviceInfo={deviceInfo}
      {...(onOpen ? { onOpen } : {})}
      transcript={transcripts?.[att.id]}
      onAccent={onAccent === true}
    />
  );
  for (const att of attachments) {
    if (isCarouselMedia(att)) run.push(att);
    else {
      flush();
      rows.push(single(att, rows.length));
    }
  }
  flush();
  return <>{rows}</>;
}
