import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Chrome icons, drawn as vectors.
 *
 * They used to be text glyphs -- `＋`, `🗂`, `🗑`. Text carries font metrics: a fullwidth plus
 * sits off-centre in its em box, and colour emoji come from a fallback font tall enough to be
 * clipped by any line box tuned for Latin text. Both showed up as the same class of bug, an icon
 * a few pixels off or cut in half. A path has no metrics to disagree with, so it lands exactly
 * where the box centres it, at any size, on any device.
 */

interface IconProps {
  size?: number;
  /** A literal colour, for an icon drawn over a picture. Prefer `tone` everywhere else. */
  color?: string;
  /** Which ink of the theme to draw with. Resolved here, so no page needs the palette in scope. */
  tone?: 'text' | 'muted' | 'faint' | 'accent' | 'danger';
}

/**
 * The ink an icon takes: a role of the theme, or a literal when it sits over a photograph.
 *
 * A role rather than a colour because a page with a dozen rows would otherwise each need the
 * palette in scope to draw a chevron, and the two together drift: the pass that replaced the text
 * glyphs lightened every back arrow and darkened every row chevron that way.
 */
function useInk(color: string | undefined, tone: IconProps['tone']): string {
  const { palette } = useTheme();
  if (color) return color;
  if (tone === 'text') return palette.text;
  if (tone === 'accent') return palette.accent;
  if (tone === 'danger') return palette.danger;
  if (tone === 'muted') return palette.textMuted;
  return palette.textFaint;
}

function Icon({ size = 20, color, tone, d }: IconProps & { d: string }): React.JSX.Element {
  const ink = useInk(color, tone);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={ink} d={d} />
    </Svg>
  );
}

export function PlusIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />;
}

export function SendIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />;
}

export function MicIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"
    />
  );
}

export function TrashIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props} d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />
  );
}

export function FolderIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z" />;
}

export function PlayPauseIcon({
  playing,
  ...props
}: IconProps & { playing: boolean }): React.JSX.Element {
  return <Icon {...props} d={playing ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z'} />;
}

export function DownloadIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />;
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />;
}

/** Two sheets, one behind the other: the whole document goes to the clipboard. */
export function CopyIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M8 3h9a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z"
    />
  );
}

/** The funnel: three rules narrowing to a point, the shape everyone reads as "narrow this list". */
export function FilterIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z" />;
}

/** A magnifier: the one mark a search field wears. */
export function SearchIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
    />
  );
}

/** A folder with a plus: the one thing that says "make one of these" without a word. */
export function NewFolderIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3z"
    />
  );
}

export function GearIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.31 7.31 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6A3.61 3.61 0 0 1 8.4 12c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
    />
  );
}

/**
 * A window with its left column: the conversation list, folded or unfolded. Drawn as a frame with
 * two holes (each traced against the frame's direction, so the nonzero fill leaves them empty).
 */
export function SidebarIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M3 3H21V21H3Z M5 5V19H9V5Z M11 5V19H19V5Z" />;
}

/** A cross: leave the whole stack of pages, not one level of it. */
export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props} d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z" />
  );
}

/** Four corners pointing out: the page takes the whole window. */
export function ExpandIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z" />;
}

/** Four corners pointing in: back to the columns. */
export function CollapseIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M8 5h2v5H5V8h3zm6 0h2v3h3v2h-5zM5 14h5v5H8v-3H5zm9 0h5v2h-3v3h-2z" />;
}

/** A box with an arrow leaving it: opens in a tab of its own. */
export function OpenInNewIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
    />
  );
}

/** The circular arrow: ask again. */
export function RefreshIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"
    />
  );
}

/** A letterform A over a larger one: the reader's text grows. */
export function ZoomInIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M9 3a6 6 0 1 0 3.32 11L19 20.68 20.68 19l-6.6-6.6A6 6 0 0 0 9 3zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1 1.5h2V9h2.5v2H10v2.5H8V11H5.5V9H8z"
    />
  );
}

