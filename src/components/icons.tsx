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
