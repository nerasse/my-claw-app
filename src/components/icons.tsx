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

export function GearIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon
      {...props}
      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.31 7.31 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6A3.61 3.61 0 0 1 8.4 12c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
    />
  );
}
