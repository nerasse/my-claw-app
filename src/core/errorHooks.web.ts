/// <reference lib="dom" />

export interface CrashReport {
  message: string;
  stack?: string;
}

/**
 * The browser's two ways of losing an error, both of which the port was ignoring.
 *
 * `ErrorUtils` is installed by React Native's InitializeCore, which react-native-web never runs:
 * the shared hook found nothing to hook and returned, so a crash in the tab was visible in the
 * devtools console and nowhere else. The server never heard about it, unlike every Android crash.
 *
 * The listeners only ever build a report; the browser still logs the error itself, so nothing is
 * swallowed here.
 */
export function installGlobalErrorHooks(report: (crash: CrashReport) => void): void {
  window.addEventListener('error', event => {
    const error = event.error as Error | undefined;
    report({
      message: `fatal: ${error?.message ?? event.message ?? 'unknown error'}`,
      ...(error?.stack ? { stack: error.stack } : { stack: `${event.filename}:${event.lineno}:${event.colno}` }),
    });
  });

  // A rejected promise nobody awaited is the most common way a web client breaks: a failed fetch
  // inside a handler, an aborted upload. It never reaches the error event.
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason as Error | string | undefined;
    const error = reason instanceof Error ? reason : undefined;
    report({
      message: `unhandled rejection: ${error?.message ?? String(reason ?? 'unknown')}`,
      ...(error?.stack ? { stack: error.stack } : {}),
    });
  });
}
