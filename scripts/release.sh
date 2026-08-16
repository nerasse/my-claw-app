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
