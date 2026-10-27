import { useSyncExternalStore } from 'react';
import { DOC_SCALE_STEPS, prefs, stepDocScale } from './prefs';

/**
 * The zoom of the document readers, as one number shared by all of them.
 *
 * It lives in the prefs bag, so it survives a reload and reads the same in the `.md` viewer, the
 * skill reader and the system files page. The control that changes it sits in a reader's top bar,
 * several levels away from the sheet that reads it, which is why it travels through the store
 * rather than through props.
 *
 * Its own module rather than a corner of `DocumentMarkdown`: the zoom is a reading preference, not
 * a fact about markdown, and the control that drives it must not depend on the renderer.
 */
const subscribe = (listener: () => void): (() => void) => prefs.subscribe(listener);
const snapshot = (): number => prefs.get().docFontScale;

export function useDocFontScale(): number {
  return useSyncExternalStore(subscribe, snapshot);
}

export interface DocZoom {
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
}

export function useDocZoom(): DocZoom {
  const scale = useDocFontScale();
  const first = DOC_SCALE_STEPS[0];
  const last = DOC_SCALE_STEPS[DOC_SCALE_STEPS.length - 1];
  return {
    scale,
    canZoomIn: scale < last,
    canZoomOut: scale > first,
    zoomIn: () => prefs.set('docFontScale', stepDocScale(scale, 1)),
    zoomOut: () => prefs.set('docFontScale', stepDocScale(scale, -1)),
  };
}
