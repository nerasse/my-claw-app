#!/bin/sh
set -eu
cp "$SRCROOT/MyClawApp/Info.plist" "$DERIVED_FILE_DIR/MyClawApp-Info.plist"
if [ "$CONFIGURATION" = "Debug" ]; then
  /usr/libexec/PlistBuddy -c 'Set :NSAppTransportSecurity:NSAllowsArbitraryLoads true' "$DERIVED_FILE_DIR/MyClawApp-Info.plist"
fi