/** The same glass with a bar where the plus was: it shrinks. */
export function ZoomOutIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M9 3a6 6 0 1 0 3.32 11L19 20.68 20.68 19l-6.6-6.6A6 6 0 0 0 9 3zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM5.5 9h7v2h-7z"
    />
  );
}

/** Three rules: the conversation list, folded away. */
export function MenuIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M4 6h16v2H4zm0 5h16v2H4zm0 5h11v2H4z" />;
}

/**
 * The overflow affordance, in both directions: a row of dots under a message, a column of them
 * in a title bar. One component with a flag rather than two near-identical paths.
 */
export function MoreIcon({ vertical = false, ...props }: IconProps & { vertical?: boolean }): React.JSX.Element {
  const dots = vertical ? 'M12 5.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm0 4.9a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm0 4.9a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z' : 'M5.5 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0zm5.65 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0zm5.65 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0z';
  return <Icon {...props} d={dots} />;
}

/** A chevron, pointing where the fold will go. Rotation, so one path serves all four. */
export function ChevronIcon({
  direction = 'right',
  ...props
}: IconProps & { direction?: 'up' | 'down' | 'left' | 'right' }): React.JSX.Element {
  const ink = useInk(props.color, props.tone);
  const angle = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <Svg width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24">
      <Path
        fill={ink}
        d="M9.5 5.5 16 12l-6.5 6.5-1.7-1.7L12.6 12 7.8 7.2z"
        transform={`rotate(${angle} 12 12)`}
      />
    </Svg>
  );
}

/**
 * A solid arrow, up or down.
 *
 * Filled rather than stroked: at the 16-18 px a chrome control asks for, a stroked chevron reads
 * as a hairline and the control around it as a placeholder (owner, 2026-11-07). One shape for both
 * directions, turned.
 */
export function ArrowIcon({
  direction = 'down',
  ...props
}: IconProps & { direction?: 'up' | 'down' }): React.JSX.Element {
  const ink = useInk(props.color, props.tone);
  const d = 'M12 3.6 19.2 10.8h-4.5v9.6H9.3v-9.6H4.8z';
  return (
    <Svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24">
      <Path fill={ink} d={d} transform={direction === 'down' ? 'rotate(180 12 12)' : undefined} />
    </Svg>
  );
}

/** A square: the run in flight, stopped. */
export function StopIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M7 7h10v10H7z" />;
}

/**
 * The sub-agent mark: a small head with two eyes, the shape the POC used for it. It sits where a
 * bullet would, so it is drawn on the same 24-box as everything else and asked for at 13-16.
 */
export function AgentIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props} d="M4.5 8.5A2.5 2.5 0 0 1 7 6h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 18H7a2.5 2.5 0 0 1-2.5-2.5zM9 10.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm6 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM9.5 4h5v1.6h-5z" />
  );
}

/** A pencil: this row can be renamed. Nothing else in the chrome edits a name in place. */
export function PencilIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props} d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z" />
  );
}

/**
 * The marks a sheet's verbs wear.
 *
 * Filled paths on the same 24-box as everything else, asked for at 15: a menu row is read at a
 * glance down its left edge, so each one has to be a different silhouette, not a different
 * stroke width. `Target` is a move into a folder, `Download` onto a line, `Link` two chain halves,
 * `Info` a ring, `Gauge` a dial, `List` three rules.
 */
export function MoveIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8zm-2 9h3v-2h2v2h3l-4 4z" />;
}

export function LinkIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M3.9 12A3.1 3.1 0 0 1 7 8.9h3V7H7a5 5 0 0 0 0 10h3v-1.9H7A3.1 3.1 0 0 1 3.9 12M8 13h8v-2H8zm9-6h-3v1.9h3a3.1 3.1 0 0 1 0 6.2h-3V17h3a5 5 0 0 0 0-10"
    />
  );
}

export function InfoIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 15h-2v-6h2zm0-8h-2V7h2z"
    />
  );
}

