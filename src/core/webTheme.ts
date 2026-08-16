import type { Palette } from '../theme/palettes';

/**
 * Document-level styling a stylesheet can do and a React tree cannot: the cursor, hover states,
 * the focus ring, the scrollbars, the selection colour. A no-op on Android.
 */
export function applyWebTheme(_palette: Palette, _dark: boolean): void {
  // Android: there is no document.
}
