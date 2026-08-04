#!/usr/bin/env bash
set -euo pipefail

# One-command release flow: create a tagged release with the APK, then prune old APKs.
# Usage: scripts/release.sh <version> <apk-path>
#   scripts/release.sh v0.1.3 android/app/build/outputs/apk/release/app-release.apk

if [[ "$#" -ne 2 ]]; then
  echo "usage: $0 <version> <apk-path>" >&2
  exit 1
fi

VERSION="$1"
APK="$2"

cd "$(dirname "$0")/.."
fj release create "$VERSION" --create-tag --attach "$APK"
bash scripts/cleanup-apks.sh