/** A dial: how full the window is, at a glance. */
export function GaugeIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M12 4a9 9 0 0 0-7.4 14.1l1.5-1.2A7 7 0 1 1 19 12h2a9 9 0 0 0-9-8m1 2h-2v6.3a1.8 1.8 0 1 0 2 0zm5.4 3.3-1.6 1.2a7 7 0 0 1 .2 1.5h2a9 9 0 0 0-.6-2.7"
    />
  );
}

/** Two overlapping leaves: what a run wrote to disk. */
export function FilesIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M14 2H6a2 2 0 0 0-2 2v12h2V4h8zm4 4H10a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2m0 14h-8V8h8z"
    />
  );
}

/**
 * The picker glyph the menu's Model… row and the title bar's model button share: two sliders.
 *
 * Drawn because the row had none while its neighbours did, and a sheet with four icons and seven
 * bare labels reads as a list that lost half its entries (owner, 2026-11-04: "tu as pas mis des
 * icons pour toutes options et ça fait très moche"). Where an action already has a mark elsewhere in
 * the chrome, it wears the same one here: a menu is read down its left edge.
 *
 * The two rules are **rectangles**, not the two line segments they were: this icon set fills its
 * paths, and an `h7.2` segment has no area to fill, so only the two knobs ever came out -- the
 * title bar's model button drew as a pair of stray dots for a day (owner's screenshot, 2026-11-04).
 * A stroke would need its own renderer; a 1.8 tall rect is the same shape with area.
 */
export function SlidersIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M4 6.6h7v1.8H4zM15.4 6.6H20v1.8h-4.6zM4 15.6h3.4v1.8H4zM11.6 15.6H20v1.8h-8.4zM13.3 5.3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm-3.8 9a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z"
    />
  );
}

/** A folder with an arrow into it: moving a conversation, not opening one. */
export function MoveToFolderIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8zm1.5 4.5L16 12l-4.5 3.5v-2.3H7.5v-2.4h4z"
    />
  );
}

/** A clock with a returning arrow: a quota that comes back on its own. */
export function WaitResetIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M12 4a8 8 0 1 0 7.4 11h-2.2A6 6 0 1 1 12 6c1.5 0 2.9.55 3.95 1.46L13 10.5h7V3.5l-2.5 2.5A7.96 7.96 0 0 0 12 4m-1 3h2v5.4l3.4 2-1 1.7-4.4-2.6z"
    />
  );
}

/** Pipes that meet at one point: what Siphon does to a conversation's traffic. */
export function SiphonIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M3 5h5.2c2.6 0 4.3 1.6 5.5 4.2.9 2 1.8 3.3 3.6 3.3H20v2h-2.7c-2.9 0-4.4-2.2-5.5-4.6C10.8 7.8 9.7 7 8.2 7H3zm0 10h5.2c1 0 1.8-.3 2.5-.9l1.3 1.6c-1 .9-2.3 1.3-3.8 1.3H3zm14.2-3.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z"
    />
  );
}

/**
 * The marks the attachment and file sheets were missing.
 *
 * Same 24-box, same fill, asked for at 15 like every other menu glyph: a sheet is read down its
 * left edge, so each of these has to be a different silhouette rather than a different weight.
 * `Image` is a frame with a horizon, `Camera` a body with a lens, `Pin` a drop with a hole,
 * `Map` a folded sheet with a road, `Paste` a clipboard taking something in.
 */
export function ImageIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 2v9.6l3.6-3.6 3 3 4.4-4.4 4 4V6zm4 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6"
    />
  );
}

export function CameraIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M9 3h6l1.6 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.4zM12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6"
    />
  );
}

/** Where something is: a drop with a hole in it. */
export function PinIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7m0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5"
    />
  );
}

