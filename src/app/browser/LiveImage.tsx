import React, { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LiveFrame } from '../../core/browserLive';

/**
 * A tab's live picture. Each frame is a new image source, and an image drops what it showed while
 * it decodes the next one: swapping sources in place flickers at every frame. So the next picture
 * loads over the current one and replaces it only once it is drawn.
 */
export function LiveImage({
  frame,
  style,
  label,
}: {
  frame: LiveFrame | undefined;
  style?: StyleProp<ViewStyle>;
  label?: string;
}): React.JSX.Element {
  const [shown, setShown] = useState<string | undefined>(undefined);
  const next = frame && frame.uri !== shown ? frame : undefined;
  return (
    <View style={style} accessibilityLabel={label} pointerEvents="none">
      {shown ? <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} resizeMode="stretch" fadeDuration={0} /> : null}
      {next ? (
        <Image
          key={next.seq}
          source={{ uri: next.uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="stretch"
          fadeDuration={0}
          onLoad={() => setShown(next.uri)}
        />
      ) : null}
    </View>
  );
}
