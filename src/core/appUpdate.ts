/**
 * The app's own updater: what the "Update app" card knows, as a state machine rather than as
 * booleans derived at render. Same shape as serverUpdate.ts: a reducer that makes the order of
 * events testable.
 *
 * The loop is: check the server's relaying endpoint (the server holds the Forgejo token, the
 * phone never does) → if the latest app release is newer than the running build → download the
 * APK through the same endpoint → install through Android's PackageInstaller (one system
 * confirmation, then the app restarts).
 */
export interface AppUpdateCheckResult {
  ok: boolean;
  version?: string;
  apkSize?: number;
  error?: string;
}

export type AppUpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; apkSize: number }
  | { kind: 'uptodate'; version: string }
  | { kind: 'downloading'; version: string; apkSize: number; progress: number }
  | { kind: 'ready'; version: string }
  | { kind: 'installing'; version: string }
  /** `staged` is the version sitting on disk, when one is: the tap installs it instead of downloading. */
  | { kind: 'error'; message: string; staged?: string };

export type AppUpdateEvent =
  | { type: 'checked'; result: AppUpdateCheckResult; current: string }
  | { type: 'downloadStarted'; version: string; apkSize: number }
  | { type: 'progress'; version: string; progress: number }
  | { type: 'downloadDone'; version: string }
  | { type: 'installStarted'; version: string }
  /** An APK found on disk at launch: the install can be offered without downloading again. */
  | { type: 'stagedFound'; version: string }
  /**
   * `staged` is what the device answered about the file, never what the UI assumed. An install
   * that failed because the APK was gone must send `false`, or the button offers Install for a
   * file that does not exist and every tap flashes back to the same screen.
   */
  | { type: 'failed'; message: string; staged: boolean };

export function reduceAppUpdate(phase: AppUpdatePhase, event: AppUpdateEvent): AppUpdatePhase {
  switch (event.type) {
    case 'checked': {
      // A check that lands while a transfer or an install is in flight must not reset it: the
      // four-hour tick would otherwise erase the `downloading` state mid-download, and the
      // `downloadDone` that follows would be dropped because the phase is no longer downloading.
      if (phase.kind === 'downloading' || phase.kind === 'ready' || phase.kind === 'installing') {
        return phase;
      }
      const { result, current } = event;
      if (!result.ok) return { kind: 'error', message: result.error ?? 'check failed' };
      const latest = result.version ?? '';
      if (!latest || compareVersions(latest, current) <= 0) {
        return { kind: 'uptodate', version: current };
      }
      // An APK that failed to install is still on disk: a later tick must not send the user back
      // to `available` (and re-download). Only the version the file actually carries qualifies;
      // a staged 0.6.4 against a published 0.6.5 has to download the new one.
      if (phase.kind === 'error' && phase.staged === latest) {
        return { kind: 'ready', version: latest };
      }
      return { kind: 'available', version: latest, apkSize: result.apkSize ?? 0 };
    }
    case 'downloadStarted':
      return { kind: 'downloading', version: event.version, apkSize: event.apkSize, progress: 0 };
    case 'progress':
      if (phase.kind !== 'downloading' || phase.version !== event.version) return phase;
      return { ...phase, progress: event.progress };
    case 'downloadDone':
      if (phase.kind !== 'downloading') return phase;
      // The APK is staged on disk. `ready` is what the install tap needs; it survives the
      // component remounting because the staging file does.
      return { kind: 'ready', version: event.version };
    case 'installStarted':
      // Installing replaces the running process; the next render (after reopen) compares again.
      return { kind: 'installing', version: event.version };
    case 'stagedFound':
      // Only from idle-ish states: a download in flight owns the phase, and a finished one has
      // already produced its own `ready`.
      if (phase.kind === 'downloading' || phase.kind === 'installing' || phase.kind === 'ready') return phase;
      return { kind: 'ready', version: event.version };
    case 'failed':
      // `staged` carries the version still on disk (empty when nothing is), so the next tap knows
      // whether it installs or downloads. It is measured, never inferred.
      return { kind: 'error', message: event.message, staged: event.staged ? versionOf(phase) : undefined };
  }
}

/** The version a phase is about, when it has one: what a failure hands back as `staged`. */
function versionOf(phase: AppUpdatePhase): string | undefined {
  switch (phase.kind) {
    case 'available':
    case 'downloading':
    case 'ready':
    case 'installing':
    case 'uptodate':
      return phase.version;
    case 'error':
      return phase.staged;
    default:
      return undefined;
  }
}

/**
 * Numeric semver comparison (major.minor.patch), tolerant of a leading `v` and of missing parts
 * ("0.5" == "0.5.0"). Our whole release pipeline stamps versionName = tag, so this is enough.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

function parse(v: string): number[] {
  return String(v)
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .filter(n => !Number.isNaN(n));
}

/** Human label for the card button, mirroring serverUpdate's phrasing. */
export function appUpdateLabel(phase: AppUpdatePhase): string {
  switch (phase.kind) {
    case 'available':
    case 'ready':
      return 'Install update';
    case 'downloading':
      return 'Downloading…';
    case 'installing':
      return 'Installing…';
    case 'checking':
      return 'Checking…';
    default:
      return 'Check for update';
  }
}

export function appUpdateHint(phase: AppUpdatePhase, connected: boolean): string {
  switch (phase.kind) {
    case 'idle':
      return connected
        ? 'the app updates itself from the server, like the server updates itself'
        : 'connect to the server to check for an app update';
    case 'checking':
      return 'asking the server…';
    case 'available':
      return `${phase.version} is available (${formatMb(phase.apkSize)}) · you will confirm once on the system screen`;
    case 'uptodate':
      return `you are on ${phase.version}, the latest`;
    case 'downloading':
      return `downloading ${phase.version} · ${Math.round(phase.progress * 100)}%`;
    case 'ready':
      return `${phase.version} is downloaded · tap to install, the app will restart`;
    case 'installing':
      return `installing ${phase.version} · the app will close and come back`;
    case 'error':
      return phase.message;
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
