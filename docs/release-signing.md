# Signing a release

## What was wrong

Every APK ever published was signed with `android/app/debug.keystore`: the React Native template's
key, `CN=Android Debug`, password `android`, committed to this repository and shipped inside every
copy of the framework. Its private half is public knowledge, fingerprint
`fa:c6:17:45:dc:09:03:78:6f:b9:ed:e6:2a:96:2b:39:9f:73:48:f0:bb:6f:89:9b:83:32:66:75:91:03:3b:9c`.

On its own that is bad hygiene. Next to the updater it was a way in. `installStagedApk` checked
the `PK` magic and a size the server had just announced, and nothing else, while the app downloads
its own update automatically on Wi-Fi and then shows a modal offering to install it. Whoever
answered `GET /app-update` -- a compromised server, a hostile network, anyone who reached the
release registry -- could sign an APK with the public debug key and hand it over. Android's own
dialog says nothing alarming when the signature matches the installed app, because as far as the
platform is concerned it *is* the same developer.

## What replaced it

A real key, rotated so the change costs nothing on an installed phone.

- **Key**: RSA 4096, PKCS12, 30 years, `CN=my-claw-app, O=Kssimi Claw, C=FR`, alias `my-claw-app`,
  fingerprint `c4:e3:1e:e2:aa:2b:08:bc:a8:a0:09:94:6a:1e:06:13:27:64:02:95:b6:77:04:96:3c:df:09:5f:b1:38:82:e5`.
- **Where it lives**: `~/.my-claw/secrets/my-claw-app-release.jks`, mode 600, in a 700 directory.
  Never in this repository.
- **Where it is backed up**: Vaultwarden, item `my-claw-app release keystore` (org and collection
  of the `vaultwarden` skill). The password is the item's password, the `.jks` is an attachment.
  The restore was tested rather than assumed: the attachment was downloaded, compared byte for
  byte with the local file, and opened with the item's password.
- **Losing both copies means no device can ever be updated again.** The only way out is
  uninstall-and-reinstall on every phone, which drops its pairing and its local settings.

### The lineage

`android/app/signing/lineage.bin` proves the release key succeeds the debug key. It holds public
material only, so it is committed.

```
Signer #1  CN=Android Debug   rollback: false
Signer #2  CN=my-claw-app     rollback: false
```

`rollback: false` on the old signer is the line that matters: the debug key is public, and it can
never be used to install over an app that has moved to the new one.

Regenerated only if the key is ever rotated again:

```sh
apksigner rotate --out android/app/signing/lineage.bin \
  --old-signer --ks android/app/debug.keystore --ks-pass pass:android \
    --ks-key-alias androiddebugkey --key-pass pass:android \
  --new-signer --ks ~/.my-claw/secrets/my-claw-app-release.jks --ks-pass env:P \
    --ks-key-alias my-claw-app --key-pass env:P
```

### Who signs

Not Gradle. The `release` build type has **no** `signingConfig`, so `assembleRelease` emits
`app-release-unsigned.apk`, which cannot be installed. A keystore Gradle can read is a keystore
this repository can leak, and that is the mistake being undone. `scripts/release.sh` signs, and it
is the only thing that does.

It reads the password straight from Vaultwarden into its own process (never a file, never a
command line, never printed), signs with **both** keys, and refuses to publish an APK whose signer
is not the release key -- with an explicit check for the debug fingerprint, so the old mistake
cannot come back quietly.

Both keys, because of the rotation range:

```
--lineage android/app/signing/lineage.bin --rotation-min-sdk-version 28
```

API 28 is the first release that reads v3, where the lineage lives. Below that a device only sees
v1/v2 and must keep being served by the original key, or it could not install an update at all;
apksigner refuses to sign without the old signer for exactly that reason. `minSdkVersion` is 24,
the fleet is on 13, so in practice every device lands on the release key:

| Device | Scheme | Signer |
|---|---|---|
| Android 9+ (API 28+) | v3 + lineage | `CN=my-claw-app` |
| Android 7-8 (24-27) | v1/v2 | `CN=Android Debug` |

Without `--rotation-min-sdk-version 28`, apksigner defaults to reserving rotation for Android 13+
(v3.1, a workaround for a rotation bug on 12 and below), and the debug key would still be the one
Android 9 through 12 trusted.

## The other half: the device checks too

Signing correctly is worth nothing if the app installs whatever it is handed. Before
`PackageInstaller.commit`, `installStagedApk` (`DeviceBridgeModule.kt`) refuses an archive that:

- is not this package (`packageName`),
- does not move forward (`longVersionCode` must exceed the installed one),
- is not signed by a key this install already trusts.

The last one compares the installed app's **current** signer against the archive's **proven**
signers: its current signer plus, when it carries a v3 lineage, its ancestors. That is what lets
the rotating update through -- the phone holds the debug key, the archive is signed by the release
key and proves the descent -- while refusing an APK signed by the debug key alone once the
rotation has happened. It mirrors the platform's own rule rather than inventing one.

Below API 28 there is no signing-certificate API; those devices are served by the original key and
the platform enforces the match itself.

A refused archive is deleted, not left staged, and the reason travels to JS as `APK_UNTRUSTED`.

## Releasing

Unchanged apart from the keystore having to be reachable. The vault must be unlocked, or
`MY_CLAW_APP_KEYSTORE_PASS` exported, otherwise the script stops before it publishes anything.

```sh
export JAVA_HOME=~/.sdkman/candidates/java/current ANDROID_HOME=~/android-sdk
(cd android && ./gradlew assembleRelease --no-daemon)
bash scripts/build-web.sh && tar -czf dist-web.tar.gz -C dist-web .
bash scripts/release.sh v<v> android/app/build/outputs/apk/release/app-release-unsigned.apk dist-web.tar.gz
```

Verifying what was published:

```sh
apksigner verify --min-sdk-version 28 --print-certs my-claw-app-v<v>.apk   # CN=my-claw-app
apksigner lineage --print-certs --in android/app/signing/lineage.bin       # two signers
```

## Overrides

| Variable | Default |
|---|---|
| `MY_CLAW_APP_KEYSTORE` | `~/.my-claw/secrets/my-claw-app-release.jks` |
| `MY_CLAW_APP_KEY_ALIAS` | `my-claw-app` |
| `MY_CLAW_APP_KEYSTORE_PASS` | read from the vault |
| `MY_CLAW_APP_KEYSTORE_ITEM` | `56c88f37-60fa-4975-a7f6-126a1ebfd51c` |
| `BW_SERVE_URL` | `http://127.0.0.1:8087` |
