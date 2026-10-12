#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo 'Usage: package-ios-artifacts.sh <xcarchive> <derived-data>' >&2
  exit 2
fi
archive=$1
derived=$2
bundle="$archive/Products/Applications/MyClawApp.app/main.jsbundle"
if [ ! -f "$bundle" ] || [ ! -d "$archive/dSYMs/MyClawApp.app.dSYM" ]; then
  echo 'Archive is missing its exact bundle or native symbols.' >&2
  exit 1
fi
map="$derived/Build/Intermediates.noindex/ArchiveIntermediates/MyClawApp/BuildProductsPath/Release-iphoneos/MyClawSymbols/MyClawApp.hermes.map"
if [ ! -f "$map" ]; then
  echo 'Archive source map is missing. Archive again with the RN Release phase enabled.' >&2
  exit 1
fi
mkdir -p "$archive/Artifacts"
cp "$map" "$archive/Artifacts/MyClawApp.hermes.map"
shasum -a 256 "$bundle" | awk '{print $1 "  main.jsbundle"}' > "$archive/Artifacts/SHA256SUMS"
echo "Saved Hermes map and exact bundle hash in $archive/Artifacts"
