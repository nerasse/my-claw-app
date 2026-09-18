import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import type { DeviceInfo } from '../core/device';
import { mediaUrl } from '../core/mediaUrl';
import type { AttachmentMeta } from '../core/protocol';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * Pictures and videos in the thread: one at a time when there are several, at their own shape.
 *
 * The stage used to be a fixed 190x190 square with `contain`, so a wide browser capture -- the
 * case that made this necessary -- was drawn 190x77 inside its own box: two thirds of the height
 * was the empty band the owner kept scrolling past, and the file name hung at the bottom of it.
 * Five captures of one run cost five of those boxes and five truncated names (owner, 2026-09-17).
 *
 * A run of several pictures is now a carousel: the picture's own ratio decides the height (clamped
 * so neither a 3:1 capture nor a tall page can own the screen), the arrows step through them where
 * they sit, and the name under the stage follows the one on it. Tapping any of them opens the
 * full-screen gallery at that index. Owner's decisions: carousel with previous/next, real ratio
 * for a lone picture, a name under each one, and a swipeable gallery behind the tap.
 */

/** One picture (or the poster of a video) on its way to the viewer. */
export interface MediaItem {
  url: string;
  filename: string;
  sizeBytes?: number;
  /** A video: what to draw in the thread is its poster, and a badge says so. */
  poster?: string;
  video?: boolean;
}

/** How tall a lone picture may get in the thread, and how short. */
export const MEDIA_MAX_HEIGHT = 360;
export const MEDIA_MIN_HEIGHT = 140;
/** The carousel is tighter: its job is to give the thread back to the conversation. */
export const CAROUSEL_MAX_HEIGHT = 240;

const FALLBACK_RATIO = 16 / 9;

/**
 * An image's own width/height ratio, read from the bytes before it is drawn.
 *
 * `Image.getSize` reads the header, so the box is the picture's shape from the first frame instead
 * of a square that reflows once the image lands. A failure (a 404, an unsupported format) leaves
 * the fallback in place: the load itself reports what matters.
 */
export function useMediaRatio(uri: string | undefined): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    setRatio(null);
    if (!uri || typeof Image.getSize !== 'function') return;
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) setRatio(width / height);
      },
      () => {
        // Nothing to read; the fallback stands.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return ratio;
}

/** The height a media box takes for a ratio: full width, clamped at both ends. */
export function mediaHeight(width: number, ratio: number | null, max = MEDIA_MAX_HEIGHT): number {
  if (width <= 0) return MEDIA_MIN_HEIGHT;
  const height = width / (ratio ?? FALLBACK_RATIO);
  return Math.round(Math.min(Math.max(height, MEDIA_MIN_HEIGHT), max));
}

/** The carousel's items, in the order the attachments arrived, videos carrying their poster. */
export function mediaItemsOf(
  attachments: AttachmentMeta[],
  mediaBase: string,
  deviceInfo: DeviceInfo | null,
): MediaItem[] {
  const items: MediaItem[] = [];
  for (const att of attachments) {
    const remote = mediaUrl(mediaBase, deviceInfo, att.id);
    const url = att.uri ?? remote;
    if (!url || att.deleted) continue;
    if (att.type === 'image') {
      items.push({ url, filename: att.filename ?? 'image', sizeBytes: att.sizeBytes });
    } else if (att.type === 'video') {
      items.push({
        url,
        filename: att.filename ?? 'video',
        sizeBytes: att.sizeBytes,
        // The server generates a preview frame per id, cached after the first fetch.
        poster: remote ? mediaUrl(mediaBase, deviceInfo, att.id, { thumb: '1' }) : undefined,
        video: true,
      });
    }
  }
  return items;
}

/** Whether an attachment belongs in a media run rather than on its own as a chip. */
export function isCarouselMedia(att: AttachmentMeta): boolean {
  return (att.type === 'image' || att.type === 'video') && !att.deleted;
}

export function MediaCarousel({
  items,
  onOpen,
}: {
  items: MediaItem[];
  /** Opens the full-screen gallery at that index: the pictures are all one visit. */
  onOpen: (index: number) => void;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const current = items[Math.min(index, items.length - 1)];
  const ratio = useMediaRatio(current?.poster ?? current?.url);
  const height = mediaHeight(width, ratio, CAROUSEL_MAX_HEIGHT);
  if (!current) return null;

  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const step = (by: number): void => setIndex(i => Math.max(0, Math.min(items.length - 1, i + by)));
  const many = items.length > 1;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <Pressable
        style={[styles.stage, { height }]}
        onPress={() => onOpen(index)}
        accessibilityRole="button"
        accessibilityLabel={`Open attachment ${current.filename}`}
        accessibilityValue={many ? { text: `${index + 1} of ${items.length}` } : undefined}
      >
        <Image
          source={{ uri: current.poster ?? current.url }}
          style={styles.media}
          resizeMode={current.poster ? 'cover' : 'contain'}
          accessibilityLabel={current.filename}
        />
        {current.video ? (
          <View style={styles.play} pointerEvents="none">
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        ) : null}
        {many ? (
          <>
            <Pressable
              style={[styles.arrow, styles.arrowLeft, index === 0 ? styles.arrowOff : null]}
              onPress={() => step(-1)}
              disabled={index === 0}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous image"
            >
              <Text style={styles.arrowGlyph}>‹</Text>
            </Pressable>
            <Pressable
              style={[styles.arrow, styles.arrowRight, index === items.length - 1 ? styles.arrowOff : null]}
              onPress={() => step(1)}
              disabled={index === items.length - 1}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next image"
            >
              <Text style={styles.arrowGlyph}>›</Text>
            </Pressable>
            <View style={styles.counter} pointerEvents="none">
              <Text style={styles.counterText}>{`${index + 1}/${items.length}`}</Text>
            </View>
          </>
        ) : null}
      </Pressable>
      <Text style={styles.caption} numberOfLines={1}>
        {current.filename}
      </Text>
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  wrap: { alignSelf: 'stretch' as const, marginBottom: space.xs },
  stage: {
    width: '100%' as const,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  media: { width: '100%' as const, height: '100%' as const },
  play: {
    position: 'absolute' as const,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  playGlyph: { color: '#fff', fontSize: scaleFont(font.title, scale), marginLeft: 4 },
  arrow: {
    position: 'absolute' as const,
    top: '50%' as const,
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  arrowLeft: { left: space.sm },
  arrowRight: { right: space.sm },
  arrowOff: { opacity: 0.25 },
  arrowGlyph: { color: '#fff', fontSize: scaleFont(font.title, scale), lineHeight: scaleFont(font.title, scale) + 2 },
  counter: {
    position: 'absolute' as const,
    right: space.sm,
    top: space.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  counterText: { color: '#fff', fontSize: scaleFont(font.small, scale) },
  caption: {
    fontSize: scaleFont(font.small, scale),
    color: palette.textFaint,
    marginTop: 2,
  },
});