/** A folded sheet with a road on it: opening the position somewhere else. */
export function MapIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M9 2 3 4.5v18L9 20l6 2.5 6-2.5v-18L15 4.5zM8 4.8l8 3.2v11.2l-8-3.2zm2 4.4v1.8c1.6 0 2.6.7 3.2 1.7l1.5-1c-.9-1.5-2.5-2.5-4.7-2.5m0 4.2v1.8c.7 0 1.1.3 1.4.8l1.5-.9c-.6-1-1.6-1.7-2.9-1.7"
    />
  );
}

/** A clipboard taking something in: pasting what is already on it. */
export function PasteIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M9 2h6v2h2a2 2 0 0 1 2 2v3h-2V6H7v14h10v-3h2v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm9 8.5L22 14l-4 3.5v-2.2h-5v-2.6h5z"
    />
  );
}

/**
 * The marks that tell two neighbours apart, taken from the vocabulary a coding agent's own UI
 * uses: a calendar for what runs on a schedule, bars for a reading over time, a sheet of text for
 * written instructions, a box for something filed away, an eraser for a memory let go.
 *
 * These exist because the first pass reused whatever was to hand: Jobs and Statistics both wore
 * the gauge, Instructions and Copy transcript both wore the copy mark. Two different things with
 * one silhouette is worse than no icon at all -- the left edge stops being readable and becomes
 * decoration (owner, 2026-11-04: "choisis des icônes pertinents, comme les icônes d'un Claude Code,
 * d'un Codex ou d'un Open Code").
 */
export function CalendarIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M7 2v2h10V2h2v2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V2zm13 8H4v10h16zM6 12h3v3H6z"
    />
  );
}

/** Three bars on a baseline: a figure read over time, not a dial read now. */
export function ChartIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props} d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7zM2 21h20v2H2z" />;
}

/** A page of text: what was written down, as opposed to what was copied out of it. */
export function DocIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 2.8L17.2 9H13zM7 12h10v2H7zm0 4h10v2H7zm0-8h4v2H7z"
    />
  );
}

/** A lidded box: filed away, still there, out of the list. */
export function ArchiveIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M3 3h18v4H3zm1 6h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm5 3v2h6v-2z"
    />
  );
}

/** An eraser held at an angle: a thing removed, and the surface left clean behind it. */
export function EraserIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M15.1 3.5a2 2 0 0 1 2.8 0l2.6 2.6a2 2 0 0 1 0 2.8l-7.6 7.6H21v2H8.6l-3.7-3.7a2 2 0 0 1 0-2.8zM9 12.2 5.8 15.4l2.8 2.8H12z"
    />
  );
}

/**
 * The three marks the message menu adds beside the copy frame.
 *
 * A menu is read down its left edge, so these had to differ in **silhouette** rather than in
 * detail: at 15 px a rule inside a sheet is a smudge, and the first attempts (a bubble of dots, a
 * sheet with lines) either vanished or duplicated a mark already spent on another thing. So the
 * pair of copy rows is one family told apart by weight, `Copy text` hollow and
 * `Copy with thinking` filled, while the two asides take shapes of their own.
 *
 * `SparkIcon` is what a thought looks like, and nothing else in the chrome is a star.
 * `DigestIcon` is a page with one solid band: the document reduced to its gist, distinct from
 * `DocIcon`, which is a page of writing that was kept whole.
 */
export function SparkIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M12 2c.6 5 2.4 6.8 7.4 7.4-5 .6-6.8 2.4-7.4 7.4-.6-5-2.4-6.8-7.4-7.4C9.6 8.8 11.4 7 12 2zM18.5 15c.3 2.2 1 2.9 3.2 3.2-2.2.3-2.9 1-3.2 3.2-.3-2.2-1-2.9-3.2-3.2 2.2-.3 2.9-1 3.2-3.2z"
    />
  );
}

/** The copy frame, filled: the same page as `CopyIcon`, with its reasoning included. */
export function CopyAllIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M8 3h9a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
    />
  );
}

/** A page cut down to one band: what a compaction kept. */
export function DigestIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M6 2h8l6 6v14H6zm2 2v16h10V9h-4V4zm0 8h8v3H8z"
    />
  );
}
