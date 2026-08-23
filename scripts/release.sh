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

# fj names the attachment after the file; stage a copy with the versioned name.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$APK" "$tmp/$ASSET_NAME"

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
