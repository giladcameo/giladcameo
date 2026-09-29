#!/usr/bin/env bash
# Builds BerlinTransit.saver (universal arm64 + x86_64, macOS 13+) without an
# Xcode project. Needs Xcode command line tools and Node 22+ (for the web
# bundle). Output: mac-screensaver/build/BerlinTransit.saver (ad-hoc signed).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/../native-app"
OUT="$HERE/build"
SAVER="$OUT/BerlinTransit.saver"
EXE=BerlinTransit
MIN_MACOS=13.0
VERSION="${SAVER_VERSION:-1.0}"
BUILD_NUMBER="${GITHUB_RUN_NUMBER:-1}"

# 1. Web bundle: same generated www/ as the phone apps (Leaflet bundled locally).
if [ ! -d "$APP_DIR/node_modules" ]; then
  (cd "$APP_DIR" && npm ci)
fi
(cd "$APP_DIR" && npm run sync-web)

# 2. Compile one slice per architecture, then merge.
rm -rf "$OUT"
mkdir -p "$OUT/obj"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
for ARCH in arm64 x86_64; do
  xcrun --sdk macosx swiftc \
    -O \
    -module-name BerlinTransitSaver \
    -target "$ARCH-apple-macos$MIN_MACOS" \
    -sdk "$SDK" \
    -emit-library \
    -framework ScreenSaver -framework WebKit -framework AppKit \
    -o "$OUT/obj/$EXE-$ARCH" \
    "$HERE"/Sources/*.swift
done

# 3. Assemble the bundle.
mkdir -p "$SAVER/Contents/MacOS" "$SAVER/Contents/Resources"
lipo -create "$OUT/obj/$EXE-arm64" "$OUT/obj/$EXE-x86_64" -output "$SAVER/Contents/MacOS/$EXE"
cp -R "$APP_DIR/www" "$SAVER/Contents/Resources/www"
cat > "$SAVER/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>$EXE</string>
  <key>CFBundleIdentifier</key><string>com.gcameo.berlintransit.saver</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Berlin Transit</string>
  <key>CFBundleDisplayName</key><string>Berlin Transit</string>
  <key>CFBundlePackageType</key><string>BNDL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
  <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
  <key>NSPrincipalClass</key><string>BerlinTransitView</string>
</dict>
</plist>
PLIST
plutil -lint "$SAVER/Contents/Info.plist"

# 4. Ad-hoc signature (not notarized - see native-app/README.md).
codesign --force --deep --sign - "$SAVER"
codesign --verify --verbose "$SAVER"
lipo -info "$SAVER/Contents/MacOS/$EXE"
echo "Built $SAVER"
