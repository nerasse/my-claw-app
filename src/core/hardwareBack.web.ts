/**
 * There is no hardware back key in a browser. The Back button is handled by `route.web.ts` and
 * Escape by the shortcut map, so this registers nothing at all: react-native-web's BackHandler
 * only exists to print "BackHandler is not supported on web" into the console.
 */
export function useHardwareBack(_handler: () => boolean): void {}
