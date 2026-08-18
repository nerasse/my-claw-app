#!/usr/bin/env bash
set -euo pipefail

# Builds the web bundle the server serves, into dist-web/.
#
# It exists because CI and the release box each had their own copy of this recipe, and they
# drifted: the shipped tarball carried index.html and index.js only, so /sw.js, the manifest and
# the icons all fell through to the HTML shell. The browser refused a service worker served as
# text/html, which cost the PWA, the offline shell and web push. One script, one recipe.

cd "$(dirname "$0")/.."

OUT="dist-web"
rm -rf "$OUT"
mkdir -p "$OUT"

./node_modules/.bin/metro build index.web.js \
  --platform web --dev false \
  --config metro.config.web.js \
  --out "$OUT/index.js"

cp web/index.html "$OUT/index.html"
cp web/sw.js "$OUT/sw.js"
cp web/manifest.webmanifest "$OUT/manifest.webmanifest"
cp -r web/icons "$OUT/icons"

# Everything the shell and the manifest reference must be in the tarball: a missing one is
# invisible at build time and only shows up as a broken install in a browser.
for required in index.js index.html sw.js manifest.webmanifest icons/icon-192.png icons/icon-512.png; do
  test -f "$OUT/$required" || { echo "missing from $OUT: $required" >&2; exit 1; }
done

echo "$OUT ready:"
find "$OUT" -type f -printf '  %P (%s bytes)\n' | sort
