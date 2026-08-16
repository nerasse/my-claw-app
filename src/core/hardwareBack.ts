import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Android's back key. The browser has no such key, and react-native-web's BackHandler answers a
 * registration with a console error, so the web counterpart of this file registers nothing: the
 * same job is done there by `watchBack` (the Back button) and by the Escape shortcut.
 */
export function useHardwareBack(handler: () => boolean): void {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [handler]);
}
