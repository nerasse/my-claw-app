#!/usr/bin/env bash
set -euo pipefail

# One-command release flow: create a tagged release with the APK, then prune old APKs.
# The attachment is named after the version (my-claw-app-<version>.apk) so a build can
# always be told apart from the next one without looking at metadata.
# Usage: scripts/release.sh <version> <apk-path>
#   scripts/release.sh v0.2.16 android/app/build/outputs/apk/release/app-release.apk

if [[ "$#" -ne 2 ]]; then
  echo "usage: $0 <version> <apk-path>" >&2
  exit 1
fi

VERSION="$1"
APK="$2"
ASSET_NAME="my-claw-app-${VERSION}.apk"
MAP_ASSET_NAME="my-claw-app-${VERSION}.bundle.map"
MAP="android/app/build/generated/sourcemaps/react/release/index.android.bundle.map"

cd "$(dirname "$0")/.."

# fj names the attachment after the file; stage a copy with the versioned name.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$APK" "$tmp/$ASSET_NAME"

# The source map is what makes a crash report from this build readable, and it is only ever
# reproducible from this build. Attaching it to the release is the archive: a map left in
# android/app/build/ dies at the next clean, and then the reports it explains die with it.
if [[ -f "$MAP" ]]; then
  cp "$MAP" "$tmp/$MAP_ASSET_NAME"
else
  echo "warning: no source map at $MAP -- release crash reports will not be symbolicatable" >&2
fi

if fj release create "$VERSION" --create-tag --attach "$tmp/$ASSET_NAME" 2>/dev/null; then
  :
elif fj release asset create "$VERSION" "$tmp/$ASSET_NAME" "$ASSET_NAME"; then
  echo "release $VERSION already existed, added $ASSET_NAME"
else
  echo "release $VERSION already carries $ASSET_NAME, nothing to attach" >&2
fi

if [[ -f "$tmp/$MAP_ASSET_NAME" ]]; then
  fj release asset create "$VERSION" "$tmp/$MAP_ASSET_NAME" "$MAP_ASSET_NAME" \
    || echo "release $VERSION already carries $MAP_ASSET_NAME" >&2
fi

bash scripts/cleanup-apks.sh
