#!/usr/bin/env bash
set -euo pipefail

# One-command release flow: create a tagged release with the APK, then prune old APKs.
# The attachment is named after the version (my-claw-app-<version>.apk) so a build can
# always be told apart from the next one without looking at metadata.
# The web bundle rides along when it is built: the server pulls it with `myclaw web install`,
# and a release without it leaves the browser client pinned to the previous version.
# Usage: scripts/release.sh <version> <apk-path> [web-tarball]
#   scripts/release.sh v0.2.16 android/app/build/outputs/apk/release/app-release.apk dist-web.tar.gz

if [[ "$#" -lt 2 || "$#" -gt 3 ]]; then
  echo "usage: $0 <version> <apk-path> [web-tarball]" >&2
  exit 1
fi

VERSION="$1"
APK="$2"
WEB_TARBALL="${3:-}"
ASSET_NAME="my-claw-app-${VERSION}.apk"
WEB_ASSET_NAME="dist-web.tar.gz"

cd "$(dirname "$0")/.."

# No CI sees this release, so this is the only guard: a tag that disagrees with the APK it
# carries publishes a mislabeled build, and the sourcemap regenerated from that tag will not
# match the shipped bundle (AGENTS.md, "Symbolicating a release stack").
DECLARED="$(sed -n 's/.*versionName "\(.*\)".*/\1/p' android/app/build.gradle | head -1)"
if [[ "$VERSION" != "v${DECLARED}" ]]; then
  echo "version mismatch: tag ${VERSION}, android/app/build.gradle says v${DECLARED}" >&2
  exit 1
fi

# fj names the attachment after the file; stage the signed APK under the versioned name.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Signing lives here and nowhere else. Gradle emits an unsigned APK on purpose: the key it
# used to hold was the React Native template's debug key, whose private half ships with every
# copy of the framework, and installStagedApk on the device now refuses anything not signed by
# the key below. The lineage is what lets an Android 9+ device accept the change of key over an
# app installed with the old one. See docs/release-signing.md.
DEBUG_FINGERPRINT="fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"
KEYSTORE="${MY_CLAW_APP_KEYSTORE:-$HOME/.my-claw/secrets/my-claw-app-release.jks}"
KEY_ALIAS="${MY_CLAW_APP_KEY_ALIAS:-my-claw-app}"
LINEAGE="android/app/signing/lineage.bin"
VAULT_API="${BW_SERVE_URL:-http://127.0.0.1:8087}"
VAULT_ITEM="${MY_CLAW_APP_KEYSTORE_ITEM:-56c88f37-60fa-4975-a7f6-126a1ebfd51c}"

[[ -f "$KEYSTORE" ]] || { echo "no keystore at $KEYSTORE (restore it from the vault item $VAULT_ITEM)" >&2; exit 1; }
[[ -f "$LINEAGE" ]] || { echo "no signing lineage at $LINEAGE" >&2; exit 1; }

APKSIGNER="$(ls -1 "${ANDROID_HOME:-$HOME/android-sdk}"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)"
[[ -x "${APKSIGNER:-}" ]] || { echo "apksigner not found: set ANDROID_HOME" >&2; exit 1; }
command -v keytool >/dev/null || { echo "keytool not on PATH: set JAVA_HOME/bin on PATH" >&2; exit 1; }

# The password is read straight from the vault into this process. It is never written to disk,
# never passed on a command line, and never printed.
if [[ -z "${MY_CLAW_APP_KEYSTORE_PASS:-}" ]]; then
  vault_status="$(curl -sf --max-time 5 "$VAULT_API/status" | jq -r '.data.template.status' 2>/dev/null || echo unreachable)"
  [[ "$vault_status" == "unlocked" ]] || {
    echo "keystore password unavailable: vault is ${vault_status}. Unlock it, or export MY_CLAW_APP_KEYSTORE_PASS." >&2
    exit 1
  }
  MY_CLAW_APP_KEYSTORE_PASS="$(curl -sf "$VAULT_API/object/item/$VAULT_ITEM" | jq -r '.data.login.password')"
