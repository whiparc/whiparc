#!/usr/bin/env bash
set -euo pipefail

# Builds the universal (amd64+arm64) macOS .pkg installer for the whiparc
# CLI. Installs to /usr/local/bin — already on macOS's default PATH
# (/etc/paths), so no shell-profile editing is needed on this platform.
#
# Must run on an actual macOS machine: pkgbuild/lipo have no Linux/Windows
# equivalent, which is why this is its own CI job (see
# .github/workflows/cli-release.yml) instead of the shared Linux build
# matrix.
#
# Usage:
#   VERSION=1.2.3 \
#   AMD64_BINARY=./whiparc-darwin-amd64 \
#   ARM64_BINARY=./whiparc-darwin-arm64 \
#   ./installers/macos/build-pkg.sh

: "${VERSION:=0.0.0-dev}"
: "${AMD64_BINARY:?set AMD64_BINARY to the path of the darwin/amd64 build}"
: "${ARM64_BINARY:?set ARM64_BINARY to the path of the darwin/arm64 build}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

ROOT_DIR="$WORK_DIR/root"
mkdir -p "$ROOT_DIR/usr/local/bin"

lipo -create -output "$ROOT_DIR/usr/local/bin/whiparc" "$AMD64_BINARY" "$ARM64_BINARY"
chmod 755 "$ROOT_DIR/usr/local/bin/whiparc"
lipo -info "$ROOT_DIR/usr/local/bin/whiparc"

OUT="whiparc-macos.pkg"
pkgbuild \
  --root "$ROOT_DIR" \
  --identifier "dev.whiparc.cli" \
  --version "$VERSION" \
  --install-location "/" \
  "$OUT"

echo "Built $OUT"
