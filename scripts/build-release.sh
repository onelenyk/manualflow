#!/usr/bin/env bash
# Build a self-contained ManualFlow release tarball for QA distribution.
#
# Output: dist/manualflow-<version>.tar.gz containing:
#   manualflow         (bash CLI; entry point)
#   server.js          (esbuild-bundled Node server)
#   agent.apk          (prebuilt androidTest agent APK)
#   static/            (prebuilt React dashboard)
#   VERSION
#   README.txt
#
# QA installs Node + adb + maestro via install.sh, then runs `manualflow start`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./packages/server/package.json').version" 2>/dev/null || echo "0.0.0")"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
STAMP="${VERSION}-${GIT_SHA}"
DIST_DIR="dist/manualflow-${STAMP}"
TARBALL="dist/manualflow-${STAMP}.tar.gz"

echo "→ Building ManualFlow release ${STAMP}"
rm -rf "$DIST_DIR" "$TARBALL"
mkdir -p "$DIST_DIR"

echo "→ [1/4] Building frontend bundle"
(cd dashboard/frontend && npx vite build) > /dev/null
cp -R dashboard/src/main/resources/static "$DIST_DIR/static"

echo "→ [2/4] Building agent APK"
./gradlew :agent:assembleDebugAndroidTest -q
cp agent/build/outputs/apk/androidTest/debug/agent-debug-androidTest.apk "$DIST_DIR/agent.apk"

echo "→ [3/4] Bundling server (esbuild → single JS)"
npx --yes esbuild packages/server/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile="$DIST_DIR/server.mjs" \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --log-level=warning

echo "→ [4/4] Assembling tarball"
cp scripts/manualflow "$DIST_DIR/manualflow"
chmod +x "$DIST_DIR/manualflow"
echo "$STAMP" > "$DIST_DIR/VERSION"
cat > "$DIST_DIR/README.txt" <<EOF
ManualFlow ${STAMP}

Prerequisites: Node 20+, adb, Maestro CLI (~/.maestro/bin/maestro), an Android device.
The install.sh script installs all of them via brew or apt.

Usage:
  ./manualflow doctor        # check prereqs
  ./manualflow start         # install agent on device + start server
  ./manualflow stop          # stop server + agent
  ./manualflow status        # show component state

Then open http://localhost:2344 in your browser.
EOF

tar -czf "$TARBALL" -C dist "manualflow-${STAMP}"

echo
echo "✅ Release built:"
echo "    $TARBALL"
echo "    $(du -h "$TARBALL" | cut -f1)"
