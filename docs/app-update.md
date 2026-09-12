# Updating the app from the app

The phone replaces itself with a 45 MB APK it downloads through the server relay, so the Forgejo
token never reaches the device. Four steps, and only the last one is the system's:

```
GET /app-update          → is there a newer version? (server compares, we do not)
GET /app-update/apk      → OkHttp streams it into filesDir/update-staged.apk
verify                   → the archive is this app, moves forward, signed by a key we trust
commit                   → PackageInstaller opens its own confirmation screen
```

## The staged file

`filesDir`, not `cacheDir`: the system reclaims the cache under disk pressure, and a download that
vanishes between "ready" and the install tap is what turned Install into a button that flashed and
did nothing. The version travels beside it (`update-staged.version`) because a staged file that
cannot say what it carries forces the UI to guess, and guessing is what looped.

`stagedApkInfo` asks the disk rather than remembering: the UI only ever offers Install for a file
that is there now.

## Verification

`rejectionReason` refuses anything that is not this package, is not a higher `versionCode`, or was
not signed by a key this install already trusts. Before it existed the only checks were the `PK`
magic and a size the same server announced, so whoever answered the relay got their APK past a
system dialog that says nothing alarming when the signature matches.

## Everything runs off the UI thread

`installStagedApk` verifies **and** commits on a single worker thread (`installWorker`), never on
the main thread. Both halves are expensive: `getPackageArchiveInfo` parses the whole 45 MB archive
and `session.openWrite` + `copyTo` + `fsync` copy it into the session. On the main thread the app
froze at "100% of 45.7 MB" -- the JS had already asked for the install, but a blocked UI thread
cannot redraw -- and the install only appeared after the owner had left and come back. Reported
2026-09-12, `mainHandler.post` until then.

PackageInstaller accepts a call from any thread. Nothing here needs the main one.

## No `canRequestPackageInstalls()` gate

That value is cached per process: after the owner grants the permission and comes back it can still
read false, and the install we refuse is one the system would have accepted. Android's own
behaviour covers the missing permission -- the package installer shows a dialog with a link to the
settings -- so the code commits and treats only a `SecurityException` as a refusal.

## Back with the result

The outcome arrives on `claw:update:install` (`InstallResultReceiver`), and at cold start the
receiver parks it until `drainInstallResult()` runs, once the status listener is subscribed. The
promise from `installStagedApk` resolves when the session is committed, not when the install
finishes: the process is about to be replaced, so only the reopen matters.
