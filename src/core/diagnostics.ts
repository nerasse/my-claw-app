import { connection } from './connection';
import { deviceBridge } from './nativeBridge';
import { encodeDiagReport, type DiagReport } from './protocol';
import { installGlobalErrorHooks } from './errorHooks';

/**
 * Crash reporting without a third-party SDK and without adb.
 *
 * The two constraints that shape this: the phone is not always on a network where adb can reach
 * it, and logcat is a ring buffer that forgets. So a report is written to SharedPreferences the
 * moment it happens (it must survive the process death that is about to follow), and shipped on
 * the next connection. Only an acknowledged report is dropped.
 */

const PENDING_KEY = 'diagPending';
const LAST_EXIT_KEY = 'diagLastExitAt';
/** Bounded: a crash loop offline must not grow the prefs file without limit. */
const MAX_PENDING = 20;
const MAX_STACK = 8000;

/**
 * Exit reasons worth reporting. A normal `USER_REQUESTED` or `USER_STOPPED` is the user closing
 * the app, and `DEPENDENCY_DIED` follows another process going away: reporting those would bury
 * the real crashes under noise.
 */
const ABNORMAL_EXITS = new Set([
  'CRASH',
  'CRASH_NATIVE',
  'ANR',
  'LOW_MEMORY',
  'EXCESSIVE_RESOURCE_USAGE',
  'SIGNALED',
]);

let pending: DiagReport[] = [];
let loaded = false;

async function persist(): Promise<void> {
  try {
    await deviceBridge.prefsSet(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Nothing better to do: the report is already in memory and will be retried next boot.
  }
}

export function recordDiag(report: DiagReport): void {
  pending.push({
    ...report,
    message: report.message.slice(0, 2000),
    ...(report.stack ? { stack: report.stack.slice(0, MAX_STACK) } : {}),
  });
  if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
  persist().catch(() => {});
}

/**
 * Android's own post-mortem of previous process deaths. This is the only way to tell a crash
 * from an ANR, an OOM kill, or the battery optimiser stopping the foreground service — four
 * causes that all look identical from the outside. `since` dedupes across boots: the same exit
 * stays in Android's history for several launches.
 */
async function collectExits(since: number): Promise<void> {
  const info = await deviceBridge.getExitInfo().catch(() => undefined);
  if (!info) return;
  let newest = since;
  for (const exit of info.exits) {
    if (exit.at <= since) continue;
    newest = Math.max(newest, exit.at);
    if (!ABNORMAL_EXITS.has(exit.reason)) continue;
    recordDiag({
      kind: 'exit',
      at: exit.at,
      message: exit.description ? `process exit: ${exit.reason} (${exit.description})` : `process exit: ${exit.reason}`,
      reason: exit.reason,
      appVersion: info.versionName,
    });
  }
  if (newest > since) {
    try {
      await deviceBridge.prefsSet(LAST_EXIT_KEY, String(newest));
    } catch {
      // Worst case the same exit is reported twice; losing it would be worse.
    }
  }
}

/** Reads what the previous process left behind. Once, at boot, before the first connect. */
export async function loadDiagnostics(): Promise<void> {
  if (loaded) return;
  loaded = true;
  let lastExit = 0;
  try {
    const raw = await deviceBridge.prefsGetAll();
    const stored = raw[PENDING_KEY];
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) pending = (parsed as DiagReport[]).slice(-MAX_PENDING);
    }
    lastExit = Number(raw[LAST_EXIT_KEY] ?? 0) || 0;
  } catch {
    // A malformed store must not keep the app from booting.
  }
  await collectExits(lastExit);
}

export function flushDiagnostics(): void {
  if (pending.length === 0) return;
  connection.send(encodeDiagReport(pending)).catch(() => {});
}

/** Drops the reports the server took, in order: the frame is sent oldest-first. */
export function acknowledgeDiagnostics(accepted: number): void {
  if (accepted <= 0) return;
  pending = pending.slice(accepted);
  persist().catch(() => {});
}

/**
 * Installs the platform's last-resort error hook. What that hook is differs (RN's `ErrorUtils`,
 * the browser's error and unhandledrejection events), which is why it lives in `errorHooks`.
 */
export function installDiagnostics(): void {
  // A frame handler that throws is caught by the connection rather than left to reach the native
  // callback and kill the process; this is what keeps the throw from disappearing with it.
  connection.setListenerErrorReporter((error, label) => {
    recordDiag({
      kind: 'js',
      at: Date.now(),
      message: `frame listener threw on ${label}: ${error.message}`,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  });
  installGlobalErrorHooks(crash => {
    recordDiag({
      kind: 'js',
      at: Date.now(),
      message: crash.message,
      ...(crash.stack ? { stack: crash.stack } : {}),
    });
  });
}

/** Test seam: module state is shared across the whole app, so it has to be resettable. */
export function resetDiagnosticsForTest(): void {
  pending = [];
  loaded = false;
}
