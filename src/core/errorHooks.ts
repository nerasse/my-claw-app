/** What the hooks report: the same shape `recordDiag` takes for a `js` report. */
export interface CrashReport {
  message: string;
  stack?: string;
}

/** RN installs this on the global object; it is not in the typings. */
interface GlobalErrorUtils {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
}

/**
 * The last-resort error hook of the platform.
 *
 * Android has `ErrorUtils`, which the browser does not: react-native-web never runs RN's
 * InitializeCore, so the hook silently installed nothing there and a crashed tab reported
 * exactly nothing. The web counterpart of this file listens to the document instead.
 *
 * Chains rather than replaces: RN's own handler is what shows the red box in debug, and losing
 * it would make a fatal error harder to see, not easier.
 */
export function installGlobalErrorHooks(report: (crash: CrashReport) => void): void {
  const utils = (globalThis as unknown as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    report({
      message: `${isFatal ? 'fatal: ' : ''}${error?.message ?? String(error)}`,
      ...(error?.stack ? { stack: error.stack } : {}),
    });
    previous?.(error, isFatal);
  });
}
