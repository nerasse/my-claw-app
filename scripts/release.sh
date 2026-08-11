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

cd "$(dirname "$0")/.."

# fj names the attachment after the file; stage a copy with the versioned name.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$APK" "$tmp/$ASSET_NAME"

# The source map is deliberately not attached: the bundle is reproducible bit for bit, so the
# map is regenerated from the tag when a crash needs reading, and the copy of the bundle inside
# this APK proves the regenerated one is the right one. See AGENTS.md.

if fj release create "$VERSION" --create-tag --attach "$tmp/$ASSET_NAME" 2>/dev/null; then
  :
elif fj release asset create "$VERSION" "$tmp/$ASSET_NAME" "$ASSET_NAME"; then
  echo "release $VERSION already existed, added $ASSET_NAME"
else
  echo "release $VERSION already carries $ASSET_NAME, nothing to attach" >&2
fi

bash scripts/cleanup-apks.sh
