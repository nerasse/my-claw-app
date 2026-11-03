import React from 'react';
import Svg, { Path } from 'react-native-svg';

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
  color: string;
}

function Icon({ size = 20, color, d }: IconProps & { d: string }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d={d} />
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
  const angle = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <Svg width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24">
      <Path
        fill={props.color}
        d="M9.5 5.5 16 12l-6.5 6.5-1.7-1.7L12.6 12 7.8 7.2z"
        transform={`rotate(${angle} 12 12)`}
      />
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