fi
[[ -n "${MY_CLAW_APP_KEYSTORE_PASS:-}" && "$MY_CLAW_APP_KEYSTORE_PASS" != "null" ]] || { echo "empty keystore password" >&2; exit 1; }
export MY_CLAW_APP_KEYSTORE_PASS

# Both signers, in lineage order. Rotation starts at API 28, the first release that reads v3,
# so anything older keeps being served by the original key through v1/v2 and can still install
# an update; without the old signer here apksigner refuses outright. minSdkVersion is 24, and
# the fleet is on 13, so in practice every device lands on the release key.
"$APKSIGNER" sign \
  --ks android/app/debug.keystore --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android \
  --next-signer --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:MY_CLAW_APP_KEYSTORE_PASS --key-pass env:MY_CLAW_APP_KEYSTORE_PASS \
  --lineage "$LINEAGE" --rotation-min-sdk-version 28 --min-sdk-version 24 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false \
  --out "$tmp/$ASSET_NAME" "$APK"

# What an Android 9+ device actually verifies is the rotated signer, so ask about that range.
EXPECTED="$(keytool -list -keystore "$KEYSTORE" -storepass:env MY_CLAW_APP_KEYSTORE_PASS -alias "$KEY_ALIAS" -v \
  | sed -n 's/.*SHA256: //p' | head -1 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
CURRENT="$("$APKSIGNER" verify --min-sdk-version 28 --print-certs "$tmp/$ASSET_NAME" \
  | sed -n 's/.*certificate SHA-256 digest: //p' | head -1)"
unset MY_CLAW_APP_KEYSTORE_PASS

if [[ "$CURRENT" == "$DEBUG_FINGERPRINT" ]]; then
  echo "refusing to publish: the APK is still signed by the React Native debug key" >&2
  exit 1
fi
if [[ -z "$CURRENT" || "$CURRENT" != "$EXPECTED" ]]; then
  echo "refusing to publish: signer ${CURRENT:-none} is not the release key ${EXPECTED}" >&2
  exit 1
fi
echo "signed with ${CURRENT:0:16}... (lineage: debug -> release)"

# The source map is deliberately not attached: the bundle is reproducible bit for bit, so the
# map is regenerated from the tag when a crash needs reading, and the copy of the bundle inside
# this APK proves the regenerated one is the right one. See AGENTS.md.

if fj release view "$VERSION" >/dev/null 2>&1; then
  if fj release asset create "$VERSION" "$tmp/$ASSET_NAME" "$ASSET_NAME"; then
    echo "release $VERSION already existed, added $ASSET_NAME"
  else
    echo "release $VERSION already carries $ASSET_NAME, nothing to attach" >&2
  fi
else
  # The tag is usually already pushed by CI; fall back to --create-tag when it is not.
  # Plain `release create --create-tag` fails with 409 once the tag exists, which used to
  # fall through to a misleading "already carries" message.
  if ! fj release create "$VERSION" --tag "$VERSION" --attach "$tmp/$ASSET_NAME"; then
    fj release create "$VERSION" --create-tag --attach "$tmp/$ASSET_NAME"
  fi
  echo "created release $VERSION with $ASSET_NAME"
fi

if [[ -n "$WEB_TARBALL" ]]; then
  if [[ -f "$WEB_TARBALL" ]]; then
    cp "$WEB_TARBALL" "$tmp/$WEB_ASSET_NAME"
    fj release asset create "$VERSION" "$tmp/$WEB_ASSET_NAME" "$WEB_ASSET_NAME" \
      || echo "release $VERSION already carries $WEB_ASSET_NAME" >&2
  else
    echo "web tarball not found: $WEB_TARBALL" >&2
    exit 1
  fi
fi

bash scripts/cleanup-apks.sh
